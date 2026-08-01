import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirConfirmacoes, rotuloStatus, type StatusEscalado } from "./confirmacao";

test("resumirConfirmacoes conta cada estado e fecha quando todos confirmam", () => {
  const r = resumirConfirmacoes(["CONFIRMADO", "CONFIRMADO", "CONFIRMADO"]);
  assert.equal(r.total, 3);
  assert.equal(r.confirmados, 3);
  assert.equal(r.fechado, true);
  assert.equal(r.percentualConfirmado, 100);
  assert.equal(r.situacao, "ok");
  assert.equal(r.rotulo, "3/3 confirmados");
});

test("resumirConfirmacoes marca atenção quando há recusa ou pedido de troca", () => {
  const status: StatusEscalado[] = ["CONFIRMADO", "RECUSADO", "PENDENTE"];
  const r = resumirConfirmacoes(status);
  assert.equal(r.recusados, 1);
  assert.equal(r.pendentes, 1);
  assert.equal(r.fechado, false);
  assert.equal(r.situacao, "atencao");
  assert.equal(r.percentualConfirmado, 33);
});

test("resumirConfirmacoes fica pendente quando só falta gente responder", () => {
  const r = resumirConfirmacoes(["CONFIRMADO", "PENDENTE"]);
  assert.equal(r.situacao, "pendente");
  assert.equal(r.trocas, 0);
});

test("resumirConfirmacoes trata escala vazia sem dividir por zero", () => {
  const r = resumirConfirmacoes([]);
  assert.equal(r.total, 0);
  assert.equal(r.percentualConfirmado, 0);
  assert.equal(r.fechado, false);
  assert.equal(r.situacao, "vazio");
  assert.equal(r.rotulo, "Ninguém escalado");
});

test("rotuloStatus traduz todos os estados", () => {
  assert.equal(rotuloStatus("CONFIRMADO"), "Confirmado");
  assert.equal(rotuloStatus("RECUSADO"), "Não pode");
  assert.equal(rotuloStatus("TROCA_SOLICITADA"), "Pediu troca");
  assert.equal(rotuloStatus("PENDENTE"), "Aguardando");
});
