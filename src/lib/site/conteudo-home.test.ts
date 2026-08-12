import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPOIMENTOS_PADRAO,
  MINISTERIOS_PADRAO,
  parseDepoimentos,
  parseMinisterios,
  serializarDepoimentos,
  serializarMinisterios,
  BOAS_VINDAS_PADRAO,
  parseBoasVindas,
  serializarBoasVindas,
  SECOES_HOME_PADRAO,
  parseSecoesHome,
  serializarSecoesHome,
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

// --- Boas-vindas ("Novo por aqui" + versículo do topo) -----------------------
test("parseBoasVindas: nulo/JSON quebrado volta ao padrão inteiro", () => {
  assert.deepEqual(parseBoasVindas(null), BOAS_VINDAS_PADRAO);
  assert.deepEqual(parseBoasVindas("{quebrado"), BOAS_VINDAS_PADRAO);
  assert.deepEqual(parseBoasVindas("[]"), BOAS_VINDAS_PADRAO); // array não é objeto
});

test("parseBoasVindas: campo vazio cai no padrão, campo preenchido prevalece (por campo)", () => {
  const json = JSON.stringify({ titulo: "Bem-vindo à Sede!", lead: "", cards: [{ titulo: "Recepção", texto: "" }] });
  const r = parseBoasVindas(json);
  assert.equal(r.titulo, "Bem-vindo à Sede!");
  assert.equal(r.lead, BOAS_VINDAS_PADRAO.lead); // vazio → padrão
  assert.equal(r.cards.length, 4); // sempre 4 (ícones fixos)
  assert.equal(r.cards[0]!.titulo, "Recepção");
  assert.equal(r.cards[0]!.texto, BOAS_VINDAS_PADRAO.cards[0]!.texto); // vazio → padrão
  assert.equal(r.cards[3]!.titulo, BOAS_VINDAS_PADRAO.cards[3]!.titulo); // ausente → padrão
});

test("serializarBoasVindas: tudo em branco devolve null (volta ao padrão)", () => {
  assert.equal(serializarBoasVindas({ titulo: "", lead: "", frase: "", versiculo: "", cards: [{ titulo: "", texto: "" }] }), null);
});

test("round-trip boas-vindas: serializar → parse mantém o que foi editado", () => {
  const s = serializarBoasVindas({ titulo: "Casa de Discípulos", versiculo: "Salmos 122:1", cards: [{ titulo: "Café", texto: "Chegue 15min antes" }] });
  const r = parseBoasVindas(s);
  assert.equal(r.titulo, "Casa de Discípulos");
  assert.equal(r.versiculo, "Salmos 122:1");
  assert.equal(r.cards[0]!.titulo, "Café");
  assert.equal(r.lead, BOAS_VINDAS_PADRAO.lead); // não editado → padrão
});

// --- Seções (app, passos, faixas) --------------------------------------------
test("parseSecoesHome: nulo/quebrado volta ao padrão", () => {
  assert.deepEqual(parseSecoesHome(null), SECOES_HOME_PADRAO);
  assert.deepEqual(parseSecoesHome("{x"), SECOES_HOME_PADRAO);
});

test("parseSecoesHome: por campo, com arrays de tamanho fixo", () => {
  const json = JSON.stringify({
    appTitulo: "Baixe o Discipular",
    appRecursos: ["Só o primeiro"],
    passos: [{ titulo: "Decidi seguir Jesus", texto: "" }],
    celulasTitulo: "",
  });
  const r = parseSecoesHome(json);
  assert.equal(r.appTitulo, "Baixe o Discipular");
  assert.equal(r.appRecursos.length, 6);
  assert.equal(r.appRecursos[0], "Só o primeiro");
  assert.equal(r.appRecursos[1], SECOES_HOME_PADRAO.appRecursos[1]); // ausente → padrão
  assert.equal(r.passos.length, 5);
  assert.equal(r.passos[0]!.titulo, "Decidi seguir Jesus");
  assert.equal(r.passos[0]!.texto, SECOES_HOME_PADRAO.passos[0]!.texto); // vazio → padrão
  assert.equal(r.celulasTitulo, SECOES_HOME_PADRAO.celulasTitulo);
});

test("serializarSecoesHome: nada preenchido devolve null; round-trip mantém edições", () => {
  assert.equal(serializarSecoesHome({}), null);
  const s = serializarSecoesHome({ oracaoTitulo: "Ore conosco", minisTitulo: "Sirva com a gente", appRecursos: ["Ao vivo"], passos: [{ titulo: "Sim!", texto: "" }] });
  const r = parseSecoesHome(s);
  assert.equal(r.oracaoTitulo, "Ore conosco");
  assert.equal(r.minisTitulo, "Sirva com a gente");
  assert.equal(r.contatoTitulo, SECOES_HOME_PADRAO.contatoTitulo);
  assert.equal(r.appRecursos[0], "Ao vivo");
  assert.equal(r.passos[0]!.titulo, "Sim!");
  assert.equal(r.newsletterTitulo, SECOES_HOME_PADRAO.newsletterTitulo); // não editado → padrão
});

test("menu editável: vazio volta ao padrão; round-trip mantém itens válidos", () => {
  assert.deepEqual(parseSecoesHome(JSON.stringify({ menu: [] })).menu, SECOES_HOME_PADRAO.menu);
  const s = serializarSecoesHome({ menu: [{ label: "Início", href: "/" }, { label: "só rótulo", href: "" }] });
  const r = parseSecoesHome(s);
  assert.equal(r.menu.length, 1); // item sem destino é descartado
  assert.equal(r.menu[0]!.label, "Início");
  assert.equal(r.menu[0]!.href, "/");
});
