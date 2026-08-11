/**
 * Horários e Agenda da home — PURO e testável.
 *
 * Antes esses blocos eram fixos no código (iguais pra toda igreja). Agora saem
 * do `AgendaItem` de cada igreja: cultos recorrentes viram a faixa de horários;
 * eventos com data viram a lista "próximos eventos". Sem dado, o consumidor usa
 * um fallback — a home nunca fica vazia.
 */

export interface ItemAgendaHome {
  tipo: string; // TipoAgenda
  titulo: string;
  descricao: string | null;
  diaSemana: number | null;
  horario: string | null; // "HH:MM"
  dataHoraMs: number | null; // evento pontual
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** "20:00" → "20h00"; "9:5" tolera formatos frouxos. */
export function formatarHora(horario: string): string {
  const [h = "", m = "00"] = horario.split(":");
  return `${h.padStart(2, "0")}h${(m || "00").padStart(2, "0")}`;
}

export interface Horario {
  dia: string;
  hora: string;
  titulo: string;
}

/**
 * Faixa de horários: QUALQUER item recorrente (tem dia da semana + horário) e
 * público — culto, célula, oração, ensaio, escola. Ordenado por dia da semana.
 * Antes só entrava tipo CULTO, o que escondia "Células" e afins; agora a igreja
 * controla pelo que marca como recorrente + "mostrar no site". Eventos com data
 * (dataHora) NÃO entram aqui — vão para "próximos eventos". Até `max` (3 colunas).
 */
export function horariosSemanais(agenda: ItemAgendaHome[], max = 4): Horario[] {
  return agenda
    .filter((a) => a.diaSemana != null && a.horario && a.dataHoraMs == null)
    .sort((a, b) => (a.diaSemana as number) - (b.diaSemana as number))
    .slice(0, max)
    .map((a) => ({ dia: DIAS[a.diaSemana as number] ?? "", hora: formatarHora(a.horario as string), titulo: a.titulo }));
}

export interface EventoHome {
  dia: string; // "17"
  mes: string; // "Ago"
  titulo: string;
  sub: string;
}

/**
 * Próximos eventos: itens com data futura, ordenados do mais próximo. `agoraMs`
 * é injetado para o teste ser determinístico. Datas em UTC (o `@db.Date`/data
 * chega em meia-noite UTC).
 */
export function proximosEventos(agenda: ItemAgendaHome[], agoraMs: number, max = 3): EventoHome[] {
  return agenda
    .filter((a) => a.dataHoraMs != null && (a.dataHoraMs as number) >= agoraMs)
    .sort((a, b) => (a.dataHoraMs as number) - (b.dataHoraMs as number))
    .slice(0, max)
    .map((a) => {
      const d = new Date(a.dataHoraMs as number);
      return {
        dia: String(d.getUTCDate()).padStart(2, "0"),
        mes: MESES_CURTO[d.getUTCMonth()] ?? "",
        titulo: a.titulo,
        sub: a.descricao?.trim() || DIAS[d.getUTCDay()] || "",
      };
    });
}
