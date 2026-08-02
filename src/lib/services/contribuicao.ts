import "server-only";

import { prisma } from "@/lib/db/prisma";
import { tenantDb } from "@/lib/db/tenant-client";
import { criarLancamento } from "@/lib/financeiro/ledger";
import { criarCobrancaPix } from "@/lib/pagamentos/asaas";
import {
  contaReceitaCodigo,
  historicoContribuicao,
  partidasDaContribuicao,
  type TipoContribuicao,
} from "@/lib/pagamentos/contribuicao";
import { logger } from "@/lib/logger";

/**
 * Orquestra o "Contribuir": cria a cobrança PIX no ASAAS e, quando o webhook
 * confirma o pagamento, gera UM lançamento de entrada no Financeiro.
 *
 * Idempotência em dois pontos:
 *  - a Contribuicao é única por (tenant, asaasPaymentId);
 *  - o lançamento usa chave `contrib:<id>`, então reprocessar o webhook não
 *    duplica dinheiro.
 */

export class ErroContribuicao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroContribuicao";
  }
}

export interface DadosIniciar {
  tipo: TipoContribuicao;
  valorCentavos: bigint;
  membroUserId: string | null;
  campusId: string | null;
  pagador: { nome: string; cpfCnpj: string; email?: string };
}

/** Cria a cobrança e devolve o PIX (copia-e-cola + imagem) para a tela. */
export async function iniciarContribuicao(tenantId: string, dados: DadosIniciar) {
  const db = tenantDb(tenantId);

  const contribuicao = await db.contribuicao.create({
    data: {
      tenantId,
      tipo: dados.tipo,
      valorCentavos: dados.valorCentavos,
      membroUserId: dados.membroUserId,
      campusId: dados.campusId,
      nome: dados.pagador.nome,
      status: "PENDENTE",
    },
    select: { id: true },
  });

  const cobranca = await criarCobrancaPix({
    valorCentavos: dados.valorCentavos,
    descricao: historicoContribuicao(dados.tipo, dados.pagador.nome),
    externalReference: contribuicao.id,
    pagador: dados.pagador,
  });

  await db.contribuicao.update({
    where: { id: contribuicao.id },
    data: { asaasPaymentId: cobranca.paymentId, pixCopiaECola: cobranca.pixCopiaECola },
  });

  return {
    contribuicaoId: contribuicao.id,
    pixCopiaECola: cobranca.pixCopiaECola,
    pixImagemBase64: cobranca.pixImagemBase64,
    expiraEm: cobranca.expiraEm,
  };
}

/**
 * Confirma uma contribuição a partir do webhook do ASAAS. Recebe a referência
 * externa (id da Contribuicao) e o id do pagamento. Resolve o tenant pela
 * própria contribuição (o webhook não tem sessão). Idempotente.
 */
export async function confirmarContribuicao(externalReference: string, asaasPaymentId: string): Promise<{ ok: boolean; jaProcessada?: boolean }> {
  // Lookup global por chave primária (cuid) — o webhook não tem tenant na mão.
  const registro = await prisma.contribuicao.findUnique({
    where: { id: externalReference },
    select: { id: true, tenantId: true, status: true, tipo: true, valorCentavos: true, membroUserId: true, campusId: true, nome: true },
  });
  if (!registro) {
    logger.aviso("Webhook ASAAS sem contribuição correspondente", { externalReference });
    return { ok: false };
  }
  if (registro.status === "CONFIRMADA") return { ok: true, jaProcessada: true };

  const db = tenantDb(registro.tenantId);

  // Resolve a congregação: a informada ou a primeira da igreja.
  const campusId =
    registro.campusId ??
    (await db.campus.findFirst({ orderBy: { criadoEm: "asc" }, select: { id: true } }))?.id ??
    null;
  if (!campusId) throw new ErroContribuicao("Igreja sem congregação para lançar a entrada.");

  // Conta física que recebeu (PIX daquela congregação) e a conta de receita.
  const [contaPix, contaReceita] = await Promise.all([
    db.contaContabil.findFirst({ where: { campusId, tipoFisico: "PIX", ativo: true }, select: { id: true } }),
    db.contaContabil.findFirst({ where: { codigo: contaReceitaCodigo(registro.tipo) }, select: { id: true } }),
  ]);
  if (!contaPix || !contaReceita) {
    throw new ErroContribuicao("Plano de contas incompleto (falta conta PIX ou de receita).");
  }

  const agora = new Date();
  const lancamento = await criarLancamento(registro.tenantId, {
    campusId,
    dataCompetencia: agora,
    dataCaixa: agora,
    historico: historicoContribuicao(registro.tipo, registro.nome),
    partidas: partidasDaContribuicao(registro.valorCentavos, contaPix.id, contaReceita.id),
    chaveIdempotencia: `contrib:${registro.id}`,
    criadoPorId: registro.membroUserId ?? "sistema:asaas",
    membroId: registro.membroUserId ?? null,
    contribuicaoAnonima: !registro.membroUserId,
  });

  await db.contribuicao.update({
    where: { id: registro.id },
    data: { status: "CONFIRMADA", confirmadaEm: agora, lancamentoId: lancamento.id, asaasPaymentId },
  });

  return { ok: true };
}
