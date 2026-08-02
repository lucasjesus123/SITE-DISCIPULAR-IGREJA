import { test } from "node:test";
import assert from "node:assert/strict";
import { destinoPadrao, opcoesDeAcesso, papelDeGestao, podeAlternar } from "./roteador";

test("papelDeGestao: só MEMBRO fica de fora", () => {
  assert.equal(papelDeGestao("MEMBRO"), false);
  for (const p of ["ADMIN", "PASTOR", "SECRETARIA", "LIDER_CELULA"] as const) {
    assert.equal(papelDeGestao(p), true, `${p} deveria ser gestão`);
  }
});

test("destinoPadrao: membro vai pro app, gestão pro painel", () => {
  assert.equal(destinoPadrao("MEMBRO"), "/app");
  assert.equal(destinoPadrao("SECRETARIA"), "/painel");
  assert.equal(destinoPadrao("ADMIN"), "/painel");
});

test("opcoesDeAcesso: membro só tem o app; gestão tem painel + app", () => {
  const membro = opcoesDeAcesso("MEMBRO");
  assert.equal(membro.length, 1);
  assert.equal(membro[0]!.chave, "app");

  const gestao = opcoesDeAcesso("PASTOR");
  assert.deepEqual(gestao.map((o) => o.chave), ["painel", "app"]);
});

test("podeAlternar só para quem tem gestão", () => {
  assert.equal(podeAlternar("MEMBRO"), false);
  assert.equal(podeAlternar("LIDER_CELULA"), true);
  assert.equal(podeAlternar("ADMIN"), true);
});
