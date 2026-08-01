/**
 * Passaporte Kids — cálculos puros (idade e frequência), testáveis sem banco.
 */

/** Idade em anos completos. `agora` é injetado para o teste ser determinístico. */
export function idadeEmAnos(nascimento: Date, agora: Date): number {
  let idade = agora.getUTCFullYear() - nascimento.getUTCFullYear();
  const mesDiff = agora.getUTCMonth() - nascimento.getUTCMonth();
  const diaDiff = agora.getUTCDate() - nascimento.getUTCDate();
  if (mesDiff < 0 || (mesDiff === 0 && diaDiff < 0)) idade -= 1;
  return Math.max(0, idade);
}

/** Resumo de presença a partir das sessões (cada sessão = uma presença). */
export function resumoFrequencia(sessoes: { status: string }[]): {
  total: number;
  emSala: number;
  retiradas: number;
} {
  let emSala = 0;
  let retiradas = 0;
  for (const s of sessoes) {
    if (s.status === "EM_SALA") emSala += 1;
    else if (s.status === "RETIRADA") retiradas += 1;
  }
  return { total: sessoes.length, emSala, retiradas };
}
