/**
 * Períodos do relatório da Secretaria (dia / semana / mês / ano).
 *
 * PURO e determinístico: recebe um instante de referência (ms) e devolve o
 * intervalo [início, fim). Cálculo em UTC para o teste não depender do fuso da
 * máquina — a virada perto da meia-noite é irrelevante para um relatório.
 */

export type Periodo = "dia" | "semana" | "mes" | "ano";

export const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: "dia", rotulo: "Dia" },
  { chave: "semana", rotulo: "Semana" },
  { chave: "mes", rotulo: "Mês" },
  { chave: "ano", rotulo: "Ano" },
];

export function ehPeriodo(v: string): v is Periodo {
  return v === "dia" || v === "semana" || v === "mes" || v === "ano";
}

export interface Intervalo {
  inicioMs: number;
  fimMs: number; // exclusivo
  rotulo: string;
}

function ddmmyyyy(ms: number): string {
  const d = new Date(ms);
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DIA_MS = 24 * 60 * 60 * 1000;

/** Intervalo [início, fim) do período que CONTÉM o instante `refMs`. */
export function intervaloPeriodo(periodo: Periodo, refMs: number): Intervalo {
  const r = new Date(refMs);
  const ano = r.getUTCFullYear();
  const mes = r.getUTCMonth();
  const dia = r.getUTCDate();

  if (periodo === "dia") {
    const inicio = Date.UTC(ano, mes, dia);
    return { inicioMs: inicio, fimMs: inicio + DIA_MS, rotulo: ddmmyyyy(inicio) };
  }
  if (periodo === "semana") {
    // Semana começa no domingo (getUTCDay: 0 = domingo).
    const inicio = Date.UTC(ano, mes, dia) - new Date(Date.UTC(ano, mes, dia)).getUTCDay() * DIA_MS;
    const fim = inicio + 7 * DIA_MS;
    return { inicioMs: inicio, fimMs: fim, rotulo: `Semana de ${ddmmyyyy(inicio)} a ${ddmmyyyy(fim - DIA_MS)}` };
  }
  if (periodo === "mes") {
    const inicio = Date.UTC(ano, mes, 1);
    const fim = Date.UTC(ano, mes + 1, 1);
    return { inicioMs: inicio, fimMs: fim, rotulo: `${MESES[mes]} de ${ano}` };
  }
  // ano
  const inicio = Date.UTC(ano, 0, 1);
  const fim = Date.UTC(ano + 1, 0, 1);
  return { inicioMs: inicio, fimMs: fim, rotulo: `Ano de ${ano}` };
}
