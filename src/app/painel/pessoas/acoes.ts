"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao, filtroDeEscopo, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";
import {
  id as idSchema,
  idOpcional,
  nomePessoa,
  emailOpcional,
  telefoneOpcional,
  dataOpcional,
  textoLimpo,
  textoLongo,
  cep as cepSchema,
  uf as ufSchema,
} from "@/lib/validation/comum";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Server Actions do cadastro de pessoas.
 *
 * Toda ação repete o mesmo ciclo, na mesma ordem:
 *   1. exigirPermissao()   — autentica, resolve o tenant pelo HOST e autoriza
 *   2. rate limit          — teto de escrita por usuário
 *   3. Zod.parse           — os argumentos são entrada não confiável
 *   4. ctx.db              — cliente já escopado ao tenant
 *   5. auditar()           — quem fez o quê
 *
 * Uma Server Action é um endpoint HTTP: o fato de ser chamada como função no
 * componente não impede ninguém de chamá-la direto com o payload que quiser.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  /** Preenchido no sucesso de `criarPessoa`, para o cliente navegar à ficha. */
  pessoaId?: string;
  /** Preenchido quando a criação foi barrada por suspeita de duplicidade. */
  duplicado?: { id: string; nome: string };
}

// -----------------------------------------------------------------------------
// Blocos de validação
// -----------------------------------------------------------------------------

/**
 * Campo opcional de formulário: string vazia vira `undefined` em vez de erro.
 * Sem isto, todo input não preenchido do formulário reprovaria a validação e o
 * usuário veria "campo inválido" em coisas que ele deliberadamente deixou em
 * branco.
 */
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );
}

/**
 * Checkbox de formulário.
 *
 * NÃO usamos `z.coerce.boolean()`: ele aplica a coerção do JavaScript, em que
 * QUALQUER string não vazia é `true` — inclusive a string "false". Um campo
 * serializado como "false" viraria um "sim" silencioso. Aqui a lista de valores
 * verdadeiros é explícita.
 */
const booleano = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

const GENEROS = ["MASCULINO", "FEMININO", "NAO_INFORMADO"] as const;
const ESTADOS_CIVIS = [
  "SOLTEIRO",
  "CASADO",
  "DIVORCIADO",
  "VIUVO",
  "UNIAO_ESTAVEL",
  "NAO_INFORMADO",
] as const;
const STATUS_PESSOA = [
  "VISITANTE",
  "EM_ACOMPANHAMENTO",
  "CONGREGANTE",
  "MEMBRO",
  "INATIVO",
  "TRANSFERIDO",
] as const;

const schemaPessoa = z.object({
  nome: nomePessoa,
  email: emailOpcional,
  telefone: telefoneOpcional,
  dataNascimento: dataOpcional,
  genero: z.enum(GENEROS).default("NAO_INFORMADO"),
  estadoCivil: z.enum(ESTADOS_CIVIS).default("NAO_INFORMADO"),
  status: z.enum(STATUS_PESSOA).default("VISITANTE"),

  cep: opcional(cepSchema),
  logradouro: opcional(textoLimpo(200)),
  numero: opcional(textoLimpo(20)),
  complemento: opcional(textoLimpo(100)),
  bairro: opcional(textoLimpo(100)),
  cidade: opcional(textoLimpo(100)),
  uf: opcional(ufSchema),

  dataConversao: dataOpcional,
  batizado: booleano,
  dataBatismo: dataOpcional,
  igrejaAnterior: opcional(textoLimpo(160)),

  celulaId: idOpcional,
  campusId: idOpcional,

  /** Dado sensível: só é gravado por quem tem `pessoas.lerSensivel`. */
  observacoesPastorais: opcional(textoLongo(5000)),

  consentimentoLgpd: booleano,

  /** O operador confirmou que quer criar mesmo havendo cadastro parecido. */
  confirmarDuplicado: booleano,
});

const schemaInteracao = z.object({
  tipo: z.enum(["LIGACAO", "VISITA", "MENSAGEM", "ORACAO", "OUTRO"]),
  descricao: textoLongo(2000, 3),
});

const schemaTransferencia = z.object({
  /** Vazio, nulo ou ausente = remover da célula sem colocar em outra. */
  celulaId: z
    .union([idSchema, z.null(), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  motivo: opcional(textoLimpo(200)),
});

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

export async function criarPessoa(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("pessoas.criar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaPessoa.parse(dadosBrutos);

    const erroData = validarDatas(dados);
    if (erroData) return erroData;

    const vinculo = await validarVinculos(ctx, dados.celulaId, dados.campusId);
    if (vinculo) return vinculo;

    /**
     * Teto do plano.
     *
     * `Tenant` é modelo GLOBAL (não tem tenantId), então é lido com o `prisma`
     * cru — este é um dos poucos casos legítimos. O limite existe para que uma
     * igreja não consuma sozinha a capacidade da VPS compartilhada, e precisa
     * ser conferido na escrita: conferir só na tela deixaria a Server Action
     * aberta para quem chamar direto.
     */
    const plano = await prisma.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { limitePessoas: true },
    });
    if (plano) {
      const cadastradas = await ctx.db.pessoa.count({ where: { excluidoEm: null } });
      if (cadastradas >= plano.limitePessoas) {
        return {
          ok: false,
          mensagem: `O plano desta igreja permite ${plano.limitePessoas.toLocaleString("pt-BR")} pessoas cadastradas. Fale com o suporte para ampliar.`,
        };
      }
    }

    /**
     * Antiduplicidade. Não é bloqueio absoluto: dois irmãos podem dividir o
     * mesmo telefone de casa. Por isso o operador pode confirmar e seguir —
     * mas precisa fazer isso conscientemente, e não por acidente.
     */
    if (!dados.confirmarDuplicado && (dados.email || dados.telefone)) {
      const parecido = await ctx.db.pessoa.findFirst({
        where: {
          excluidoEm: null,
          OR: [
            ...(dados.email ? [{ email: dados.email }] : []),
            ...(dados.telefone ? [{ telefone: dados.telefone }] : []),
          ],
        },
        select: { id: true, nome: true },
      });

      if (parecido) {
        return {
          ok: false,
          mensagem: `Já existe um cadastro com esse contato: ${parecido.nome}. Verifique antes de criar outro.`,
          duplicado: parecido,
        };
      }
    }

    const pessoa = await ctx.db.pessoa.create({
      data: {
        ...camposComuns(ctx, dados),
        origem: "PAINEL",
        // A origem do consentimento é a prova de POR QUAL caminho a pessoa
        // autorizou o tratamento. "painel" = colhido presencialmente pela
        // equipe, que é quem responde por ele.
        consentimentoLgpd: dados.consentimentoLgpd,
        consentimentoEm: dados.consentimentoLgpd ? new Date() : null,
        consentimentoOrigem: dados.consentimentoLgpd ? "painel" : null,
      },
      select: { id: true, nome: true },
    });

    await auditar(ctx, {
      acao: "pessoa.criar",
      alvoTipo: "Pessoa",
      alvoId: pessoa.id,
      detalhes: {
        origem: "painel",
        status: dados.status,
        comCelula: Boolean(dados.celulaId),
        consentimentoLgpd: dados.consentimentoLgpd,
      },
    });

    revalidatePath("/painel/pessoas");
    revalidatePath("/painel");

    return { ok: true, mensagem: "Cadastro criado.", pessoaId: pessoa.id };
  } catch (erro) {
    return traduzirErro(erro, "criarPessoa");
  }
}

// -----------------------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------------------

export async function atualizarPessoa(
  pessoaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("pessoas.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(pessoaId);
    const dados = schemaPessoa.parse(dadosBrutos);

    const erroData = validarDatas(dados);
    if (erroData) return erroData;

    /**
     * Leitura prévia COM o filtro de escopo.
     *
     * O `ctx.db` garante o recorte de tenant, mas não o recorte por papel: um
     * líder de célula continuaria alcançando o ID de alguém de outra célula.
     * A verificação de propriedade acontece aqui, antes do update, e o update
     * roda por ID já validado.
     */
    const atual = await ctx.db.pessoa.findFirst({
      where: { id, excluidoEm: null, ...filtroDeEscopo(ctx) },
      select: {
        id: true,
        status: true,
        celulaId: true,
        consentimentoLgpd: true,
      },
    });
    if (!atual) return { ok: false, mensagem: "Cadastro não encontrado." };

    const vinculo = await validarVinculos(ctx, dados.celulaId, dados.campusId);
    if (vinculo) return vinculo;

    await ctx.db.pessoa.update({
      where: { id },
      data: {
        ...camposComuns(ctx, dados),
        // O consentimento só é MARCADO aqui; nunca desmarcado por edição
        // comum. Revogação de consentimento é um ato do titular, tratado em
        // fluxo próprio — não pode acontecer como efeito colateral de alguém
        // salvar o formulário com o checkbox desmarcado por engano.
        ...(dados.consentimentoLgpd && !atual.consentimentoLgpd
          ? {
              consentimentoLgpd: true,
              consentimentoEm: new Date(),
              consentimentoOrigem: "painel",
            }
          : {}),
      },
    });

    await auditar(ctx, {
      acao: "pessoa.atualizar",
      alvoTipo: "Pessoa",
      alvoId: id,
      // Os VALORES não vão para a auditoria — o log viraria uma segunda cópia
      // da ficha, com retenção maior e controle de acesso menor. Registramos o
      // que mudou de estrutural, que é o que a investigação precisa.
      detalhes: {
        statusAnterior: atual.status,
        statusNovo: dados.status,
        mudouCelula: (atual.celulaId ?? null) !== (dados.celulaId ?? null),
        tocouObservacoesPastorais:
          ctx.pode("pessoas.lerSensivel") && dados.observacoesPastorais !== undefined,
      },
    });

    revalidatePath("/painel/pessoas");
    revalidatePath(`/painel/pessoas/${id}`);

    return { ok: true, mensagem: "Cadastro atualizado.", pessoaId: id };
  } catch (erro) {
    return traduzirErro(erro, "atualizarPessoa");
  }
}

// -----------------------------------------------------------------------------
// Excluir (LÓGICA)
// -----------------------------------------------------------------------------

/**
 * Exclui uma pessoa marcando `excluidoEm`. Exclusão LÓGICA, e isso é uma
 * decisão deliberada — o oposto do que fazemos com pedido de oração, que é
 * apagado de verdade (ver src/app/painel/oracao/acoes.ts).
 *
 * POR QUE LÓGICA AQUI
 * A ficha de uma pessoa é o centro de um grafo: batismos, matrículas em
 * cursos, histórico de interações, presença em célula, pedidos vinculados.
 * Apagá-la de verdade faria uma de duas coisas ruins:
 *   - cascatear e destruir o histórico ministerial da igreja (quem foi
 *     batizado em 2019 é registro da instituição, não só da pessoa); ou
 *   - deixar referências órfãs espalhadas pelo banco.
 * Além disso, o gesto real por trás deste botão quase nunca é "apague meus
 * dados": é "esta pessoa saiu", "este cadastro está duplicado", "a secretária
 * clicou errado". Para todos esses, `excluidoEm` é a resposta certa — some da
 * operação, preserva a integridade e permite desfazer.
 *
 * POR QUE FÍSICA NO PEDIDO DE ORAÇÃO
 * Lá o registro é autocontido (não sustenta o histórico de mais nada) e o
 * pedido de exclusão significa literalmente "não quero mais isso guardado".
 * É o direito de eliminação da LGPD sobre dado sensível de saúde e família —
 * e "marcar como excluído" não atende a esse direito: o texto continuaria na
 * tabela, legível por quem tivesse acesso ao banco.
 *
 * QUANDO O TITULAR EXIGE ELIMINAÇÃO DA FICHA INTEIRA
 * Aí não é este botão: é o fluxo de anonimização/eliminação definitiva, que
 * precisa também tratar submissões, interações e vínculos. Este aqui é
 * exclusão operacional.
 */
export async function excluirPessoa(
  pessoaId: string,
  motivoBruto?: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("pessoas.excluir");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(pessoaId);
    const motivo = opcional(textoLimpo(200)).parse(motivoBruto);

    const pessoa = await ctx.db.pessoa.findFirst({
      where: { id, excluidoEm: null, ...filtroDeEscopo(ctx) },
      select: { id: true, status: true, userId: true },
    });
    if (!pessoa) return { ok: false, mensagem: "Cadastro não encontrado." };

    await ctx.db.pessoa.update({
      where: { id },
      data: {
        excluidoEm: new Date(),
        // Sai das listas de acompanhamento junto com a exclusão: um registro
        // "excluído" que continua como MEMBRO nas estatísticas seria pior que
        // não ter excluído.
        status: "INATIVO",
      },
    });

    await auditar(ctx, {
      acao: "pessoa.excluir",
      alvoTipo: "Pessoa",
      alvoId: id,
      detalhes: { tipo: "logica", statusAnterior: pessoa.status, motivo: motivo ?? null },
    });

    revalidatePath("/painel/pessoas");
    revalidatePath(`/painel/pessoas/${id}`);

    return { ok: true, mensagem: "Cadastro removido das listas." };
  } catch (erro) {
    return traduzirErro(erro, "excluirPessoa");
  }
}

// -----------------------------------------------------------------------------
// Histórico pastoral
// -----------------------------------------------------------------------------

/**
 * Registra um contato pastoral (ligação, visita, mensagem) na ficha.
 *
 * A permissão exigida é `pessoas.ler`, e não `pessoas.editar`, por decisão de
 * modelagem: a interação é um registro APPEND-ONLY sobre o acompanhamento, não
 * uma alteração do cadastro. Exigir `pessoas.editar` deixaria de fora
 * justamente o líder de célula — que é quem faz a visita e a ligação. O que
 * impede o abuso não é a permissão, é o `filtroDeEscopo`: o líder só alcança as
 * pessoas da célula dele.
 */
export async function registrarInteracao(
  pessoaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("pessoas.ler");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitos registros seguidos. Aguarde um instante." };
    }

    const id = idSchema.parse(pessoaId);
    const dados = schemaInteracao.parse(dadosBrutos);

    const pessoa = await ctx.db.pessoa.findFirst({
      where: { id, excluidoEm: null, ...filtroDeEscopo(ctx) },
      select: { id: true },
    });
    if (!pessoa) return { ok: false, mensagem: "Cadastro não encontrado." };

    await ctx.db.interacao.create({
      data: {
        pessoaId: pessoa.id,
        tipo: dados.tipo,
        descricao: dados.descricao,
        autorId: ctx.sessao.userId,
        autorNome: ctx.sessao.nome,
      },
    });

    await auditar(ctx, {
      acao: "pessoa.interacao",
      alvoTipo: "Pessoa",
      alvoId: pessoa.id,
      // Só o TIPO. O texto da interação é conteúdo pastoral e fica na própria
      // Interacao, que já é lida sob permissão.
      detalhes: { tipo: dados.tipo },
    });

    revalidatePath(`/painel/pessoas/${pessoa.id}`);
    return { ok: true, mensagem: "Contato registrado no histórico." };
  } catch (erro) {
    return traduzirErro(erro, "registrarInteracao");
  }
}

// -----------------------------------------------------------------------------
// Transferência de célula
// -----------------------------------------------------------------------------

/** Move a pessoa para outra célula (ou a deixa sem célula, com `celulaId` nulo). */
export async function transferirCelula(
  pessoaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("pessoas.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(pessoaId);
    const dados = schemaTransferencia.parse(dadosBrutos);

    const pessoa = await ctx.db.pessoa.findFirst({
      where: { id, excluidoEm: null, ...filtroDeEscopo(ctx) },
      select: { id: true, nome: true, celula: { select: { id: true, nome: true } } },
    });
    if (!pessoa) return { ok: false, mensagem: "Cadastro não encontrado." };

    let destino: { id: string; nome: string } | null = null;

    if (dados.celulaId) {
      // A célula de destino é lida pelo cliente escopado: um ID de outra
      // igreja simplesmente não existe aqui, e a mensagem de erro é a mesma
      // de "não existe" para não virar oráculo de IDs válidos.
      destino = await ctx.db.celula.findFirst({
        where: { id: dados.celulaId, ativa: true },
        select: { id: true, nome: true },
      });
      if (!destino) return { ok: false, mensagem: "Célula de destino não encontrada." };
    }

    if ((pessoa.celula?.id ?? null) === (destino?.id ?? null)) {
      return { ok: false, mensagem: "A pessoa já está nesta célula." };
    }

    await ctx.db.pessoa.update({
      where: { id },
      data: { celulaId: destino?.id ?? null },
    });

    // A transferência entra no histórico da pessoa. Sem isso, daqui a um ano
    // ninguém saberia por que ela mudou de célula — e o líder novo receberia
    // alguém sem contexto nenhum.
    await ctx.db.interacao
      .create({
        data: {
          pessoaId: pessoa.id,
          tipo: "OUTRO",
          descricao: destino
            ? `Transferida de ${pessoa.celula?.nome ?? "sem célula"} para ${destino.nome}.` +
              (dados.motivo ? ` Motivo: ${dados.motivo}` : "")
            : `Removida da célula ${pessoa.celula?.nome ?? "—"}.` +
              (dados.motivo ? ` Motivo: ${dados.motivo}` : ""),
          autorId: ctx.sessao.userId,
          autorNome: ctx.sessao.nome,
        },
      })
      .catch(() => {
        /* histórico é complementar; a transferência em si já aconteceu */
      });

    await auditar(ctx, {
      acao: "pessoa.transferirCelula",
      alvoTipo: "Pessoa",
      alvoId: pessoa.id,
      detalhes: { celulaAnterior: pessoa.celula?.id ?? null, celulaNova: destino?.id ?? null },
    });

    revalidatePath(`/painel/pessoas/${pessoa.id}`);
    revalidatePath("/painel/celulas");

    return {
      ok: true,
      mensagem: destino ? `Transferida para ${destino.nome}.` : "Removida da célula.",
    };
  } catch (erro) {
    return traduzirErro(erro, "transferirCelula");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

type DadosPessoa = z.infer<typeof schemaPessoa>;

/**
 * Campos que criar e atualizar têm em comum.
 *
 * Repare no tratamento de `observacoesPastorais`: quem não tem
 * `pessoas.lerSensivel` nem sequer recebe o campo do servidor na leitura, mas
 * poderia enviá-lo na escrita (a Server Action aceita qualquer payload).
 * Omitir a chave — em vez de gravar `null` — faz o Prisma não tocar na coluna,
 * preservando o que o pastor escreveu.
 */
function camposComuns(ctx: ContextoAutorizado, dados: DadosPessoa) {
  const podeSensivel = ctx.pode("pessoas.lerSensivel");

  return {
    nome: dados.nome,
    email: dados.email ?? null,
    telefone: dados.telefone ?? null,
    dataNascimento: paraData(dados.dataNascimento),
    genero: dados.genero,
    estadoCivil: dados.estadoCivil,
    status: dados.status,

    cep: dados.cep ?? null,
    logradouro: dados.logradouro ?? null,
    numero: dados.numero ?? null,
    complemento: dados.complemento ?? null,
    bairro: dados.bairro ?? null,
    cidade: dados.cidade ?? null,
    uf: dados.uf ?? null,

    dataConversao: paraData(dados.dataConversao),
    batizado: dados.batizado,
    dataBatismo: paraData(dados.dataBatismo),
    igrejaAnterior: dados.igrejaAnterior ?? null,

    celulaId: dados.celulaId ?? null,
    campusId: dados.campusId ?? null,

    ...(podeSensivel ? { observacoesPastorais: dados.observacoesPastorais ?? null } : {}),
  };
}

/** Converte "AAAA-MM-DD" em Date à meia-noite UTC (colunas são @db.Date). */
function paraData(valor?: string): Date | null {
  if (!valor) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Coerência entre datas. O Zod valida o FORMATO; estas são regras de mundo
 * real, que o formato não pega: nascer amanhã, converter-se antes de nascer.
 */
function validarDatas(dados: DadosPessoa): ResultadoAcao | null {
  const hoje = new Date();
  const nascimento = paraData(dados.dataNascimento);

  if (nascimento) {
    if (nascimento > hoje) {
      return { ok: false, mensagem: "Dados inválidos.", campos: { dataNascimento: ["A data de nascimento não pode estar no futuro."] } };
    }
    if (nascimento.getUTCFullYear() < 1900) {
      return { ok: false, mensagem: "Dados inválidos.", campos: { dataNascimento: ["Verifique o ano de nascimento."] } };
    }
  }

  const conversao = paraData(dados.dataConversao);
  if (conversao && conversao > hoje) {
    return { ok: false, mensagem: "Dados inválidos.", campos: { dataConversao: ["A data de conversão não pode estar no futuro."] } };
  }
  if (conversao && nascimento && conversao < nascimento) {
    return { ok: false, mensagem: "Dados inválidos.", campos: { dataConversao: ["A conversão não pode ser anterior ao nascimento."] } };
  }

  const batismo = paraData(dados.dataBatismo);
  if (batismo && batismo > hoje) {
    return { ok: false, mensagem: "Dados inválidos.", campos: { dataBatismo: ["A data do batismo não pode estar no futuro."] } };
  }

  return null;
}

/**
 * Confirma que célula e campus informados existem NESTA igreja.
 *
 * Sem esta checagem o Prisma lançaria uma violação de chave estrangeira, e o
 * erro cru do banco (com nome de constraint e de tabela) chegaria perto do
 * usuário. Além disso, um ID de outra igreja precisa dar "não encontrado" —
 * nunca um erro diferente, que revelaria que aquele ID existe em algum lugar.
 */
async function validarVinculos(
  ctx: ContextoAutorizado,
  celulaId?: string,
  campusId?: string,
): Promise<ResultadoAcao | null> {
  if (celulaId) {
    const celula = await ctx.db.celula.findFirst({ where: { id: celulaId }, select: { id: true } });
    if (!celula) {
      return { ok: false, mensagem: "Dados inválidos.", campos: { celulaId: ["Célula não encontrada."] } };
    }
  }

  if (campusId) {
    const campus = await ctx.db.campus.findFirst({ where: { id: campusId }, select: { id: true } });
    if (!campus) {
      return { ok: false, mensagem: "Dados inválidos.", campos: { campusId: ["Campus não encontrado."] } };
    }
  }

  return null;
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) {
      (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    }
    return { ok: false, mensagem: "Confira os campos destacados.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") {
    return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  }
  if (nome === "NaoAutorizadoError") {
    return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  }
  if (nome === "ViolacaoTenantError") {
    // Para o usuário, "não encontrado" — a mesma resposta de um ID inexistente.
    // Diferenciar transformaria a ação num detector de IDs de outras igrejas.
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Cadastro não encontrado." };
  }

  // Erro do Prisma nunca chega ao usuário: a mensagem carrega query, colunas e
  // às vezes os próprios parâmetros (dados pessoais).
  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
