import { test } from "node:test";
import assert from "node:assert/strict";
import { idadeEmAnos, resumoFrequencia } from "./passaporte";

test("idadeEmAnos conta anos completos", () => {
  const nasc = new Date("2019-05-10T00:00:00Z");
  assert.equal(idadeEmAnos(nasc, new Date("2026-05-10T00:00:00Z")), 7); // aniversário
  assert.equal(idadeEmAnos(nasc, new Date("2026-05-09T00:00:00Z")), 6); // véspera
  assert.equal(idadeEmAnos(nasc, new Date("2026-12-31T00:00:00Z")), 7);
});

test("idadeEmAnos nunca é negativa", () => {
  assert.equal(idadeEmAnos(new Date("2030-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z")), 0);
});

test("resumoFrequencia soma presença/em-sala/retiradas", () => {
  const r = resumoFrequencia([{ status: "RETIRADA" }, { status: "RETIRADA" }, { status: "EM_SALA" }]);
  assert.deepEqual(r, { total: 3, emSala: 1, retiradas: 2 });
});
