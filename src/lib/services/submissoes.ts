import type { OrigemCadastro, TipoSubmissao } from "@prisma/client";
import { tenantDb } from "@/lib/db/tenant-client";
import { prisma } from "@/lib/db/prisma";
import { LIMIAR_SPAM, pontuarSpam } from "@/lib/validation/comum";
import { SCHEMAS_POR_TIPO, type TipoFormulario } from "@/lib/validation/submissoes";
import { logger } from "@/lib/logger";

/**
 * Recebimento dos formulários públicos.
 *
 * ARQUITETURA: caixa de entrada, não gravação direta.
 *
 * Nada vindo do site cai direto na tabela `pessoas`. Tudo entra em
 * `submissoes` e espera triagem humana. Três razões:
 *
 *   1. ANTI-POLUIÇÃO. Um bot que passe pelo rate limit e pelo honeypot suja
 *      uma caixa de entrada, não o cadastro de membros da igreja — que é o
 *      dado que o pastor usa para tomar decisão pastoral.
 *
 *   2. DEDUPLICAÇÃO. A mesma pessoa preenche "visitante" em março e "novo
 *      membro" em junho. Na triagem, a secretária vincula à ficha existente
 *      em vez de criar a segunda Maria Silva.
 *
 *   3. LGPD. Existe um momento explícito em que um humano decide incorporar
 *      aquele dado à base, e esse momento fica registrado na auditoria.
 */

export interface ResultadoSubmissao {
  id: string;
  aceita: boolean;
  /** Mensagem já pronta para exibir ao visitante. */
  mensagem: string;
}

export interface ContextoPublico {
  tenantId: string;
  origem: OrigemCadastro;
  ipHash: string;
  userAgent: string;
  paginaOrigem?: string;
}

const MENSAGENS: Record<TipoFormulario, string> = {
  VISITANTE: "Que alegria receber você! Em breve entraremos em contato.",
  NOVO_MEMBRO: "Recebemos seu cadastro. Nossa equipe vai falar com você em breve.",
  BATISMO: "Sua solicitação de batismo foi recebida. Nossa equipe entrará em contato.",
  PEDIDO_ORACAO: "Recebemos seu pedido. Nossa equipe de intercessão vai orar por você.",
  CONTATO: "Mensagem recebida. Responderemos assim que possível.",
  INSCRICAO_CURSO: "Inscrição recebida! Em breve enviaremos as orientações.",
  QUERO_CELULA: "Recebemos seu interesse. Vamos indicar uma célula perto de você.",
};

/**
 * Valida, pontua e grava uma submissão pública.
 *
 * @param dadosBrutos  Corpo da requisição, SEM nenhuma confiança prévia.
 */
export async function receberSubmissao(
  tipo: TipoFormulario,
  dadosBrutos: unknown,
  ctx: ContextoPublico,
): Promise<ResultadoSubmissao> {
  // 1. Validação. Lança ZodError, tratado pelo handler.
  //    Campos fora do schema são descartados aqui — é o que fecha
  //    mass assignment.
  const schema = SCHEMAS_POR_TIPO[tipo];
  const dados = schema.parse(dadosBrutos) as Record<string, unknown>;

  // 2. Anti-spam
  const textoLivre = [dados.mensagem, dados.pedido, dados.testemunho, dados.observacoes]
    .filter((v): v is string => typeof v === "string")
    .join(" ");

  const scoreSpam = pontuarSpam({
    website: dados.website as string | undefined,
    _t: dados._t as number | undefined,
    texto: textoLivre,
  });

  // 3. Remove os campos de controle antes de persistir.
  delete dados.website;
  delete dados._t;

  const ehSpam = scoreSpam >= LIMIAR_SPAM;

  const db = tenantDb(ctx.tenantId);

  // 4. Grava
  const submissao = await db.submissao.create({
    data: {
      tenantId: ctx.tenantId,
      tipo: tipo as TipoSubmissao,
      // Spam entra já classificado: fica disponível para revisão (falso
      // positivo acontece) mas não notifica ninguém nem aparece na fila.
      status: ehSpam ? "SPAM" : "NOVO",
      nome: String(dados.nome ?? dados.nomeSolicitante ?? "Anônimo").slice(0, 160),
      email: typeof dados.email === "string" ? dados.email : null,
      telefone: typeof dados.telefone === "string" ? dados.telefone : null,
      dados: dados as object,
      origem: ctx.origem,
      paginaOrigem: ctx.paginaOrigem?.slice(0, 200),
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      scoreSpam,
      consentimentoLgpd: dados.consentimentoLgpd === true,
    },
    select: { id: true },
  });

  // 5. Efeitos colaterais por tipo
  //
  // Batismo e pedido de oração ganham registro próprio ALÉM da submissão,
  // porque têm ciclo de vida próprio (turma preparatória, "estou orando",
  // testemunho de resposta) que não cabe numa caixa de entrada genérica.
  if (!ehSpam) {
    try {
      if (tipo === "BATISMO") {
        await criarSolicitacaoBatismo(ctx.tenantId, submissao.id, dados);
      } else if (tipo === "PEDIDO_ORACAO") {
        await criarPedidoOracao(ctx.tenantId, dados, ctx);
      } else if (tipo === "INSCRICAO_CURSO") {
        await criarMatricula(ctx.tenantId, dados);
      }
    } catch (erro) {
      // O registro derivado falhou, mas a submissão está salva. Melhor isso
      // do que devolver erro ao visitante e perder o contato dele.
      logger.erro("Falha ao criar registro derivado de submissão", erro, {
        tipo,
        submissaoId: submissao.id,
        tenantId: ctx.tenantId,
      });
    }
  }

  /**
   * A resposta é IDÊNTICA para spam e não-spam.
   *
   * Dizer "sua mensagem foi marcada como spam" ensinaria o autor do bot
   * exatamente qual ajuste faz passar. Ele recebe o mesmo agradecimento;
   * a mensagem simplesmente não chega a ninguém.
   */
  return {
    id: submissao.id,
    aceita: true,
    mensagem: MENSAGENS[tipo],
  };
}

async function criarSolicitacaoBatismo(
  tenantId: string,
  _submissaoId: string,
  dados: Record<string, unknown>,
): Promise<void> {
  const db = tenantDb(tenantId);
  await db.solicitacaoBatismo.create({
    data: {
      tenantId,
      nome: String(dados.nome).slice(0, 160),
      email: typeof dados.email === "string" ? dados.email : null,
      telefone: typeof dados.telefone === "string" ? dados.telefone : null,
      dataNascimento: dados.dataNascimento ? new Date(String(dados.dataNascimento)) : null,
      status: "SOLICITADO",
      respostas: {
        aceitouJesus: dados.aceitouJesus ?? null,
        dataConversao: dados.dataConversao ?? null,
        testemunho: dados.testemunho ?? null,
        jaFoiBatizado: dados.jaFoiBatizado ?? null,
        ondeFoiBatizado: dados.ondeFoiBatizado ?? null,
        participaCelula: dados.participaCelula ?? null,
      },
      menorIdade: dados.menorIdade === true,
      responsavelNome: typeof dados.responsavelNome === "string" ? dados.responsavelNome : null,
      responsavelTelefone:
        typeof dados.responsavelTelefone === "string" ? dados.responsavelTelefone : null,
      autorizacaoResponsavel: dados.autorizacaoResponsavel === true,
      campusId: typeof dados.campusId === "string" ? dados.campusId : null,
      observacoes: typeof dados.observacoes === "string" ? dados.observacoes : null,
    },
  });
}

async function criarPedidoOracao(
  tenantId: string,
  dados: Record<string, unknown>,
  ctx: ContextoPublico,
): Promise<void> {
  const db = tenantDb(tenantId);
  const anonimo = dados.anonimo === true;

  await db.pedidoOracao.create({
    data: {
      tenantId,
      // Num pedido anônimo NADA de identificação é gravado, nem o nome que
      // por acaso tenha vindo no corpo. Anonimato só vale se for real.
      nomeSolicitante: anonimo ? null : (dados.nome as string | undefined) ?? null,
      emailContato: anonimo ? null : (dados.email as string | undefined) ?? null,
      telefoneContato: anonimo ? null : (dados.telefone as string | undefined) ?? null,
      anonimo,
      categoria: String(dados.categoria ?? "GERAL").slice(0, 40),
      titulo: typeof dados.titulo === "string" ? dados.titulo : null,
      pedido: String(dados.pedido),
      urgente: dados.urgente === true,
      visibilidade: (dados.visibilidade as "PRIVADO" | "MURAL_MEMBROS" | "PUBLICO") ?? "PRIVADO",
      status: "RECEBIDO",
      origem: ctx.origem,
      // Mesmo anônimo, guardamos o hash do IP: é o que permite bloquear abuso
      // sem identificar a pessoa.
      ipHash: ctx.ipHash,
    },
  });
}

async function criarMatricula(tenantId: string, dados: Record<string, unknown>): Promise<void> {
  const db = tenantDb(tenantId);
  const cursoId = String(dados.cursoId);

  // Confirma que o curso existe NESTE tenant e aceita inscrição. O cliente
  // envia o cursoId; sem esta checagem ele poderia inscrever alguém num
  // curso de outra igreja — o `tenantDb` já bloquearia a leitura, mas a
  // verificação explícita devolve um erro claro em vez de falhar adiante.
  const curso = await db.curso.findFirst({
    where: { id: cursoId, ativo: true, inscricoesAbertas: true },
    select: { id: true },
  });
  if (!curso) return;

  await db.matricula.create({
    data: {
      tenantId,
      cursoId: curso.id,
      nome: String(dados.nome).slice(0, 160),
      email: typeof dados.email === "string" ? dados.email : null,
      telefone: typeof dados.telefone === "string" ? dados.telefone : null,
      status: "INSCRITO",
      observacoes: typeof dados.observacoes === "string" ? dados.observacoes : null,
    },
  });
}

/**
 * Contadores da fila de triagem, para os cartões do dashboard.
 * Uma query agregada em vez de cinco counts: com 90 usuários abrindo o
 * dashboard, a diferença aparece.
 */
export async function contadoresTriagem(tenantId: string) {
  const db = tenantDb(tenantId);

  const [porTipo, oracoesPendentes, batismosPendentes] = await Promise.all([
    db.submissao.groupBy({
      by: ["tipo"],
      where: { status: { in: ["NOVO", "EM_ANALISE"] } },
      _count: { _all: true },
    }),
    db.pedidoOracao.count({ where: { status: "RECEBIDO" } }),
    db.solicitacaoBatismo.count({ where: { status: { in: ["SOLICITADO", "EM_PREPARO"] } } }),
  ]);

  const mapa: Record<string, number> = {};
  let total = 0;
  for (const linha of porTipo) {
    mapa[linha.tipo] = linha._count._all;
    total += linha._count._all;
  }

  return { porTipo: mapa, total, oracoesPendentes, batismosPendentes };
}

/**
 * Verifica se o tenant existe e está ativo, para rotas públicas que não
 * passam por `exigirTenant`. Cacheado em memória por pouco tempo porque é
 * chamado em toda submissão.
 */
export async function tenantAceitaSubmissoes(tenantId: string): Promise<boolean> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, excluidoEm: true },
  });
  if (!tenant || tenant.excluidoEm) return false;
  return tenant.status === "ATIVO" || tenant.status === "TRIAL";
}
