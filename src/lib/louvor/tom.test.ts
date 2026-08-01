import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ehTomValido,
  intervaloEmSemitons,
  todosOsTons,
  transporAcorde,
  transporCifra,
} from "./tom";

test("transporAcorde sobe semitons preservando o sufixo", () => {
  assert.equal(transporAcorde("C", 2), "D");
  assert.equal(transporAcorde("Am7", 2), "Bm7");
  assert.equal(transporAcorde("G", 5), "C");
  assert.equal(transporAcorde("F#m", 1), "Gm");
});

test("transporAcorde desce (semitons negativos) e dá a volta na oitava", () => {
  assert.equal(transporAcorde("C", -1), "B");
  assert.equal(transporAcorde("D", -2), "C");
  assert.equal(transporAcorde("C", 12), "C"); // oitava inteira volta ao mesmo
  assert.equal(transporAcorde("C", -12), "C");
});

test("transporAcorde aceita bemol na entrada e normaliza para sustenido", () => {
  assert.equal(transporAcorde("Bb", 2), "C");
  assert.equal(transporAcorde("Eb", 1), "E");
  assert.equal(transporAcorde("Db", 0), "C#");
});

test("transporAcorde transpõe o baixo invertido depois da barra", () => {
  assert.equal(transporAcorde("C/G", 2), "D/A");
  assert.equal(transporAcorde("Am7/G", 2), "Bm7/A");
  assert.equal(transporAcorde("D/F#", 1), "D#/G");
});

test("transporAcorde devolve intacto o que não é acorde", () => {
  assert.equal(transporAcorde("Deus", 2), "Deus");
  assert.equal(transporAcorde("", 2), "");
});

test("transporCifra transpõe só as cifras e preserva a letra", () => {
  const original = "C        G\nEu te louvarei";
  const subido = transporCifra(original, 2);
  assert.ok(subido.includes("D"));
  assert.ok(subido.includes("A"));
  assert.ok(subido.includes("Eu te louvarei"), "a letra tem que continuar intacta");
});

test("transporCifra com múltiplo de 12 não altera nada", () => {
  const t = "C G Am F";
  assert.equal(transporCifra(t, 12), t);
  assert.equal(transporCifra(t, 0), t);
});

test("intervaloEmSemitons calcula distância ascendente 0..11", () => {
  assert.equal(intervaloEmSemitons("C", "D"), 2);
  assert.equal(intervaloEmSemitons("A", "C"), 3);
  assert.equal(intervaloEmSemitons("C", "C"), 0);
  assert.equal(intervaloEmSemitons("D", "C"), 10); // sobe até dar a volta
  assert.equal(intervaloEmSemitons("X", "C"), null);
});

test("ehTomValido reconhece notas e rejeita lixo", () => {
  assert.equal(ehTomValido("C"), true);
  assert.equal(ehTomValido("F#"), true);
  assert.equal(ehTomValido("Bb"), true);
  assert.equal(ehTomValido("H"), false);
  assert.equal(ehTomValido(""), false);
});

test("todosOsTons devolve as 12 notas cromáticas", () => {
  assert.equal(todosOsTons().length, 12);
  assert.ok(todosOsTons().includes("C"));
  assert.ok(todosOsTons().includes("G#"));
});
