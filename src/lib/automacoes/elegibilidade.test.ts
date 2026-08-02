import { test } from "node:test";
import assert from "node:assert/strict";
import { elegiveisBoasVindas, elegiveisConviteRetorno, type PessoaAutomacao } from "./elegibilidade";

const AGORA = Date.UTC(2026, 7, 2, 12, 0, 0); // determinístico
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

function pessoa(over: Partial<PessoaAutomacao>): PessoaAutomacao {
  return {
    id: "p", nome: "Fulano", telefone: "51999990000", status: "VISITANTE",
    criadoEmMs: AGORA, boasVindasEmMs: null, conviteRetornoEmMs: null, ...over,
  };
}

test("boas-vindas: entra visitante cadastrado há 20 min, sem envio e com telefone", () => {
  const elegiveis = elegiveisBoasVindas([pessoa({ criadoEmMs: AGORA - 20 * MIN })], AGORA);
  assert.equal(elegiveis.length, 1);
});

test("boas-vindas: não entra quem cadastrou há 5 min (piso de 15) nem há 2 dias (teto 24h)", () => {
  const recente = pessoa({ id: "a", criadoEmMs: AGORA - 5 * MIN });
  const antigo = pessoa({ id: "b", criadoEmMs: AGORA - 2 * DIA });
  assert.equal(elegiveisBoasVindas([recente, antigo], AGORA).length, 0);
});

test("boas-vindas: não repete para quem já recebeu, nem para quem não é visitante", () => {
  const jaRecebeu = pessoa({ id: "a", criadoEmMs: AGORA - 20 * MIN, boasVindasEmMs: AGORA - 10 * MIN });
  const membro = pessoa({ id: "b", criadoEmMs: AGORA - 20 * MIN, status: "MEMBRO" });
  const semTel = pessoa({ id: "c", criadoEmMs: AGORA - 20 * MIN, telefone: null });
  assert.equal(elegiveisBoasVindas([jaRecebeu, membro, semTel], AGORA).length, 0);
});

test("convite de retorno: entra visitante de 20 dias, ainda visitante, sem convite", () => {
  const elegiveis = elegiveisConviteRetorno([pessoa({ criadoEmMs: AGORA - 20 * DIA })], AGORA);
  assert.equal(elegiveis.length, 1);
});

test("convite de retorno: não entra quem é recente (<14d), muito antigo (>60d) ou já convidado", () => {
  const recente = pessoa({ id: "a", criadoEmMs: AGORA - 5 * DIA });
  const antigo = pessoa({ id: "b", criadoEmMs: AGORA - 80 * DIA });
  const convidado = pessoa({ id: "c", criadoEmMs: AGORA - 20 * DIA, conviteRetornoEmMs: AGORA - DIA });
  assert.equal(elegiveisConviteRetorno([recente, antigo, convidado], AGORA).length, 0);
});

test("convite de retorno: quem virou membro não recebe convite", () => {
  const membro = pessoa({ criadoEmMs: AGORA - 20 * DIA, status: "MEMBRO" });
  assert.equal(elegiveisConviteRetorno([membro], AGORA).length, 0);
});
