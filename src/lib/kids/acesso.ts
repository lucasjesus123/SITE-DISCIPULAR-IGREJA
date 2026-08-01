/**
 * Autorização do KIDS — regras PURAS de "quem pode o quê" com uma criança.
 * Testáveis sem banco. São a defesa anti-IDOR (regra 3.3) e de entrega
 * segura (regra 3.1).
 */

export type Vinculo = {
  responsavelUserId: string;
  autorizadoRetirar: boolean;
};

/** Uma conta só acompanha/vê a criança se estiver vinculada a ela. */
export function ehResponsavel(vinculos: Vinculo[], userId: string): boolean {
  return vinculos.some((v) => v.responsavelUserId === userId);
}

/** A criança só é retirada por um responsável marcado como autorizado. */
export function podeRetirar(vinculos: Vinculo[], userId: string): boolean {
  return vinculos.some((v) => v.responsavelUserId === userId && v.autorizadoRetirar);
}
