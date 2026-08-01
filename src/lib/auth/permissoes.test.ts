import { test } from "node:test";
import assert from "node:assert/strict";
import { papeisAtribuiveis, papelTem } from "./permissoes";

test("MEMBRO não tem nenhuma permissão de gestão (menor privilégio)", () => {
  assert.equal(papelTem("MEMBRO", "pessoas.ler"), false);
  assert.equal(papelTem("MEMBRO", "financeiro.gerenciar"), false);
  assert.equal(papelTem("MEMBRO", "usuarios.gerenciar"), false);
});

test("SECRETARIA opera cadastros e inscrições/kids, mas NÃO usuários nem site.editar", () => {
  assert.equal(papelTem("SECRETARIA", "pessoas.criar"), true);
  assert.equal(papelTem("SECRETARIA", "inscricoes.gerenciar"), true);
  assert.equal(papelTem("SECRETARIA", "kids.gerenciar"), true);
  assert.equal(papelTem("SECRETARIA", "automacoes.gerenciar"), true);
  assert.equal(papelTem("SECRETARIA", "usuarios.gerenciar"), false);
  assert.equal(papelTem("SECRETARIA", "site.editar"), false);
  assert.equal(papelTem("SECRETARIA", "pessoas.lerSensivel"), false);
});

test("PASTOR tem financeiro e site, mas não gerencia usuários", () => {
  assert.equal(papelTem("PASTOR", "financeiro.gerenciar"), true);
  assert.equal(papelTem("PASTOR", "site.editar"), true);
  assert.equal(papelTem("PASTOR", "pessoas.lerSensivel"), true);
  assert.equal(papelTem("PASTOR", "usuarios.gerenciar"), false);
});

test("ADMIN tem tudo (amostra ampla)", () => {
  for (const p of ["usuarios.gerenciar", "financeiro.gerenciar", "kids.gerenciar", "config.gerenciar", "whatsapp.gerenciar"] as const) {
    assert.equal(papelTem("ADMIN", p), true, `ADMIN deveria ter ${p}`);
  }
});

test("papeisAtribuiveis impede escalonamento", () => {
  // Secretaria/líder não podem atribuir papel nenhum.
  assert.deepEqual(papeisAtribuiveis("SECRETARIA"), []);
  assert.deepEqual(papeisAtribuiveis("LIDER_CELULA"), []);
  // Pastor NÃO pode criar admin.
  assert.equal(papeisAtribuiveis("PASTOR").includes("ADMIN"), false);
  // Admin pode todos.
  assert.equal(papeisAtribuiveis("ADMIN").includes("ADMIN"), true);
});
