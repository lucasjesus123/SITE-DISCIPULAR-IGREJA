/**
 * Partidas dobradas — núcleo PURO (sem banco).
 *
 * Invariantes que estas funções garantem (e que os testes exercitam):
 *  - Um lançamento equilibrado tem Σ débitos = Σ créditos e total > 0.
 *  - O estorno de um lançamento zera o efeito do original (troca débito↔crédito).
 *  - Uma transferência conserva o total: o que sai de uma conta entra na outra.
 *  - O saldo de uma conta de ativo = saldo inicial + Σ débitos − Σ créditos.
 *
 * Tudo em `bigint` de centavos. Nada de float.
 */

export type LinhaPartida = {
  contaId: string;
  debitoCentavos: bigint;
  creditoCentavos: bigint;
};

export function somaDebitos(partidas: LinhaPartida[]): bigint {
  return partidas.reduce((acc, p) => acc + p.debitoCentavos, 0n);
}

export function somaCreditos(partidas: LinhaPartida[]): bigint {
  return partidas.reduce((acc, p) => acc + p.creditoCentavos, 0n);
}

/**
 * Um lançamento é válido quando: tem ≥2 linhas; cada linha mexe em exatamente
 * UM lado (débito XOR crédito), sem valores negativos; e o total de débitos é
 * igual ao total de créditos e maior que zero.
 */
export function equilibrado(partidas: LinhaPartida[]): boolean {
  if (partidas.length < 2) return false;

  for (const p of partidas) {
    if (p.debitoCentavos < 0n || p.creditoCentavos < 0n) return false;
    const temDebito = p.debitoCentavos > 0n;
    const temCredito = p.creditoCentavos > 0n;
    if (temDebito === temCredito) return false; // ambos zero, ou ambos preenchidos
  }

  const d = somaDebitos(partidas);
  return d > 0n && d === somaCreditos(partidas);
}

/** Partidas do estorno: espelham o original, trocando débito por crédito. */
export function partidasEstorno(partidas: LinhaPartida[]): LinhaPartida[] {
  return partidas.map((p) => ({
    contaId: p.contaId,
    debitoCentavos: p.creditoCentavos,
    creditoCentavos: p.debitoCentavos,
  }));
}

/**
 * Transferência entre duas contas de ATIVO (caixa, banco, pix), possivelmente
 * de congregações diferentes. A conta de destino recebe (débito aumenta ativo);
 * a de origem cede (crédito diminui ativo). Total conservado por construção.
 */
export function partidasTransferencia(
  contaOrigemId: string,
  contaDestinoId: string,
  valorCentavos: bigint,
): LinhaPartida[] {
  if (valorCentavos <= 0n) throw new Error("Transferência precisa de valor positivo.");
  if (contaOrigemId === contaDestinoId) throw new Error("Origem e destino não podem ser a mesma conta.");
  return [
    { contaId: contaDestinoId, debitoCentavos: valorCentavos, creditoCentavos: 0n },
    { contaId: contaOrigemId, debitoCentavos: 0n, creditoCentavos: valorCentavos },
  ];
}

/** Saldo de uma conta de ativo a partir das partidas que a tocam. */
export function saldoAtivo(saldoInicialCentavos: bigint, partidas: LinhaPartida[]): bigint {
  return saldoInicialCentavos + somaDebitos(partidas) - somaCreditos(partidas);
}

/** Movimento líquido de uma conta (débitos − créditos), útil para checagens. */
export function movimentoLiquido(partidas: LinhaPartida[]): bigint {
  return somaDebitos(partidas) - somaCreditos(partidas);
}
