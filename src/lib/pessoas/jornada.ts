import type { StatusPessoa } from "@prisma/client";

/**
 * Jornada de acompanhamento (Kanban).
 *
 * As colunas são os próprios status da pessoa, na ordem em que ela caminha:
 * visitante → em acompanhamento → congregante → membro. Mover um cartão é
 * avançar/recuar a pessoa nessa jornada. Módulo PURO — coberto por teste.
 */

export const ORDEM_JORNADA: StatusPessoa[] = [
  "VISITANTE",
  "EM_ACOMPANHAMENTO",
  "CONGREGANTE",
  "MEMBRO",
];

export const ROTULO_ETAPA: Record<StatusPessoa, string> = {
  VISITANTE: "Visitante",
  EM_ACOMPANHAMENTO: "Em acompanhamento",
  CONGREGANTE: "Congregante",
  MEMBRO: "Membro",
  INATIVO: "Inativo",
  TRANSFERIDO: "Transferido",
};

/** Etapa seguinte na jornada, ou null se já está na última (ou fora dela). */
export function proximaEtapa(status: StatusPessoa): StatusPessoa | null {
  const i = ORDEM_JORNADA.indexOf(status);
  if (i < 0 || i >= ORDEM_JORNADA.length - 1) return null;
  return ORDEM_JORNADA[i + 1] ?? null;
}

/** Etapa anterior na jornada, ou null se já está na primeira (ou fora dela). */
export function etapaAnterior(status: StatusPessoa): StatusPessoa | null {
  const i = ORDEM_JORNADA.indexOf(status);
  if (i <= 0) return null;
  return ORDEM_JORNADA[i - 1] ?? null;
}

/** Uma transição só é válida se for um passo adjacente na jornada. */
export function transicaoValida(de: StatusPessoa, para: StatusPessoa): boolean {
  return proximaEtapa(de) === para || etapaAnterior(de) === para;
}
