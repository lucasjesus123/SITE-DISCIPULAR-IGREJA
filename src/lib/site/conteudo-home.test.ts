import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPOIMENTOS_PADRAO,
  MINISTERIOS_PADRAO,
  parseDepoimentos,
  parseMinisterios,
  serializarDepoimentos,
  serializarMinisterios,
} from "./conteudo-home";

test("parseMinisterios cai no padrão com JSON inválido/vazio/nulo", () => {
  assert.deepEqual(parseMinisterios(null), MINISTERIOS_PADRAO);
  assert.deepEqual(parseMinisterios("{não é json"), MINISTERIOS_PADRAO);
  assert.deepEqual(parseMinisterios("[]"), MINISTERIOS_PADRAO);
  assert.deepEqual(parseMinisterios('{"titulo":"x"}'), MINISTERIOS_PADRAO); // não é array
});

test("parseMinisterios aceita itens válidos e descarta incompletos", () => {
  const json = JSON.stringify([
    { titulo: "Diaconato", descricao: "Serviço à casa." },
    { titulo: "SemDescricao" }, // descartado
    { descricao: "SemTitulo" }, // descartado
  ]);
  const r = parseMinisterios(json);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.titulo, "Diaconato");
});

test("parseDepoimentos idem", () => {
  assert.deepEqual(parseDepoimentos(""), DEPOIMENTOS_PADRAO);
  const json = JSON.stringify([{ texto: "Fui abençoado", nome: "João", papel: "Membro" }, { nome: "só nome" }]);
  const r = parseDepoimentos(json);
  assert.equal(r.length, 1);
  assert.equal(r[0]!.nome, "João");
});

test("serializar descarta incompletos e devolve null se nada válido", () => {
  assert.equal(serializarMinisterios([{ titulo: "", descricao: "" }]), null);
  const s = serializarMinisterios([{ titulo: "Louvor", descricao: "Adoração", icone: "♪" }, { titulo: "x" }]);
  assert.ok(s && JSON.parse(s).length === 1);
  assert.equal(serializarDepoimentos([{ nome: "só nome" }]), null);
});

test("round-trip: serializar → parse mantém os itens válidos", () => {
  const entrada = [{ texto: "T1", nome: "N1", papel: "P1" }, { texto: "T2", nome: "N2", papel: "" }];
  const s = serializarDepoimentos(entrada);
  const r = parseDepoimentos(s);
  assert.equal(r.length, 2);
  assert.equal(r[1]!.papel, "");
});
