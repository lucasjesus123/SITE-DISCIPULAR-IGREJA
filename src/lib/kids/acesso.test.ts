import { test } from "node:test";
import assert from "node:assert/strict";
import { ehResponsavel, podeRetirar, type Vinculo } from "./acesso";

const vinculos: Vinculo[] = [
  { responsavelUserId: "mae", autorizadoRetirar: true },
  { responsavelUserId: "pai", autorizadoRetirar: true },
  { responsavelUserId: "vizinha", autorizadoRetirar: false },
];

test("INVARIANTE: responsável não-vinculado é bloqueado (anti-IDOR)", () => {
  assert.equal(ehResponsavel(vinculos, "mae"), true);
  assert.equal(ehResponsavel(vinculos, "estranho"), false);
});

test("INVARIANTE: retirada só por responsável autorizado", () => {
  assert.equal(podeRetirar(vinculos, "mae"), true);
  assert.equal(podeRetirar(vinculos, "vizinha"), false); // vinculada, mas NÃO autorizada a retirar
  assert.equal(podeRetirar(vinculos, "estranho"), false); // nem vinculada
});
