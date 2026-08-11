import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarHora, horariosSemanais, proximosEventos, type ItemAgendaHome } from "./agenda-home";

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.UTC(2026, 7, 2, 12, 0, 0);

function item(over: Partial<ItemAgendaHome>): ItemAgendaHome {
  return { tipo: "CULTO", titulo: "X", descricao: null, diaSemana: null, horario: null, dataHoraMs: null, ...over };
}

test("formatarHora normaliza para 20h00", () => {
  assert.equal(formatarHora("20:00"), "20h00");
  assert.equal(formatarHora("9:5"), "09h05");
  assert.equal(formatarHora("18"), "18h00");
});

test("horariosSemanais pega cultos recorrentes ordenados por dia da semana", () => {
  const agenda = [
    item({ titulo: "Sexta", diaSemana: 5, horario: "20:00" }),
    item({ titulo: "Domingo", diaSemana: 0, horario: "18:00" }),
    item({ titulo: "Quarta", diaSemana: 3, horario: "20:00" }),
    item({ titulo: "Evento", tipo: "EVENTO", dataHoraMs: AGORA + DIA }), // não é culto recorrente
  ];
  const h = horariosSemanais(agenda);
  assert.equal(h.length, 3);
  assert.equal(h[0]!.dia, "Domingo");
  assert.equal(h[0]!.hora, "18h00");
  assert.equal(h[2]!.titulo, "Sexta");
});

test("horariosSemanais inclui qualquer tipo recorrente (ex.: célula), não só culto", () => {
  const agenda = [
    item({ titulo: "Células", tipo: "CELULA", diaSemana: 2, horario: "20:00" }),
    item({ titulo: "Oração", tipo: "ORACAO", diaSemana: 1, horario: "06:00" }),
  ];
  const h = horariosSemanais(agenda);
  assert.equal(h.length, 2);
  assert.equal(h[1]!.titulo, "Células"); // terça vem depois de segunda
});

test("horariosSemanais respeita o máximo de 4", () => {
  const agenda = [0, 1, 2, 3, 4].map((d) => item({ titulo: `C${d}`, diaSemana: d, horario: "19:00" }));
  assert.equal(horariosSemanais(agenda).length, 4);
});

test("proximosEventos lista só datas futuras, ordenadas", () => {
  const agenda = [
    item({ titulo: "Passado", tipo: "EVENTO", dataHoraMs: AGORA - DIA }),
    item({ titulo: "Depois", tipo: "EVENTO", dataHoraMs: AGORA + 10 * DIA }),
    item({ titulo: "Logo", tipo: "EVENTO", dataHoraMs: AGORA + 2 * DIA }),
  ];
  const e = proximosEventos(agenda, AGORA);
  assert.equal(e.length, 2);
  assert.equal(e[0]!.titulo, "Logo");
  assert.equal(e[1]!.titulo, "Depois");
});

test("proximosEventos formata dia/mês em UTC", () => {
  const e = proximosEventos([item({ titulo: "Batismo", tipo: "EVENTO", dataHoraMs: Date.UTC(2026, 7, 17, 12) })], AGORA);
  assert.equal(e[0]!.dia, "17");
  assert.equal(e[0]!.mes, "Ago");
});
