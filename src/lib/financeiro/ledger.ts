import "server-only";

import { comTransacaoTenant, type TenantDb } from "@/lib/db/tenant-client";
import {
  equilibrado,
  partidasEstorno,
  partidasTransferencia,
  somaDebitos,
  type LinhaPartida,
} from "./partidas";

/**
 * Motor do razão (ledger) financeiro — partidas dobradas.
 *
 * Todas as regras "inegociáveis" do módulo moram aqui:
 *  - Lançamento IMUTÁVEL: nunca se edita nem apaga. Correção = estorno (novo
 *    lançamento espelhado que referencia o original).
 *  - ATÔMICO: cabeçalho + partidas gravam na mesma transação (comTransacaoTenant),
 *    ou nada grava.
 *  - IDEMPOTENTE: a mesma `chaveIdempotencia` nunca cria dois lançamentos
 *    (protege duplo-clique / reenvio).
 *  - PERÍODO FECHADO trava: nenhum lançamento novo com competência já fechada.
 *  - A validação de equilíbrio (Σ débitos = Σ créditos) vem de `partidas.ts`,
 *    que é puro e coberto por testes.
 */

export class ErroFinanceiro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroFinanceiro";
  }
}

export type DadosLancamento = {
  campusId: string;
  dataCompetencia: Date;
  dataCaixa: Date;
  historico: string;
  partidas: LinhaPartida[];
  chaveIdempotencia: string;
  criadoPorId: string;
  membroId?: string | null;
  anexoId?: string | null;
  contribuicaoAnonima?: boolean;
  ip?: string | null;
};

/** "YYYY-MM" da competência (UTC — a data já é só data). */
export function competenciaDe(data: Date): string {
  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}`;
}

type Tx = Omit<TenantDb, "$transaction">;

/** Recusa lançar em período já fechado (travado). */
async function garantirPeriodoAberto(tx: Tx, campusId: string, dataCompetencia: Date) {
  const competencia = competenciaDe(dataCompetencia);
  const fechado = await tx.fechamentoFinanceiro.findFirst({
    where: { campusId, competencia, travado: true },
    select: { id: true },
  });
  if (fechado) {
    throw new ErroFinanceiro(
      `A competência ${competencia} desta congregação está fechada. ` +
        `Correções só por estorno autorizado.`,
    );
  }
}

/**
 * Cria um lançamento equilibrado (idempotente e atômico). Se a mesma
 * `chaveIdempotencia` já existir, devolve o lançamento existente sem duplicar.
 */
export async function criarLancamento(tenantId: string, dados: DadosLancamento) {
  if (!equilibrado(dados.partidas)) {
    throw new ErroFinanceiro(
      "Lançamento não fecha: a soma dos débitos precisa ser igual à dos créditos.",
    );
  }

  return comTransacaoTenant(tenantId, async (tx) => {
    const existente = await tx.lancamentoFinanceiro.findFirst({
      where: { chaveIdempotencia: dados.chaveIdempotencia },
      include: { partidas: true },
    });
    if (existente) return existente;

    await garantirPeriodoAberto(tx, dados.campusId, dados.dataCompetencia);

    const lancamento = await tx.lancamentoFinanceiro.create({
      data: {
        tenantId,
        campusId: dados.campusId,
        dataCompetencia: dados.dataCompetencia,
        dataCaixa: dados.dataCaixa,
        historico: dados.historico,
        valorCentavos: somaDebitos(dados.partidas),
        membroId: dados.membroId ?? null,
        anexoId: dados.anexoId ?? null,
        contribuicaoAnonima: dados.contribuicaoAnonima ?? false,
        chaveIdempotencia: dados.chaveIdempotencia,
        criadoPorId: dados.criadoPorId,
        ip: dados.ip ?? null,
      },
    });

    await tx.partidaFinanceira.createMany({
      data: dados.partidas.map((p) => ({
        tenantId,
        lancamentoId: lancamento.id,
        contaId: p.contaId,
        debitoCentavos: p.debitoCentavos,
        creditoCentavos: p.creditoCentavos,
      })),
    });

    return tx.lancamentoFinanceiro.findFirstOrThrow({
      where: { id: lancamento.id },
      include: { partidas: true },
    });
  });
}

/**
 * Estorna um lançamento: cria um novo, espelhado (débito↔crédito), que
 * referencia o original, e marca o original como estornado. O original NUNCA é
 * apagado — o histórico real é preservado.
 */
export async function estornarLancamento(
  tenantId: string,
  params: { lancamentoId: string; justificativa: string; criadoPorId: string; ip?: string | null },
) {
  const justificativa = params.justificativa.trim();
  if (justificativa.length < 3) {
    throw new ErroFinanceiro("O estorno exige uma justificativa.");
  }

  return comTransacaoTenant(tenantId, async (tx) => {
    const original = await tx.lancamentoFinanceiro.findFirst({
      where: { id: params.lancamentoId },
      include: { partidas: true },
    });
    if (!original) throw new ErroFinanceiro("Lançamento não encontrado.");
    if (original.estornado) throw new ErroFinanceiro("Este lançamento já foi estornado.");

    const partidas: LinhaPartida[] = original.partidas.map((p) => ({
      contaId: p.contaId,
      debitoCentavos: p.debitoCentavos,
      creditoCentavos: p.creditoCentavos,
    }));

    const estorno = await tx.lancamentoFinanceiro.create({
      data: {
        tenantId,
        campusId: original.campusId,
        dataCompetencia: original.dataCompetencia,
        dataCaixa: new Date(),
        historico: `Estorno de ${original.id}: ${justificativa}`,
        valorCentavos: original.valorCentavos,
        chaveIdempotencia: `estorno:${original.id}`,
        estornoDeId: original.id,
        criadoPorId: params.criadoPorId,
        ip: params.ip ?? null,
      },
    });

    await tx.partidaFinanceira.createMany({
      data: partidasEstorno(partidas).map((p) => ({
        tenantId,
        lancamentoId: estorno.id,
        contaId: p.contaId,
        debitoCentavos: p.debitoCentavos,
        creditoCentavos: p.creditoCentavos,
      })),
    });

    await tx.lancamentoFinanceiro.update({
      where: { id: original.id },
      data: { estornado: true },
    });

    return estorno;
  });
}

/**
 * Transferência entre duas contas de ativo (mesma ou de congregações
 * diferentes). É um único lançamento equilibrado: débito no destino, crédito na
 * origem. O total do sistema é conservado por construção.
 */
export async function transferir(
  tenantId: string,
  params: {
    campusId: string;
    contaOrigemId: string;
    contaDestinoId: string;
    valorCentavos: bigint;
    dataCompetencia: Date;
    dataCaixa: Date;
    historico: string;
    chaveIdempotencia: string;
    criadoPorId: string;
    ip?: string | null;
  },
) {
  const partidas = partidasTransferencia(
    params.contaOrigemId,
    params.contaDestinoId,
    params.valorCentavos,
  );
  return criarLancamento(tenantId, {
    campusId: params.campusId,
    dataCompetencia: params.dataCompetencia,
    dataCaixa: params.dataCaixa,
    historico: params.historico,
    partidas,
    chaveIdempotencia: params.chaveIdempotencia,
    criadoPorId: params.criadoPorId,
    ip: params.ip,
  });
}

/** Saldo de uma conta de ativo: saldo inicial + Σ débitos − Σ créditos. */
export async function saldoContaCentavos(
  db: Tx,
  contaId: string,
  saldoInicialCentavos: bigint,
): Promise<bigint> {
  const agregado = await db.partidaFinanceira.aggregate({
    where: { contaId },
    _sum: { debitoCentavos: true, creditoCentavos: true },
  });
  const deb = agregado._sum.debitoCentavos ?? 0n;
  const cred = agregado._sum.creditoCentavos ?? 0n;
  return saldoInicialCentavos + deb - cred;
}
