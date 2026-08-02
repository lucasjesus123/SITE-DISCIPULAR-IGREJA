import { test } from "node:test";
import assert from "node:assert/strict";
import { comporDisparosAniversario, telefoneWhatsApp } from "./aniversario-disparo";
import type { ItemAniv } from "@/lib/painel/aniversariantes";

test("telefoneWhatsApp normaliza os formatos brasileiros", () => {
  assert.equal(telefoneWhatsApp("(51) 99999-8888"), "5551999998888");
  assert.equal(telefoneWhatsApp("5199998888"), "555199998888"); // fixo 10 dígitos → +55
  assert.equal(telefoneWhatsApp("5551999998888"), "5551999998888"); // já com DDI
  assert.equal(telefoneWhatsApp("+55 (51) 99999-8888"), "5551999998888");
});

test("telefoneWhatsApp recusa números implausíveis", () => {
  assert.equal(telefoneWhatsApp(null), null);
  assert.equal(telefoneWhatsApp(""), null);
  assert.equal(telefoneWhatsApp("123"), null);
  assert.equal(telefoneWhatsApp("999999999999999"), null);
});

const templates = {
  vida: "Feliz aniversário, {nome}! A {igreja} celebra com você!",
  batismo: "{nome}, hoje é seu aniversário de batismo na {igreja}!",
};

test("comporDisparosAniversario gera mensagem personalizada por tipo", () => {
  const itens: ItemAniv[] = [
    { id: "p1-v", nome: "Mariana Souza", telefone: "(51) 99999-0001", tipo: "vida", dia: 2, mes: 8 },
    { id: "p2-b", nome: "João Reis", telefone: "51988887777", tipo: "batismo", dia: 2, mes: 8 },
  ];
  const msgs = comporDisparosAniversario(itens, templates, "Discipular");
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0]!.telefoneWhatsApp, "5551999990001");
  assert.ok(msgs[0]!.texto.includes("Mariana"), "usa o primeiro nome");
  assert.ok(msgs[0]!.texto.includes("Discipular"));
  assert.equal(msgs[1]!.tipo, "batismo");
  assert.ok(msgs[1]!.texto.includes("aniversário de batismo"));
});

test("comporDisparosAniversario pula quem não tem telefone válido", () => {
  const itens: ItemAniv[] = [
    { id: "p1-v", nome: "Sem Telefone", telefone: null, tipo: "vida", dia: 2, mes: 8 },
    { id: "p2-v", nome: "Zé Curto", telefone: "123", tipo: "vida", dia: 2, mes: 8 },
  ];
  assert.equal(comporDisparosAniversario(itens, templates, "Discipular").length, 0);
});
