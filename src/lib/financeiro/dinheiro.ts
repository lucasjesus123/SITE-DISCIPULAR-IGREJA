/**
 * Dinheiro — SEMPRE em centavos inteiros (bigint). Nunca float.
 *
 * A regra número 1 do módulo financeiro: 0.1 + 0.2 !== 0.3 em ponto flutuante,
 * e num sistema de dízimos isso vira centavo sumido e caixa que não fecha.
 * Aqui todo valor é `bigint` de centavos; a conversão de/para texto acontece só
 * nas bordas (formulário e tela), com arredondamento explícito HALF_UP.
 *
 * Módulo PURO (sem I/O) — é o que os testes de invariante exercitam.
 */

/** "R$ 1.234,56", "1234,56", "1234.56", "1.234,56" → 123456n. HALF_UP no 3º decimal. */
export function reaisParaCentavos(valor: string | number): bigint {
  if (typeof valor === "number") {
    // Aceito número por conveniência, mas arredondo já — não deixo float vazar.
    return BigInt(Math.round(valor * 100));
  }

  let s = valor.trim().replace(/\s/g, "").replace(/r\$/i, "");
  if (s === "") throw new Error("Valor monetário vazio.");

  const negativo = s.startsWith("-");
  if (negativo) s = s.slice(1);

  // Se tem vírgula, ela é o separador decimal e os pontos são milhar.
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }

  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Valor monetário inválido: ${valor}`);
  }

  const partes = s.split(".");
  const inteira = partes[0] ?? "0";
  const decimalBruto = partes[1] ?? "";
  const decimal = (decimalBruto + "000").slice(0, 3); // 3 casas para arredondar
  let centavos = BigInt(inteira) * 100n + BigInt(decimal.slice(0, 2));
  // HALF_UP: se o 3º decimal >= 5, soma 1 centavo.
  if (Number(decimal[2] ?? "0") >= 5) centavos += 1n;

  return negativo ? -centavos : centavos;
}

/** 123456n → "R$ 1.234,56". */
export function formatarCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const reais = abs / 100n;
  const resto = abs % 100n;
  const reaisStr = reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${reaisStr},${resto.toString().padStart(2, "0")}`;
}
