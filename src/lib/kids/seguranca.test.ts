import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assinarTokenQr,
  gerarCodigoSeguranca,
  hashCodigo,
  verificarCodigo,
  verificarTokenQr,
} from "./seguranca";

const SEGREDO = "segredo-de-teste-abc123";

test("gerarCodigoSeguranca produz código legível do tamanho pedido", () => {
  const c = gerarCodigoSeguranca(6);
  assert.equal(c.length, 6);
  assert.match(c, /^[A-Z2-9]+$/); // sem 0/O/1/I/L
});

test("INVARIANTE: código correto é aceito; errado é recusado", () => {
  const codigo = "AB2K9P";
  const hash = hashCodigo(codigo, SEGREDO);
  assert.equal(verificarCodigo("ab2k9p", hash, SEGREDO), true); // normaliza caixa
  assert.equal(verificarCodigo("AB2K9X", hash, SEGREDO), false); // errado
  assert.equal(verificarCodigo(codigo, hash, "outro-segredo"), false); // segredo errado
});

test("INVARIANTE: token do QR íntegro e no prazo é válido", () => {
  const agora = 1_700_000_000_000;
  const token = assinarTokenQr({ sid: "sessao-1", exp: agora + 60_000 }, SEGREDO);
  const r = verificarTokenQr(token, SEGREDO, agora);
  assert.equal(r.valido, true);
  assert.equal(r.dados?.sid, "sessao-1");
});

test("INVARIANTE: token adulterado é rejeitado", () => {
  const agora = 1_700_000_000_000;
  const token = assinarTokenQr({ sid: "sessao-1", exp: agora + 60_000 }, SEGREDO);
  const [payload] = token.split(".");
  const adulterado = `${payload}.assinaturaFalsa`;
  assert.equal(verificarTokenQr(adulterado, SEGREDO, agora).valido, false);
  // trocar o segredo também invalida
  assert.equal(verificarTokenQr(token, "outro", agora).valido, false);
});

test("INVARIANTE: token expirado é rejeitado", () => {
  const agora = 1_700_000_000_000;
  const token = assinarTokenQr({ sid: "sessao-1", exp: agora - 1 }, SEGREDO);
  assert.equal(verificarTokenQr(token, SEGREDO, agora).valido, false);
});

test("INVARIANTE: o QR não carrega dado da criança (só sid + exp)", () => {
  const token = assinarTokenQr({ sid: "sessao-1", exp: 2_000_000_000_000 }, SEGREDO);
  const payload = Buffer.from(token.split(".")[0]!, "base64url").toString("utf8");
  const obj = JSON.parse(payload);
  assert.deepEqual(Object.keys(obj).sort(), ["exp", "sid"]);
});
