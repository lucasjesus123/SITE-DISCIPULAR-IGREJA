import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contaReceitaCodigo,
  historicoContribuicao,
  partidasDaContribuicao,
  reaisParaCentavos,
  rotuloTipoContribuicao,
} from "./contribuicao";

test("contaReceitaCodigo mapeia cada tipo para a conta certa", () => {
  assert.equal(contaReceitaCodigo("DIZIMO"), "3.1");
  assert.equal(contaReceitaCodigo("OFERTA"), "3.2");
  assert.equal(contaReceitaCodigo("MISSOES"), "3.3");
});

test("partidasDaContribuicao debita o ativo e credita a receita, equilibrado", () => {
  const p = partidasDaContribuicao(10000n, "conta-pix", "conta-dizimo");
  assert.equal(p.length, 2);
  const somaDeb = p.reduce((s, x) => s + x.debitoCentavos, 0n);
  const somaCred = p.reduce((s, x) => s + x.creditoCentavos, 0n);
  assert.equal(somaDeb, 10000n);
  assert.equal(somaCred, 10000n);
  assert.equal(somaDeb, somaCred, "débitos têm que igualar créditos");
  // débito no ativo (PIX), crédito na receita
  assert.equal(p[0]!.contaId, "conta-pix");
  assert.equal(p[0]!.debitoCentavos, 10000n);
  assert.equal(p[1]!.contaId, "conta-dizimo");
  assert.equal(p[1]!.creditoCentavos, 10000n);
});

test("partidasDaContribuicao rejeita valor não-positivo", () => {
  assert.throws(() => partidasDaContribuicao(0n, "a", "b"));
  assert.throws(() => partidasDaContribuicao(-100n, "a", "b"));
});

test("reaisParaCentavos entende os formatos brasileiros", () => {
  assert.equal(reaisParaCentavos("100"), 10000n);
  assert.equal(reaisParaCentavos("100,50"), 10050n);
  assert.equal(reaisParaCentavos("1.250,00"), 125000n);
  assert.equal(reaisParaCentavos("R$ 80,00"), 8000n);
  assert.equal(reaisParaCentavos("0,99"), 99n);
});

test("reaisParaCentavos recusa lixo e zero", () => {
  assert.equal(reaisParaCentavos(""), null);
  assert.equal(reaisParaCentavos("abc"), null);
  assert.equal(reaisParaCentavos("0"), null);
  assert.equal(reaisParaCentavos("10,999"), null); // 3 casas decimais
});

test("historico e rotulo são legíveis", () => {
  assert.equal(rotuloTipoContribuicao("OFERTA"), "Oferta");
  assert.equal(historicoContribuicao("DIZIMO", "Mariana"), "Dízimo via app (PIX) — Mariana");
  assert.equal(historicoContribuicao("MISSOES"), "Missões via app (PIX)");
});
