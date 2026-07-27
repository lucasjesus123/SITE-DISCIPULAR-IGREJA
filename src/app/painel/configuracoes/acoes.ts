"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
// Uso auditado (SEC-006): apenas modelos GLOBAIS (Tenant/User/Membership/Sessao),
// sempre com tenantId à mão ou alvo resolvido no escopo antes de mutar. Ver AUDITORIA_SEGURANCA.md §5.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/db/prisma";
import { comTransacaoTenant } from "@/lib/db/tenant-client";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite, type RegraLimite } from "@/lib/security/rate-limit";
import { id as idSchema, textoLimpo } from "@/lib/validation/comum";

/**
 * =============================================================================
 * CONFIGURAÇÕES DA IGREJA + LGPD
 * =============================================================================
 *
 * Duas naturezas de dado convivem aqui, e a diferença define o cliente usado:
 *
 *   - `Tenant` (nome, razão social, CNPJ) é modelo GLOBAL. Vai por `prisma`,
 *     com `where: { id: ctx.tenant.id }` — e esse id vem de `exigirPermissao()`,
 *     que o resolve pelo HOSTNAME. Jamais de argumento.
 *   - `SiteConfig` e `LiveConfig` são dados de igreja. Vão por `ctx.db`, que
 *     injeta o escopo sozinho.
 *
 * O QUE ESTA TELA DELIBERADAMENTE NÃO EDITA
 * `slug`, `status`, `plano`, `limiteUsuarios`, `limitePessoas` e
 * `limiteStorageMb`. São decisões comerciais da plataforma. Se um admin de
 * igreja pudesse mudar `limiteUsuarios`, o teto de plano viraria enfeite; se
 * pudesse mudar `status`, reativaria sozinho uma igreja suspensa por
 * inadimplência. O schema Zod abaixo é uma lista fechada justamente para que
 * um campo extra enviado no formulário seja ignorado, e não gravado.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
}

export interface ResultadoExportacao extends ResultadoAcao {
  /** JSON já serializado. O navegador transforma em arquivo; nada é salvo no servidor. */
  conteudo?: string;
  nomeArquivo?: string;
}

/**
 * Fusos horários aceitos — lista fechada de zonas IANA brasileiras.
 *
 * O valor vai parar em `Intl.DateTimeFormat({ timeZone })` na renderização de
 * agenda e transmissão. Um valor livre faria essa chamada lançar `RangeError`
 * em toda página que formata data — ou seja, um campo de texto seria um botão
 * de "derrubar o site da minha própria igreja". Allowlist resolve na entrada.
 */
const FUSOS = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Maceio",
  "America/Belem",
  "America/Araguaina",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Manaus",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Eirunepe",
  "America/Noronha",
] as const;

/**
 * Módulos que podem ser ligados/desligados.
 *
 * `SiteConfig.modulos` é uma coluna Json. Gravar ali o objeto que veio do
 * formulário seria aceitar estrutura arbitrária de um usuário: bastaria enviar
 * `{"__proto__": {...}}` ou uma chave que algum código futuro leia sem
 * conferir para transformar um checkbox numa injeção de configuração. Por isso
 * reconstruímos o objeto do zero, chave por chave, a partir desta lista.
 */
const MODULOS = [
  "oracao",
  "batismo",
  "celulas",
  "cursos",
  "mensagens",
  "agenda",
  "aoVivo",
  "contribuicao",
  "app",
] as const;

/**
 * Rate limit próprio da exportação LGPD.
 *
 * Cada chamada devolve o dossiê completo de uma pessoa — nome, endereço,
 * telefone, jornada de fé, pedidos de oração. É a operação de maior densidade
 * de dado pessoal do sistema inteiro. O balde genérico do painel (120/min)
 * permitiria a uma conta de admin comprometida baixar a base de membros em
 * minutos; 20 por hora mantém o uso legítimo (atender pedidos de titular é
 * raro e pontual) e transforma a extração em massa em algo lento e barulhento
 * na auditoria.
 */
const REGRA_EXPORTACAO_LGPD: RegraLimite = {
  escopo: "lgpd-exportar",
  maximo: 20,
  janelaSegundos: 3_600,
  bloqueioSegundos: 3_600,
};

/** Exclusão definitiva: ainda mais rara que a exportação. */
const REGRA_EXCLUSAO_LGPD: RegraLimite = {
  escopo: "lgpd-excluir",
  maximo: 10,
  janelaSegundos: 3_600,
  bloqueioSegundos: 3_600,
};

// -----------------------------------------------------------------------------
// Dados da igreja
// -----------------------------------------------------------------------------

const schemaDadosIgreja = z.object({
  nome: textoLimpo(160, 3),
  razaoSocial: z
    .union([textoLimpo(200), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  cnpj: z
    .union([
      z
        .string()
        .trim()
        .transform((v) => v.replace(/\D/g, ""))
        .pipe(z.string().length(14, "CNPJ deve ter 14 dígitos."))
        // Dígito verificador: sem ele, "11111111111111" e qualquer sequência de
        // 14 dígitos entrariam como CNPJ válido e o documento fiscal da igreja
        // nasceria errado — descoberto só quando alguém emite um recibo.
        .refine(cnpjValido, "CNPJ inválido: os dígitos verificadores não conferem."),
      z.literal(""),
    ])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  fusoHorario: z.enum(FUSOS),
});

export async function salvarDadosDaIgreja(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("config.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaDadosIgreja.parse(dadosBrutos);

    const antes = await prisma.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { nome: true, razaoSocial: true, cnpj: true },
    });
    if (!antes) return { ok: false, mensagem: "Igreja não encontrada." };

    // `Tenant` é global: o filtro é este `id`, vindo do hostname resolvido.
    await prisma.tenant.update({
      where: { id: ctx.tenant.id },
      data: {
        nome: dados.nome,
        razaoSocial: dados.razaoSocial ?? null,
        cnpj: dados.cnpj ?? null,
      },
    });

    // O fuso mora em `LiveConfig` (é o que decide as janelas de culto). Modelo
    // de igreja, portanto pelo cliente escopado.
    await ctx.db.liveConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      // `tenantId` é injetado pela extensão de escopo; declarar aqui satisfaz
      // os tipos do Prisma e a extensão recusa qualquer valor divergente — a
      // redundância é verificada, não confiada.
      create: { tenantId: ctx.tenant.id, fusoHorario: dados.fusoHorario },
      update: { fusoHorario: dados.fusoHorario },
    });

    await auditar(ctx, {
      acao: "config.alterarDados",
      alvoTipo: "Tenant",
      alvoId: ctx.tenant.id,
      detalhes: {
        antes: { nome: antes.nome, razaoSocial: antes.razaoSocial, temCnpj: antes.cnpj !== null },
        depois: { nome: dados.nome, razaoSocial: dados.razaoSocial, temCnpj: dados.cnpj !== undefined },
        fusoHorario: dados.fusoHorario,
      },
    });

    revalidatePath("/painel/configuracoes");
    revalidatePath("/painel");

    return { ok: true, mensagem: "Dados da igreja atualizados." };
  } catch (erro) {
    return traduzirErro(erro, "salvarDadosDaIgreja");
  }
}

// -----------------------------------------------------------------------------
// Módulos
// -----------------------------------------------------------------------------

/** O formulário manda "on" para checkbox marcado e simplesmente omite o campo
 *  quando desmarcado — daí o `.optional()` com fallback para `false`. */
const caixa = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("1")])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

const schemaModulos = z.object({
  oracao: caixa,
  batismo: caixa,
  celulas: caixa,
  cursos: caixa,
  mensagens: caixa,
  agenda: caixa,
  aoVivo: caixa,
  contribuicao: caixa,
  app: caixa,
});

export async function salvarModulos(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("config.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaModulos.parse(dadosBrutos);

    /**
     * Objeto reconstruído do zero. Nem o resultado do Zod é repassado direto:
     * montamos um `Record<string, boolean>` percorrendo a allowlist, de modo
     * que a coluna Json só possa conter as chaves que este arquivo conhece.
     */
    const modulos: Record<string, boolean> = {};
    for (const chave of MODULOS) {
      modulos[chave] = dados[chave] === true;
    }

    const config = await ctx.db.siteConfig.findFirst({ select: { id: true, modulos: true } });
    if (!config) {
      return {
        ok: false,
        mensagem: "A configuração do site desta igreja ainda não foi criada. Fale com o suporte.",
      };
    }

    await ctx.db.siteConfig.update({
      where: { id: config.id },
      data: { modulos: modulos as Prisma.InputJsonValue },
    });

    await auditar(ctx, {
      acao: "config.alterarModulos",
      alvoTipo: "SiteConfig",
      alvoId: config.id,
      detalhes: { antes: config.modulos, depois: modulos },
    });

    revalidatePath("/painel/configuracoes");
    // O site público lê `modulos` para montar o menu: precisa refletir na hora.
    revalidatePath("/", "layout");

    return { ok: true, mensagem: "Módulos atualizados." };
  } catch (erro) {
    return traduzirErro(erro, "salvarModulos");
  }
}

// -----------------------------------------------------------------------------
// LGPD — direito de acesso e portabilidade (art. 18, II e V)
// -----------------------------------------------------------------------------

/**
 * Exporta tudo o que a igreja guarda sobre uma pessoa, em JSON.
 *
 * POR QUE ISTO EXISTE
 * A igreja é a CONTROLADORA dos dados. Quando um membro pede "o que vocês têm
 * sobre mim?", a resposta precisa ser completa e em formato legível por
 * máquina — é o direito de acesso somado ao de portabilidade. Um sistema sem
 * este botão obriga alguém a montar a resposta na mão, consultando o banco: um
 * processo que ninguém audita e que sempre esquece uma tabela.
 *
 * POR QUE A EXPORTAÇÃO É AUDITADA E LIMITADA
 * O mesmo botão que atende o titular também serve para extrair o dossiê de
 * qualquer membro. Auditoria e rate limit são o que separa "atendemos um
 * pedido de titular" de "alguém baixou a ficha de 300 pessoas numa madrugada".
 * A entrada no AuditLog é o registro que a própria igreja vai consultar se
 * desconfiar de acesso indevido.
 */
export async function exportarDadosPessoa(pessoaIdBruto: string): Promise<ResultadoExportacao> {
  try {
    const ctx = await exigirPermissao("config.gerenciar");

    // Dupla exigência: além de administrar a igreja, é preciso ter a permissão
    // de exportar pessoas. Hoje as duas moram no mesmo papel; amanhã a matriz
    // pode separá-las, e esta linha garante que a separação valha aqui também.
    if (!ctx.pode("pessoas.exportar")) {
      return { ok: false, mensagem: "Você não tem permissão para esta ação." };
    }

    const limite = await verificarLimite(REGRA_EXPORTACAO_LGPD, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return {
        ok: false,
        mensagem: `Limite de exportações atingido. Tente novamente em ${Math.ceil(limite.tentarEmSegundos / 60)} min.`,
      };
    }

    const pessoaId = idSchema.parse(pessoaIdBruto);

    // Toda leitura por `ctx.db`: um id de outra igreja simplesmente não existe
    // neste escopo, e a resposta é a mesma de um id inexistente.
    const pessoa = await ctx.db.pessoa.findFirst({
      where: { id: pessoaId },
      select: {
        id: true, nome: true, email: true, telefone: true, dataNascimento: true,
        genero: true, estadoCivil: true, status: true, origem: true,
        cep: true, logradouro: true, numero: true, complemento: true,
        bairro: true, cidade: true, uf: true,
        dataConversao: true, batizado: true, dataBatismo: true, igrejaAnterior: true,
        observacoesPastorais: true,
        consentimentoLgpd: true, consentimentoEm: true, consentimentoOrigem: true,
        criadoEm: true, atualizadoEm: true, excluidoEm: true,
        celula: { select: { nome: true } },
        campus: { select: { nome: true } },
      },
    });

    if (!pessoa) return { ok: false, mensagem: "Pessoa não encontrada." };

    const [interacoes, oracoes, batismos, matriculas, submissoes] = await Promise.all([
      ctx.db.interacao.findMany({
        where: { pessoaId },
        orderBy: { criadoEm: "asc" },
        select: { tipo: true, descricao: true, autorNome: true, criadoEm: true },
        take: 1_000,
      }),
      ctx.db.pedidoOracao.findMany({
        where: { pessoaId },
        orderBy: { criadoEm: "asc" },
        // `ipHash` fica de fora: é pseudônimo interno para investigar abuso,
        // não informação útil para o titular, e devolvê-lo só ampliaria a
        // superfície do arquivo exportado.
        select: {
          categoria: true, titulo: true, pedido: true, urgente: true,
          visibilidade: true, status: true, anonimo: true,
          respostaTestemunho: true, respondidoEm: true, criadoEm: true,
        },
        take: 500,
      }),
      ctx.db.solicitacaoBatismo.findMany({
        where: { pessoaId },
        orderBy: { criadoEm: "asc" },
        select: {
          status: true, respostas: true, menorIdade: true, responsavelNome: true,
          turmaPreparatoria: true, dataBatismo: true, observacoes: true,
          motivoRecusa: true, criadoEm: true,
        },
        take: 50,
      }),
      ctx.db.matricula.findMany({
        where: { pessoaId },
        orderBy: { criadoEm: "asc" },
        select: {
          status: true, observacoes: true, criadoEm: true,
          curso: { select: { nome: true } },
        },
        take: 200,
      }),
      // `Submissao.pessoaGeradaId` não é chave estrangeira (é VarChar), então a
      // ligação é feita por igualdade — sempre dentro do escopo do tenant.
      ctx.db.submissao.findMany({
        where: { pessoaGeradaId: pessoaId },
        orderBy: { criadoEm: "asc" },
        select: {
          tipo: true, status: true, nome: true, email: true, telefone: true,
          dados: true, origem: true, paginaOrigem: true,
          consentimentoLgpd: true, notaInterna: true, criadoEm: true,
        },
        take: 200,
      }),
    ]);

    const dossie = {
      _sobre: {
        descricao:
          "Exportação de dados pessoais gerada pelo sistema Discipular, a pedido do titular ou de quem o representa (LGPD, art. 18, II e V).",
        igreja: ctx.tenant.nome,
        geradoEm: new Date().toISOString(),
        aviso:
          "Este arquivo inclui observações pastorais e o conteúdo de pedidos de oração. Revise antes de entregar e transmita por canal seguro: é o documento com maior concentração de dado sensível que a igreja produz.",
      },
      pessoa,
      interacoes,
      pedidosOracao: oracoes,
      solicitacoesBatismo: batismos,
      matriculas,
      submissoes,
    };

    // Serializado aqui e devolvido como string. Nenhum arquivo é escrito no
    // servidor: um dossiê esquecido em /tmp é vazamento esperando acontecer.
    const conteudo = JSON.stringify(dossie, null, 2);

    await auditar(ctx, {
      acao: "lgpd.exportarPessoa",
      alvoTipo: "Pessoa",
      alvoId: pessoaId,
      // Contagens, nunca conteúdo: a auditoria registra QUE houve extração e de
      // que tamanho — replicar o dossiê dentro do log dobraria a exposição.
      detalhes: {
        interacoes: interacoes.length,
        pedidosOracao: oracoes.length,
        batismos: batismos.length,
        matriculas: matriculas.length,
        submissoes: submissoes.length,
        bytes: conteudo.length,
      },
    });

    return {
      ok: true,
      mensagem: "Exportação gerada. O download começou; guarde o arquivo em local seguro.",
      conteudo,
      nomeArquivo: `dados-pessoais-${pessoaId}.json`,
    };
  } catch (erro) {
    return traduzirErro(erro, "exportarDadosPessoa");
  }
}

// -----------------------------------------------------------------------------
// LGPD — direito de eliminação (art. 18, VI)
// -----------------------------------------------------------------------------

const schemaExclusao = z.object({
  /** O operador digita o nome completo da pessoa. Ver o comentário abaixo. */
  confirmacao: z.string().trim().max(160),
  motivo: z
    .union([textoLimpo(300), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

/**
 * Apaga DEFINITIVAMENTE tudo o que identifica uma pessoa.
 *
 * ISTO NÃO É O "EXCLUIR" DA TELA DE PESSOAS
 * Lá o registro recebe `excluidoEm` e some das listas — reversível, porque o
 * caso normal é engano de cadastro. Aqui é eliminação de verdade, sem volta,
 * para atender um pedido de titular. Por isso mora nas configurações, exige
 * papel de administrador e pede confirmação por digitação.
 *
 * POR QUE A CONFIRMAÇÃO É O NOME DIGITADO
 * Mesma ideia do "digite o nome do repositório para excluir": numa lista onde
 * todas as linhas se parecem, o clique errado é o erro mais provável — muito
 * mais que o ato malicioso. Digitar o nome obriga a olhar para QUEM está sendo
 * apagado.
 *
 * O QUE É APAGADO, E POR QUÊ
 * Não basta remover a linha de `Pessoa`: nome, e-mail e telefone estão
 * repetidos em submissões, batismos, matrículas e pedidos de oração. Deixar
 * esses registros seria dizer que apagamos e não ter apagado. As interações
 * caem por `onDelete: Cascade`; as demais tabelas são limpas explicitamente.
 */
export async function excluirPessoaDefinitivamente(
  pessoaIdBruto: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("config.gerenciar");

    if (!ctx.pode("pessoas.excluir")) {
      return { ok: false, mensagem: "Você não tem permissão para esta ação." };
    }

    const limite = await verificarLimite(REGRA_EXCLUSAO_LGPD, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return {
        ok: false,
        mensagem: `Limite de exclusões atingido. Tente novamente em ${Math.ceil(limite.tentarEmSegundos / 60)} min.`,
      };
    }

    const pessoaId = idSchema.parse(pessoaIdBruto);
    const dados = schemaExclusao.parse(dadosBrutos);

    const pessoa = await ctx.db.pessoa.findFirst({
      where: { id: pessoaId },
      select: { id: true, nome: true, status: true, userId: true },
    });
    if (!pessoa) return { ok: false, mensagem: "Pessoa não encontrada." };

    if (dados.confirmacao !== pessoa.nome) {
      return {
        ok: false,
        mensagem: "Para confirmar, digite exatamente o nome da pessoa como está no cadastro.",
        campos: { confirmacao: ["Confirmação não confere."] },
      };
    }

    /**
     * Pessoa com conta de acesso ativa nesta igreja: barramos.
     *
     * `User` e `Membership` são globais — apagar a conta daqui poderia derrubar
     * o acesso dela a OUTRA igreja, que este admin não administra. Exigimos que
     * o vínculo seja removido antes, na tela de usuários, onde as travas de
     * papel (último admin, autoridade sobre o papel) são aplicadas.
     */
    if (pessoa.userId) {
      const vinculo = await prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: pessoa.userId } },
        select: { id: true },
      });
      if (vinculo) {
        return {
          ok: false,
          mensagem:
            "Esta pessoa tem acesso ao sistema. Remova o acesso dela em Usuários e papéis antes de excluir os dados.",
        };
      }
    }

    /**
     * Tudo numa transação: uma exclusão parcial deixaria o nome e o telefone
     * vivos em submissões enquanto a ficha some — o pior dos dois mundos, com a
     * igreja acreditando ter cumprido o pedido do titular.
     */
    const removidos = await comTransacaoTenant(ctx.tenant.id, async (tx) => {
      const [oracoes, batismos, matriculas, submissoes] = await Promise.all([
        tx.pedidoOracao.deleteMany({ where: { pessoaId } }),
        tx.solicitacaoBatismo.deleteMany({ where: { pessoaId } }),
        tx.matricula.deleteMany({ where: { pessoaId } }),
        tx.submissao.deleteMany({ where: { pessoaGeradaId: pessoaId } }),
      ]);

      // Por último a Pessoa — `Interacao` desaparece junto por cascade.
      await tx.pessoa.delete({ where: { id: pessoaId } });

      return {
        pedidosOracao: oracoes.count,
        batismos: batismos.count,
        matriculas: matriculas.count,
        submissoes: submissoes.count,
      };
    });

    /**
     * A auditoria sobrevive à exclusão — e isso é correto.
     *
     * Registramos o ID e as contagens, nunca o nome nem o contato: o que fica é
     * a PROVA de que a eliminação aconteceu, quem a executou e quando. Sem esse
     * registro, a igreja não conseguiria demonstrar que atendeu o pedido, e
     * uma exclusão maliciosa ficaria indistinguível de uma legítima.
     */
    await auditar(ctx, {
      acao: "lgpd.excluirPessoa",
      alvoTipo: "Pessoa",
      alvoId: pessoaId,
      detalhes: { statusAnterior: pessoa.status, motivo: dados.motivo, removidos },
    });

    revalidatePath("/painel/configuracoes");
    revalidatePath("/painel/pessoas");
    revalidatePath("/painel");

    return {
      ok: true,
      mensagem:
        "Dados excluídos definitivamente. Permanece na auditoria apenas o registro de que a exclusão foi feita, sem o conteúdo.",
    };
  } catch (erro) {
    return traduzirErro(erro, "excluirPessoaDefinitivamente");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/**
 * Dígitos verificadores do CNPJ (módulo 11).
 *
 * Recebe apenas dígitos — a normalização acontece no schema, antes.
 */
function cnpjValido(digitos: string): boolean {
  if (digitos.length !== 14) return false;
  // Sequências repetidas passam no cálculo do módulo 11 e por isso precisam de
  // rejeição explícita: "00000000000000" é o CNPJ "válido" mais digitado do
  // Brasil por quem quer só preencher o campo.
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const digito = (base: string, pesos: readonly number[]): number => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i += 1) {
      // `noUncheckedIndexedAccess` está ligado: o acesso por índice pode ser
      // undefined para o compilador, mesmo garantido pelo comprimento.
      soma += Number(base[i] ?? "0") * (pesos[i] ?? 0);
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;
  const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] as const;

  const dv1 = digito(digitos.slice(0, 12), pesos1);
  if (dv1 !== Number(digitos[12] ?? "-1")) return false;

  const dv2 = digito(digitos.slice(0, 13), pesos2);
  return dv2 === Number(digitos[13] ?? "-1");
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const problema of erro.issues) {
      (campos[problema.path.join(".") || "_"] ??= []).push(problema.message);
    }
    return { ok: false, mensagem: "Dados inválidos.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") {
    return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  }
  if (nome === "NaoAutorizadoError") {
    return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  }
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT nas configurações", erro, { acao });
    return { ok: false, mensagem: "Registro não encontrado." };
  }

  const codigo = (erro as { code?: string }).code;
  if (codigo === "P2002") return { ok: false, mensagem: "Já existe um registro com estes dados." };
  if (codigo === "P2025") return { ok: false, mensagem: "Registro não encontrado." };

  const ref = logger.erro("Falha em Server Action de configurações", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
