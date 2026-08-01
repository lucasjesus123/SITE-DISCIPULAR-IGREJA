import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisosAoEscalar,
  conflitosDeHorario,
  estaIndisponivel,
  nomeDoMes,
  ordenarEventos,
  type EventoRef,
} from "./escala";

const eventos: EventoRef[] = [
  { id: "manha", data: "2026-03-01", hora: "09:00" },
  { id: "noite", data: "2026-03-01", hora: "18:00" },
  { id: "outroManha", data: "2026-03-01", hora: "09:00" }, // mesmo instante do "manha"
  { id: "ensaio", data: "2026-02-28", hora: "20:00" },
];

test("conflitosDeHorario acha o mesmo membro em dois eventos no mesmo instante", () => {
  const escalacoes = [
    { membroId: "joao", eventoId: "manha" },
    { membroId: "maria", eventoId: "noite" },
  ];
  const alvo = eventos.find((e) => e.id === "outroManha")!;
  const c = conflitosDeHorario("joao", alvo, escalacoes, eventos);
  assert.equal(c.length, 1);
  assert.equal(c[0]!.id, "manha");
});

test("conflitosDeHorario ignora horários diferentes e o próprio evento", () => {
  const escalacoes = [
    { membroId: "joao", eventoId: "manha" },
    { membroId: "joao", eventoId: "noite" }, // hora diferente, não colide
  ];
  const alvo = eventos.find((e) => e.id === "manha")!;
  // Escalar no mesmo evento em que já está não é conflito consigo mesmo.
  assert.equal(conflitosDeHorario("joao", alvo, escalacoes, eventos).length, 0);
});

test("estaIndisponivel respeita o intervalo inclusive", () => {
  const inds = [{ membroId: "ana", inicio: "2026-03-01", fim: "2026-03-10" }];
  assert.equal(estaIndisponivel("ana", "2026-03-01", inds), true); // borda inicial
  assert.equal(estaIndisponivel("ana", "2026-03-10", inds), true); // borda final
  assert.equal(estaIndisponivel("ana", "2026-03-05", inds), true);
  assert.equal(estaIndisponivel("ana", "2026-02-28", inds), false);
  assert.equal(estaIndisponivel("ana", "2026-03-11", inds), false);
  assert.equal(estaIndisponivel("outro", "2026-03-05", inds), false);
});

test("avisosAoEscalar acumula conflito E indisponibilidade", () => {
  const alvo = eventos.find((e) => e.id === "outroManha")!;
  const avisos = avisosAoEscalar("joao", alvo, {
    escalacoes: [{ membroId: "joao", eventoId: "manha" }],
    eventos,
    indisponibilidades: [{ membroId: "joao", inicio: "2026-03-01", fim: "2026-03-01" }],
  });
  const tipos = avisos.map((a) => a.tipo).sort();
  assert.deepEqual(tipos, ["conflito", "indisponivel"]);
});

test("avisosAoEscalar vazio quando está tudo limpo", () => {
  const alvo = eventos.find((e) => e.id === "ensaio")!;
  const avisos = avisosAoEscalar("joao", alvo, {
    escalacoes: [],
    eventos,
    indisponibilidades: [],
  });
  assert.equal(avisos.length, 0);
});

test("ordenarEventos ordena por data e hora sem mutar a entrada", () => {
  const entrada = [...eventos];
  const ordenado = ordenarEventos(entrada);
  assert.equal(ordenado[0]!.id, "ensaio"); // 28/02
  assert.equal(ordenado[ordenado.length - 1]!.hora, "18:00"); // último é a noite
  assert.deepEqual(entrada, eventos, "não pode mutar o array original");
});

test("nomeDoMes traduz e trata fora de faixa", () => {
  assert.equal(nomeDoMes(3), "março");
  assert.equal(nomeDoMes(12), "dezembro");
  assert.equal(nomeDoMes(13), "");
});
