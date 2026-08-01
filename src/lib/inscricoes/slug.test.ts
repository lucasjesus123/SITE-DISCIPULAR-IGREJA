import { test } from "node:test";
import assert from "node:assert/strict";
import { campoCsv, gerarSlug } from "./slug";

test("gerarSlug normaliza título em URL limpa", () => {
  assert.equal(gerarSlug("Retiro de Casais 2026"), "retiro-de-casais-2026");
  assert.equal(gerarSlug("Inscrição — Célula!"), "inscricao-celula");
  assert.equal(gerarSlug("  Ação  de  Graças  "), "acao-de-gracas");
});

test("gerarSlug nunca devolve vazio", () => {
  assert.equal(gerarSlug("!!!"), "inscricao");
  assert.equal(gerarSlug(""), "inscricao");
});

test("campoCsv escapa separadores e aspas", () => {
  assert.equal(campoCsv("simples"), "simples");
  assert.equal(campoCsv("com, vírgula"), '"com, vírgula"');
  assert.equal(campoCsv('aspas "aqui"'), '"aspas ""aqui"""');
  assert.equal(campoCsv(null), "");
});
