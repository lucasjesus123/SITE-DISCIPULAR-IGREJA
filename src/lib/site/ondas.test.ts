import { test } from "node:test";
import assert from "node:assert/strict";
import { feixe, linha, LARGURA_ONDA } from "./ondas";

test("linha começa em M e é desenhada até 2x a largura (loop sem emenda)", () => {
  const d = linha(300, 40, 400, 0);
  assert.match(d, /^M0 /);
  assert.ok(d.includes(`L${2 * LARGURA_ONDA} `), "deve alcançar 2×LARGURA");
});

test("linha é determinística (mesma entrada → mesma saída)", () => {
  assert.equal(linha(300, 40, 400, 1.2), linha(300, 40, 400, 1.2));
});

test("feixe produz a quantidade pedida com opacidade no intervalo esperado", () => {
  const f = feixe(10, 300, 200, 40, 400, 0.2);
  assert.equal(f.length, 10);
  for (const l of f) {
    assert.ok(l.o >= 0.2 && l.o <= 0.75, `opacidade fora do esperado: ${l.o}`);
    assert.match(l.d, /^M0 /);
  }
});
