/**
 * Resumo de confirmação da escala — MÓDULO PURO.
 *
 * O líder olha o evento e precisa saber numa batida: "quantos já confirmaram,
 * quem falta, dá pra fechar?". Essa contagem vira badge, cor e texto na UI —
 * então centralizamos aqui, com teste, em vez de recalcular espalhado.
 */

export type StatusEscalado = "PENDENTE" | "CONFIRMADO" | "RECUSADO" | "TROCA_SOLICITADA";

export interface ResumoConfirmacao {
  total: number;
  confirmados: number;
  recusados: number;
  pendentes: number;
  trocas: number;
  /** % de confirmados sobre o total (0..100, inteiro). */
  percentualConfirmado: number;
  /** true quando ninguém está pendente nem pediu troca nem recusou. */
  fechado: boolean;
  /** Rótulo curto para badge: "3/5 confirmados". */
  rotulo: string;
  /** Semáforo para cor da UI. */
  situacao: "ok" | "atencao" | "pendente" | "vazio";
}

export function resumirConfirmacoes(status: StatusEscalado[]): ResumoConfirmacao {
  const total = status.length;
  const confirmados = status.filter((s) => s === "CONFIRMADO").length;
  const recusados = status.filter((s) => s === "RECUSADO").length;
  const trocas = status.filter((s) => s === "TROCA_SOLICITADA").length;
  const pendentes = status.filter((s) => s === "PENDENTE").length;

  const percentualConfirmado = total === 0 ? 0 : Math.round((confirmados / total) * 100);
  const fechado = total > 0 && confirmados === total;

  let situacao: ResumoConfirmacao["situacao"];
  if (total === 0) situacao = "vazio";
  else if (fechado) situacao = "ok";
  else if (recusados > 0 || trocas > 0) situacao = "atencao";
  else situacao = "pendente";

  const rotulo = total === 0 ? "Ninguém escalado" : `${confirmados}/${total} confirmados`;

  return { total, confirmados, recusados, pendentes, trocas, percentualConfirmado, fechado, rotulo, situacao };
}

/** Texto humano do status individual (para o card do integrante). */
export function rotuloStatus(status: StatusEscalado): string {
  switch (status) {
    case "CONFIRMADO": return "Confirmado";
    case "RECUSADO": return "Não pode";
    case "TROCA_SOLICITADA": return "Pediu troca";
    case "PENDENTE": return "Aguardando";
  }
}
