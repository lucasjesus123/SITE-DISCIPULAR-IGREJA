import { test } from "node:test";
import assert from "node:assert/strict";
import { intervaloPeriodo, ehPeriodo } from "./periodo";

// Referência: quarta-feira, 12 de agosto de 2026, 15:00 UTC.
const REF = Date.UTC(2026, 7, 12, 15, 0, 0);

test("dia: início à meia-noite, fim 24h depois", () => {
  const i = intervaloPeriodo("dia", REF);
  assert.equal(i.inicioMs, Date.UTC(2026, 7, 12));
  assert.equal(i.fimMs, Date.UTC(2026, 7, 13));
  assert.equal(i.rotulo, "12/08/2026");
});

test("semana: começa no domingo anterior e dura 7 dias", () => {
  const i = intervaloPeriodo("semana", REF);
  // 12/08/2026 é quarta; o domingo anterior é 09/08.
  assert.equal(i.inicioMs, Date.UTC(2026, 7, 9));
  assert.equal(i.fimMs, Date.UTC(2026, 7, 16));
  assert.equal(new Date(i.inicioMs).getUTCDay(), 0);
});

test("mes: do dia 1 ao dia 1 do mês seguinte", () => {
  const i = intervaloPeriodo("mes", REF);
  assert.equal(i.inicioMs, Date.UTC(2026, 7, 1));
  assert.equal(i.fimMs, Date.UTC(2026, 8, 1));
  assert.equal(i.rotulo, "Agosto de 2026");
});

test("trimestre: o trimestre que contém a referência (agosto → 3º tri)", () => {
  const i = intervaloPeriodo("trimestre", REF);
  assert.equal(i.inicioMs, Date.UTC(2026, 6, 1)); // 1º de julho
  assert.equal(i.fimMs, Date.UTC(2026, 9, 1)); // 1º de outubro
  assert.equal(i.rotulo, "3º trimestre de 2026");
});

test("semestre: agosto cai no 2º semestre (jul–dez)", () => {
  const i = intervaloPeriodo("semestre", REF);
  assert.equal(i.inicioMs, Date.UTC(2026, 6, 1)); // 1º de julho
  assert.equal(i.fimMs, Date.UTC(2027, 0, 1)); // 1º de janeiro seguinte
  assert.equal(i.rotulo, "2º semestre de 2026");
});

test("ano: de 1º de janeiro ao ano seguinte", () => {
  const i = intervaloPeriodo("ano", REF);
  assert.equal(i.inicioMs, Date.UTC(2026, 0, 1));
  assert.equal(i.fimMs, Date.UTC(2027, 0, 1));
  assert.equal(i.rotulo, "Ano de 2026");
});

test("ehPeriodo valida entrada hostil", () => {
  assert.ok(ehPeriodo("mes"));
  assert.ok(!ehPeriodo("decada"));
  assert.ok(!ehPeriodo(""));
});
