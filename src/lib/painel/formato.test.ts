import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarCnpj, iniciais, normalizarTelefone, primeiroNome, rotuloTipo, tempoRelativo } from "./formato";

test("primeiroNome e iniciais", () => {
  assert.equal(primeiroNome("Lucas Jesus Silva"), "Lucas");
  assert.equal(primeiroNome("  Ana  "), "Ana");
  assert.equal(iniciais("Lucas Jesus Silva"), "LS");
  assert.equal(iniciais("Ana"), "A");
  assert.equal(iniciais(""), "?");
});

test("rotuloTipo traduz e faz fallback", () => {
  assert.equal(rotuloTipo("PEDIDO_ORACAO"), "Oração");
  assert.equal(rotuloTipo("VISITANTE"), "Visitante");
  assert.equal(rotuloTipo("DESCONHECIDO"), "DESCONHECIDO");
});

test("tempoRelativo com 'agora' injetado é determinístico", () => {
  const agora = 1_700_000_000_000;
  assert.equal(tempoRelativo(new Date(agora - 30_000), agora), "agora");
  assert.equal(tempoRelativo(new Date(agora - 5 * 60_000), agora), "5 min");
  assert.equal(tempoRelativo(new Date(agora - 3 * 3600_000), agora), "3 h");
  assert.equal(tempoRelativo(new Date(agora - 4 * 86_400_000), agora), "4 d");
});

test("formatarCnpj mascara 14 dígitos e ignora o resto", () => {
  assert.equal(formatarCnpj("54746859000173"), "54.746.859/0001-73");
  assert.equal(formatarCnpj(null), null);
  assert.equal(formatarCnpj("123"), "123"); // não tem 14 dígitos → devolve como veio
});

test("normalizarTelefone tira máscara e trata vazio", () => {
  assert.equal(normalizarTelefone("(51) 99266-8095"), "5199266809" + "5");
  assert.equal(normalizarTelefone(""), null);
  assert.equal(normalizarTelefone("abc"), null);
});
