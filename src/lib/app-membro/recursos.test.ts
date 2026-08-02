import { test } from "node:test";
import assert from "node:assert/strict";
import {
  itensDoPerfil,
  navDoApp,
  recursoDisponivel,
  TOGGLES_PADRAO,
  type ContextoMembro,
} from "./recursos";

const ctxCompleto: ContextoMembro = {
  pixConfigurado: true,
  temFilhoKids: true,
  serveMinisterio: true,
  emCelula: true,
};
const ctxVazio: ContextoMembro = {
  pixConfigurado: false,
  temFilhoKids: false,
  serveMinisterio: false,
  emCelula: false,
};

test("Início e Perfil estão sempre na navegação (base)", () => {
  const nav = navDoApp({ ...TOGGLES_PADRAO, palavra: false, contribuir: false, agenda: false, celula: false }, ctxVazio);
  const chaves = nav.map((i) => i.chave);
  assert.deepEqual(chaves, ["inicio", "perfil"]);
});

test("recurso desligado no toggle some da navegação", () => {
  const nav = navDoApp({ ...TOGGLES_PADRAO, agenda: false }, { ...ctxCompleto, emCelula: false });
  assert.equal(nav.some((i) => i.chave === "agenda"), false);
  assert.equal(nav.some((i) => i.chave === "palavra"), true);
});

test("Contribuir exige gateway PIX ativo (senão fica oculto, não quebrado)", () => {
  const semPix = navDoApp(TOGGLES_PADRAO, { ...ctxVazio, pixConfigurado: false });
  assert.equal(semPix.some((i) => i.chave === "contribuir"), false);
  const comPix = navDoApp(TOGGLES_PADRAO, { ...ctxVazio, pixConfigurado: true });
  assert.equal(comPix.some((i) => i.chave === "contribuir"), true);
});

test("Minha Célula aparece só com toggle ligado E membro em célula", () => {
  const ligadoSemVinculo = navDoApp({ ...TOGGLES_PADRAO, celula: true }, { ...ctxVazio, emCelula: false });
  assert.equal(ligadoSemVinculo.some((i) => i.chave === "celula"), false);
  const ligadoComVinculo = navDoApp({ ...TOGGLES_PADRAO, celula: true, contribuir: false }, { ...ctxVazio, emCelula: true });
  assert.equal(ligadoComVinculo.some((i) => i.chave === "celula"), true);
});

test("a tabbar nunca passa de 5 itens e mantém as âncoras", () => {
  const nav = navDoApp({ ...TOGGLES_PADRAO, celula: true }, ctxCompleto);
  assert.ok(nav.length <= 5, `esperava <=5, veio ${nav.length}`);
  assert.equal(nav[0]!.chave, "inicio");
  assert.equal(nav[nav.length - 1]!.chave, "perfil");
});

test("itensDoPerfil libera Meus Filhos / Minhas Escalas só por vínculo", () => {
  assert.deepEqual(itensDoPerfil(ctxVazio), ["contribuicoes", "privacidade"]);
  const comVinculo = itensDoPerfil(ctxCompleto) as string[];
  assert.ok(comVinculo.includes("meus_filhos"));
  assert.ok(comVinculo.includes("minhas_escalas"));
});

test("recursoDisponivel reflete a navegação calculada", () => {
  assert.equal(recursoDisponivel("contribuir", TOGGLES_PADRAO, ctxCompleto), true);
  assert.equal(recursoDisponivel("contribuir", { ...TOGGLES_PADRAO, contribuir: false }, ctxCompleto), false);
});
