import { test } from "node:test";
import assert from "node:assert/strict";
import { formatarCentavos, reaisParaCentavos } from "./dinheiro";

test("reaisParaCentavos aceita os formatos comuns", () => {
  assert.equal(reaisParaCentavos("1234,56"), 123456n);
  assert.equal(reaisParaCentavos("1.234,56"), 123456n);
  assert.equal(reaisParaCentavos("R$ 1.234,56"), 123456n);
  assert.equal(reaisParaCentavos("1234.56"), 123456n);
  assert.equal(reaisParaCentavos("10"), 1000n);
  assert.equal(reaisParaCentavos("0,05"), 5n);
});

test("reaisParaCentavos arredonda HALF_UP no terceiro decimal", () => {
  assert.equal(reaisParaCentavos("0,124"), 12n);
  assert.equal(reaisParaCentavos("0,125"), 13n);
  assert.equal(reaisParaCentavos("0,129"), 13n);
});

test("reaisParaCentavos rejeita lixo", () => {
  assert.throws(() => reaisParaCentavos("abc"));
  assert.throws(() => reaisParaCentavos(""));
});

test("formatarCentavos formata em BRL com milhar", () => {
  assert.equal(formatarCentavos(123456n), "R$ 1.234,56");
  assert.equal(formatarCentavos(5n), "R$ 0,05");
  assert.equal(formatarCentavos(0n), "R$ 0,00");
  assert.equal(formatarCentavos(-1000n), "-R$ 10,00");
  assert.equal(formatarCentavos(100000000n), "R$ 1.000.000,00");
});

test("INVARIANTE: dinheiro em centavos não sofre o bug do float (0,1 + 0,2 = 0,3)", () => {
  const soma = reaisParaCentavos("0,10") + reaisParaCentavos("0,20");
  assert.equal(soma, reaisParaCentavos("0,30"));
  // e o equivalente em float FALHARIA — é exatamente o que evitamos:
  assert.notEqual(0.1 + 0.2, 0.3);
});

test("ida e volta texto→centavos→texto é estável", () => {
  for (const v of ["0,00", "0,99", "10,00", "1.234,56", "999.999,99"]) {
    assert.equal(formatarCentavos(reaisParaCentavos(v)), `R$ ${v}`);
  }
});
