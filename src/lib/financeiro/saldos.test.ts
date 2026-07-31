import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ativoPorCongregacao,
  consolidadoAtivo,
  saldoPorNatureza,
  totaisResultado,
  type SaldoConta,
} from "./saldos";

test("saldoPorNatureza interpreta cada natureza corretamente", () => {
  // ATIVO: inicial + débitos - créditos
  assert.equal(saldoPorNatureza("ATIVO", 10000n, 5000n, 2000n), 13000n);
  // DESPESA: débitos - créditos
  assert.equal(saldoPorNatureza("DESPESA", 0n, 1200n, 0n), 1200n);
  // RECEITA: créditos - débitos
  assert.equal(saldoPorNatureza("RECEITA", 0n, 0n, 3000n), 3000n);
});

const saldos: SaldoConta[] = [
  { id: "a", codigo: "1.1.1", nome: "Caixa Sede", natureza: "ATIVO", campusId: "sede", saldoCentavos: 150000n },
  { id: "b", codigo: "1.1.2", nome: "Banco Sede", natureza: "ATIVO", campusId: "sede", saldoCentavos: 50000n },
  { id: "c", codigo: "1.2.1", nome: "Caixa VC", natureza: "ATIVO", campusId: "vc", saldoCentavos: 64000n },
  { id: "d", codigo: "3.1", nome: "Dízimos", natureza: "RECEITA", campusId: null, saldoCentavos: 214000n },
  { id: "e", codigo: "4.1", nome: "Aluguel", natureza: "DESPESA", campusId: null, saldoCentavos: 120000n },
];

test("INVARIANTE: consolidado = soma das contas de ativo", () => {
  assert.equal(consolidadoAtivo(saldos), 150000n + 50000n + 64000n);
});

test("INVARIANTE: consolidado = soma dos saldos por congregação", () => {
  const porCong = ativoPorCongregacao(saldos);
  assert.equal(porCong.get("sede"), 200000n);
  assert.equal(porCong.get("vc"), 64000n);
  const somaCongregacoes = [...porCong.values()].reduce((a, b) => a + b, 0n);
  assert.equal(somaCongregacoes, consolidadoAtivo(saldos));
});

test("totaisResultado separa receitas e despesas", () => {
  const { receitas, despesas } = totaisResultado(saldos);
  assert.equal(receitas, 214000n);
  assert.equal(despesas, 120000n);
});
