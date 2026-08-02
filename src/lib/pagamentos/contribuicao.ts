import type { LinhaPartida } from "@/lib/financeiro/partidas";

/**
 * Contribuição do membro → lançamento no Financeiro — REGRAS PURAS.
 *
 * Uma contribuição confirmada por PIX vira UM lançamento de entrada, em
 * partidas dobradas:
 *   - DÉBITO na conta física que recebeu (o "PIX" da congregação — um ATIVO);
 *   - CRÉDITO na conta de receita correspondente (Dízimos/Ofertas/Missões).
 *
 * A matemática é a mesma do resto do Financeiro: centavos em BigInt, sem
 * ponto flutuante. Aqui só montamos as partidas e resolvemos códigos de conta;
 * quem grava é o ledger (idempotente e atômico).
 */

export type TipoContribuicao = "DIZIMO" | "OFERTA" | "MISSOES";

/** Código da conta de RECEITA por tipo (bate com o plano de contas do seed). */
export function contaReceitaCodigo(tipo: TipoContribuicao): "3.1" | "3.2" | "3.3" {
  switch (tipo) {
    case "DIZIMO":
      return "3.1"; // Dízimos
    case "OFERTA":
      return "3.2"; // Ofertas
    case "MISSOES":
      return "3.3"; // Doações / Missões
  }
}

export function rotuloTipoContribuicao(tipo: TipoContribuicao): string {
  return tipo === "DIZIMO" ? "Dízimo" : tipo === "OFERTA" ? "Oferta" : "Missões";
}

/**
 * Partidas de uma contribuição: entra na conta-ativo (PIX) e credita a receita.
 * `valorCentavos` precisa ser positivo — cobrança de valor zero/negativo não faz
 * sentido e quebraria o equilíbrio esperado pelo ledger.
 */
export function partidasDaContribuicao(
  valorCentavos: bigint,
  contaAtivoId: string,
  contaReceitaId: string,
): LinhaPartida[] {
  if (valorCentavos <= 0n) {
    throw new Error("Contribuição precisa de valor positivo.");
  }
  return [
    { contaId: contaAtivoId, debitoCentavos: valorCentavos, creditoCentavos: 0n },
    { contaId: contaReceitaId, debitoCentavos: 0n, creditoCentavos: valorCentavos },
  ];
}

/** Histórico legível do lançamento (aparece no razão). */
export function historicoContribuicao(tipo: TipoContribuicao, nomeMembro?: string | null): string {
  const base = `${rotuloTipoContribuicao(tipo)} via app (PIX)`;
  return nomeMembro ? `${base} — ${nomeMembro}` : base;
}

/**
 * Converte reais digitados ("100", "100,50", "1.250,00") para centavos BigInt.
 * Aceita ponto ou vírgula como separador decimal; ignora separador de milhar.
 * Devolve null quando não dá para interpretar como dinheiro válido.
 */
export function reaisParaCentavos(entrada: string): bigint | null {
  const limpo = entrada.trim().replace(/\s/g, "").replace(/R\$?/i, "");
  if (!limpo) return null;
  // Remove separadores de milhar e normaliza a vírgula decimal para ponto.
  const normal = limpo.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const [inteira, decimal = ""] = normal.split(".");
  const centavos = BigInt(inteira || "0") * 100n + BigInt((decimal + "00").slice(0, 2));
  return centavos > 0n ? centavos : null;
}

/** Valores sugeridos (em centavos) para os botões rápidos da tela. */
export const VALORES_SUGERIDOS_CENTAVOS: bigint[] = [5000n, 10000n, 20000n];
