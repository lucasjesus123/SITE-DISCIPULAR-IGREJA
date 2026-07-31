import type { NaturezaConta } from "@prisma/client";
import type { TenantDb } from "@/lib/db/tenant-client";

/**
 * Saldos financeiros — derivados SEMPRE dos lançamentos (Σ débitos − Σ créditos
 * por conta), nunca de um campo de saldo guardado. É a regra "saldo sempre
 * recalculável": a verdade são as partidas.
 *
 * A interpretação do saldo depende da natureza da conta:
 *  - ATIVO (caixa/banco/pix): saldo inicial + débitos − créditos (débito soma).
 *  - DESPESA: débitos − créditos (o que saiu no período).
 *  - RECEITA / PASSIVO / PATRIMÔNIO: créditos − débitos.
 */
export function saldoPorNatureza(
  natureza: NaturezaConta,
  saldoInicialCentavos: bigint,
  debitos: bigint,
  creditos: bigint,
): bigint {
  switch (natureza) {
    case "ATIVO":
      return saldoInicialCentavos + debitos - creditos;
    case "DESPESA":
      return debitos - creditos;
    case "RECEITA":
    case "PASSIVO":
    case "PATRIMONIO":
      return creditos - debitos;
  }
}

export type SaldoConta = {
  id: string;
  codigo: string;
  nome: string;
  natureza: NaturezaConta;
  campusId: string | null;
  saldoCentavos: bigint;
};

/** Saldo de todas as contas ativas do tenant, já interpretado por natureza. */
export async function saldosDasContas(db: TenantDb): Promise<SaldoConta[]> {
  const [contas, somas] = await Promise.all([
    db.contaContabil.findMany({
      where: { ativo: true },
      orderBy: [{ ordem: "asc" }, { codigo: "asc" }],
      select: { id: true, codigo: true, nome: true, natureza: true, campusId: true, saldoInicialCentavos: true },
    }),
    db.partidaFinanceira.groupBy({
      by: ["contaId"],
      _sum: { debitoCentavos: true, creditoCentavos: true },
    }),
  ]);

  const porConta = new Map(
    somas.map((s) => [s.contaId, { d: s._sum.debitoCentavos ?? 0n, c: s._sum.creditoCentavos ?? 0n }]),
  );

  return contas.map((conta) => {
    const mov = porConta.get(conta.id) ?? { d: 0n, c: 0n };
    return {
      id: conta.id,
      codigo: conta.codigo,
      nome: conta.nome,
      natureza: conta.natureza,
      campusId: conta.campusId,
      saldoCentavos: saldoPorNatureza(conta.natureza, conta.saldoInicialCentavos, mov.d, mov.c),
    };
  });
}

/** Saldo consolidado (matriz) = soma das contas de ATIVO de todas as congregações. */
export function consolidadoAtivo(saldos: SaldoConta[]): bigint {
  return saldos.filter((s) => s.natureza === "ATIVO").reduce((acc, s) => acc + s.saldoCentavos, 0n);
}

/** Saldo de ativo por congregação (campusId → total em caixa/banco/pix). */
export function ativoPorCongregacao(saldos: SaldoConta[]): Map<string, bigint> {
  const mapa = new Map<string, bigint>();
  for (const s of saldos) {
    if (s.natureza !== "ATIVO" || !s.campusId) continue;
    mapa.set(s.campusId, (mapa.get(s.campusId) ?? 0n) + s.saldoCentavos);
  }
  return mapa;
}

/** Totais de receita e despesa (para "entradas x saídas"). */
export function totaisResultado(saldos: SaldoConta[]): { receitas: bigint; despesas: bigint } {
  let receitas = 0n;
  let despesas = 0n;
  for (const s of saldos) {
    if (s.natureza === "RECEITA") receitas += s.saldoCentavos;
    if (s.natureza === "DESPESA") despesas += s.saldoCentavos;
  }
  return { receitas, despesas };
}
