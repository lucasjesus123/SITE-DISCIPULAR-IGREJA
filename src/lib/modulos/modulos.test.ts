import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itemLiberado,
  moduloAtivo,
  MODULOS_PADRAO,
  normalizarModulos,
  type ConfigModulos,
} from "./modulos";

test("moduloAtivo: gestao é essencial e sempre ligado", () => {
  assert.equal(moduloAtivo({ gestao: false } as Partial<ConfigModulos>, "gestao"), true);
  assert.equal(moduloAtivo(null, "gestao"), true);
});

test("moduloAtivo: respeita o config e cai no padrão quando ausente", () => {
  assert.equal(moduloAtivo({ louvor: false }, "louvor"), false);
  assert.equal(moduloAtivo({ louvor: true }, "louvor"), true);
  assert.equal(moduloAtivo({}, "kids"), MODULOS_PADRAO.kids); // padrão = true
  assert.equal(moduloAtivo(null, "financeiro"), true);
});

test("normalizarModulos completa o conjunto e força gestao=true", () => {
  const n = normalizarModulos({ site: false, gestao: false });
  assert.equal(n.gestao, true, "gestao nunca desliga");
  assert.equal(n.site, false);
  assert.equal(n.app, true); // não informado → padrão
  // Todas as chaves presentes
  assert.equal(Object.keys(n).length, Object.keys(MODULOS_PADRAO).length);
});

test("itemLiberado exige módulo ligado E permissão", () => {
  const cfg: ConfigModulos = { ...MODULOS_PADRAO, louvor: false };
  // módulo ligado + permissão → aparece
  assert.equal(itemLiberado(MODULOS_PADRAO, "louvor", true), true);
  // módulo desligado → não aparece nem com permissão
  assert.equal(itemLiberado(cfg, "louvor", true), false);
  // sem permissão → não aparece nem com módulo ligado
  assert.equal(itemLiberado(MODULOS_PADRAO, "louvor", false), false);
  // item sem módulo (base) → só depende da permissão
  assert.equal(itemLiberado(cfg, undefined, true), true);
  assert.equal(itemLiberado(cfg, undefined, false), false);
});

test("igreja 'só Louvor': só o módulo louvor liga (fora os essenciais)", () => {
  const soLouvor = normalizarModulos({
    site: false, app: false, kids: false, financeiro: false, inscricoes: false,
    celulas: false, escola: false, comunicacao: false, louvor: true,
  });
  assert.equal(moduloAtivo(soLouvor, "louvor"), true);
  assert.equal(moduloAtivo(soLouvor, "kids"), false);
  assert.equal(moduloAtivo(soLouvor, "site"), false);
  assert.equal(moduloAtivo(soLouvor, "gestao"), true); // essencial
});
