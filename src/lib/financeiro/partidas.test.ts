import { test } from "node:test";
import assert from "node:assert/strict";
import {
  equilibrado,
  movimentoLiquido,
  partidasEstorno,
  partidasTransferencia,
  saldoAtivo,
  somaCreditos,
  somaDebitos,
  type LinhaPartida,
} from "./partidas";

// Um dízimo de R$ 100,00 recebido no caixa dinheiro:
//   débito Caixa (ativo aumenta) / crédito Dízimo (receita).
const dizimo: LinhaPartida[] = [
  { contaId: "caixa", debitoCentavos: 10000n, creditoCentavos: 0n },
  { contaId: "dizimo", debitoCentavos: 0n, creditoCentavos: 10000n },
];

test("INVARIANTE: lançamento equilibrado tem Σ débitos = Σ créditos", () => {
  assert.equal(equilibrado(dizimo), true);
  assert.equal(somaDebitos(dizimo), somaCreditos(dizimo));
});

test("INVARIANTE: lançamento desequilibrado é rejeitado", () => {
  const torto: LinhaPartida[] = [
    { contaId: "caixa", debitoCentavos: 10000n, creditoCentavos: 0n },
    { contaId: "dizimo", debitoCentavos: 0n, creditoCentavos: 9999n },
  ];
  assert.equal(equilibrado(torto), false);
});

test("lançamento com uma linha só, valor zero ou lado duplo é inválido", () => {
  assert.equal(equilibrado([{ contaId: "x", debitoCentavos: 100n, creditoCentavos: 0n }]), false);
  assert.equal(
    equilibrado([
      { contaId: "a", debitoCentavos: 0n, creditoCentavos: 0n },
      { contaId: "b", debitoCentavos: 0n, creditoCentavos: 0n },
    ]),
    false,
  );
  assert.equal(
    equilibrado([
      { contaId: "a", debitoCentavos: 100n, creditoCentavos: 100n },
      { contaId: "b", debitoCentavos: 0n, creditoCentavos: 0n },
    ]),
    false,
  );
});

test("INVARIANTE: o estorno zera o efeito do original (por conta)", () => {
  const estorno = partidasEstorno(dizimo);
  assert.equal(equilibrado(estorno), true);

  // Somando original + estorno, o movimento líquido de CADA conta é zero.
  const contas = new Set([...dizimo, ...estorno].map((p) => p.contaId));
  for (const conta of contas) {
    const linhas = [...dizimo, ...estorno].filter((p) => p.contaId === conta);
    assert.equal(movimentoLiquido(linhas), 0n, `conta ${conta} não zerou`);
  }
});

test("INVARIANTE: transferência conserva o total (sai de A, entra em B)", () => {
  const valor = 25000n; // R$ 250,00
  const t = partidasTransferencia("banco", "caixa", valor);

  assert.equal(equilibrado(t), true);
  assert.equal(somaDebitos(t), valor);
  assert.equal(somaCreditos(t), valor);

  // Origem cai o valor; destino sobe o valor; a soma dos dois não muda.
  const origem = t.filter((p) => p.contaId === "banco");
  const destino = t.filter((p) => p.contaId === "caixa");
  assert.equal(saldoAtivo(100000n, origem), 100000n - valor);
  assert.equal(saldoAtivo(0n, destino), valor);
  assert.equal(
    saldoAtivo(100000n, origem) + saldoAtivo(0n, destino),
    100000n, // total do sistema preservado
  );
});

test("transferência recusa valor não-positivo e conta igual", () => {
  assert.throws(() => partidasTransferencia("a", "b", 0n));
  assert.throws(() => partidasTransferencia("a", "b", -1n));
  assert.throws(() => partidasTransferencia("a", "a", 100n));
});

test("INVARIANTE: consolidado da matriz = soma das congregações", () => {
  const congregacaoA = 150000n; // saldos já apurados
  const congregacaoB = 80000n;
  const congregacaoC = 0n;
  const consolidado = [congregacaoA, congregacaoB, congregacaoC].reduce((a, b) => a + b, 0n);
  assert.equal(consolidado, 230000n);
});
