import { test } from "node:test";
import assert from "node:assert/strict";
import { renderizarTemplate, variaveisDoTemplate, TEMPLATES_PADRAO } from "./template";

test("renderizar substitui as variáveis", () => {
  assert.equal(
    renderizarTemplate("Olá {nome}, bem-vindo à {igreja}!", { nome: "Ana", igreja: "Discipular" }),
    "Olá Ana, bem-vindo à Discipular!",
  );
});

test("variável ausente vira vazio (nunca deixa {chave} cru)", () => {
  assert.equal(renderizarTemplate("Oi {nome} {sobrenome}", { nome: "João" }), "Oi João ");
  assert.doesNotMatch(renderizarTemplate("{x}", {}), /[{}]/);
});

test("variaveisDoTemplate lista as chaves usadas", () => {
  assert.deepEqual(variaveisDoTemplate("{nome} da {igreja}, {nome} de novo").sort(), ["igreja", "nome"]);
});

test("todos os templates padrão citam {nome} e são renderizáveis", () => {
  for (const t of TEMPLATES_PADRAO) {
    assert.ok(variaveisDoTemplate(t.corpo).includes("nome"), `${t.chave} deveria usar {nome}`);
    const saida = renderizarTemplate(t.corpo, { nome: "Maria", igreja: "Discipular Igreja" });
    assert.doesNotMatch(saida, /\{|\}/);
  }
});
