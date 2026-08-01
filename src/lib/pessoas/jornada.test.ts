import { test } from "node:test";
import assert from "node:assert/strict";
import { etapaAnterior, proximaEtapa, transicaoValida } from "./jornada";

test("proximaEtapa avança na jornada", () => {
  assert.equal(proximaEtapa("VISITANTE"), "EM_ACOMPANHAMENTO");
  assert.equal(proximaEtapa("EM_ACOMPANHAMENTO"), "CONGREGANTE");
  assert.equal(proximaEtapa("CONGREGANTE"), "MEMBRO");
  assert.equal(proximaEtapa("MEMBRO"), null); // última etapa
  assert.equal(proximaEtapa("INATIVO"), null); // fora da jornada
});

test("etapaAnterior recua na jornada", () => {
  assert.equal(etapaAnterior("MEMBRO"), "CONGREGANTE");
  assert.equal(etapaAnterior("VISITANTE"), null); // primeira etapa
});

test("INVARIANTE: só transições adjacentes são válidas", () => {
  assert.equal(transicaoValida("VISITANTE", "EM_ACOMPANHAMENTO"), true);
  assert.equal(transicaoValida("EM_ACOMPANHAMENTO", "VISITANTE"), true);
  // pular etapa não é permitido
  assert.equal(transicaoValida("VISITANTE", "MEMBRO"), false);
  // saltar para fora da jornada não é permitido por aqui
  assert.equal(transicaoValida("MEMBRO", "INATIVO"), false);
});
