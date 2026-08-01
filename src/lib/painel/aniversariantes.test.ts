import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularAniversariantes, type PessoaAniv } from "./aniversariantes";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const pessoas: PessoaAniv[] = [
  { id: "a", nome: "Ana", telefone: null, dataNascimento: d("1990-08-01"), dataBatismo: null }, // vida hoje
  { id: "b", nome: "Bia", telefone: null, dataNascimento: d("1985-08-05"), dataBatismo: null }, // semana
  { id: "c", nome: "Caio", telefone: null, dataNascimento: d("1979-08-20"), dataBatismo: null }, // resto do mês
  { id: "e", nome: "Edu", telefone: null, dataNascimento: null, dataBatismo: d("2015-08-01") }, // batismo hoje
  { id: "f", nome: "Fla", telefone: null, dataNascimento: d("1995-09-10"), dataBatismo: null }, // outro mês (fora)
];

test("classifica hoje / próximos 7 dias / resto do mês, sem repetir", () => {
  const r = calcularAniversariantes(pessoas, "2026-08-01");
  assert.deepEqual(r.hoje.map((x) => `${x.nome}:${x.tipo}`).sort(), ["Ana:vida", "Edu:batismo"]);
  assert.deepEqual(r.semana.map((x) => x.nome), ["Bia"]);
  assert.deepEqual(r.mes.map((x) => x.nome), ["Caio"]);
  // "Fla" (setembro) não entra em nenhum balde de agosto.
  const todos = [...r.hoje, ...r.semana, ...r.mes].map((x) => x.nome);
  assert.equal(todos.includes("Fla"), false);
});

test("aniversário de vida E de batismo geram duas entradas distintas", () => {
  const p: PessoaAniv[] = [{ id: "x", nome: "Duplo", telefone: null, dataNascimento: d("2000-08-01"), dataBatismo: d("2010-08-01") }];
  const r = calcularAniversariantes(p, "2026-08-01");
  assert.equal(r.hoje.length, 2);
  assert.deepEqual(r.hoje.map((x) => x.tipo).sort(), ["batismo", "vida"]);
});
