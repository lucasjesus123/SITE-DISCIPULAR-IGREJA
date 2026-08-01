/**
 * Regras da escala — MÓDULO PURO.
 *
 * Duas dores concretas do líder de louvor moram aqui:
 *
 *  1. CONFLITO DE HORÁRIO — escalar a mesma pessoa em dois eventos no mesmo
 *     dia/hora. Numa igreja com dois cultos no domingo, isso acontece o tempo
 *     todo, e o sistema tem que avisar ANTES de publicar.
 *
 *  2. INDISPONIBILIDADE — a pessoa avisou que viaja de tal a tal data. Escalar
 *     em cima disso é constrangedor. Detectamos a sobreposição.
 *
 * Tudo aqui é função pura sobre dados simples, para poder testar sem banco.
 */

export interface EventoRef {
  id: string;
  /** ISO date (YYYY-MM-DD) do evento. */
  data: string;
  /** Hora "HH:MM" (24h). */
  hora: string;
}

export interface EscalacaoRef {
  membroId: string;
  eventoId: string;
}

export interface IndisponibilidadeRef {
  membroId: string;
  /** ISO date inclusive. */
  inicio: string;
  /** ISO date inclusive. */
  fim: string;
}

/** Chave de instante do evento — mesmo dia E mesma hora colidem. */
function instante(ev: EventoRef): string {
  return `${ev.data}T${ev.hora}`;
}

/**
 * Detecta se escalar `membroId` no `eventoAlvo` cria conflito de horário com
 * algum evento em que ele JÁ está escalado. Retorna os eventos conflitantes.
 */
export function conflitosDeHorario(
  membroId: string,
  eventoAlvo: EventoRef,
  escalacoesExistentes: EscalacaoRef[],
  eventos: EventoRef[],
): EventoRef[] {
  const porId = new Map(eventos.map((e) => [e.id, e]));
  const instanteAlvo = instante(eventoAlvo);

  const conflitantes: EventoRef[] = [];
  for (const esc of escalacoesExistentes) {
    if (esc.membroId !== membroId) continue;
    if (esc.eventoId === eventoAlvo.id) continue; // já está neste, não é conflito
    const outro = porId.get(esc.eventoId);
    if (outro && instante(outro) === instanteAlvo) {
      conflitantes.push(outro);
    }
  }
  return conflitantes;
}

/** `true` se a data ISO cai dentro (inclusive) de alguma indisponibilidade. */
export function estaIndisponivel(
  membroId: string,
  dataIso: string,
  indisponibilidades: IndisponibilidadeRef[],
): boolean {
  return indisponibilidades.some(
    (ind) => ind.membroId === membroId && dataIso >= ind.inicio && dataIso <= ind.fim,
  );
}

export type MotivoBloqueio =
  | { tipo: "conflito"; eventos: EventoRef[] }
  | { tipo: "indisponivel" };

/**
 * Reúne, para um membro num evento, todos os motivos que deveriam fazer o
 * sistema ALERTAR antes de confirmar a escalação. Vazio = pode escalar limpo.
 *
 * Não bloqueia à força (o líder pode ter um bom motivo para escalar mesmo
 * assim) — devolve os avisos para a UI mostrar e pedir confirmação.
 */
export function avisosAoEscalar(
  membroId: string,
  eventoAlvo: EventoRef,
  contexto: {
    escalacoes: EscalacaoRef[];
    eventos: EventoRef[];
    indisponibilidades: IndisponibilidadeRef[];
  },
): MotivoBloqueio[] {
  const avisos: MotivoBloqueio[] = [];

  const conflitos = conflitosDeHorario(membroId, eventoAlvo, contexto.escalacoes, contexto.eventos);
  if (conflitos.length > 0) avisos.push({ tipo: "conflito", eventos: conflitos });

  if (estaIndisponivel(membroId, eventoAlvo.data, contexto.indisponibilidades)) {
    avisos.push({ tipo: "indisponivel" });
  }

  return avisos;
}

/** Nome do mês em português (1..12). Fora de escala → string vazia. */
const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export function nomeDoMes(mes: number): string {
  return MESES[mes - 1] ?? "";
}

/** Ordena eventos por (data, hora) crescente — estável e sem mutar a entrada. */
export function ordenarEventos<T extends EventoRef>(eventos: T[]): T[] {
  return [...eventos].sort((a, b) => instante(a).localeCompare(instante(b)));
}
