import { test } from "node:test";
import assert from "node:assert/strict";
import { passosOnboarding, progressoOnboarding, type EstadoOnboarding } from "./onboarding";

const cheio: EstadoOnboarding = {
  temAdmin: true, modulosDefinidos: true, dominioVerificado: true,
  temLogo: true, whatsappConectado: true, pixConfigurado: true,
};

test("passosOnboarding reflete cada estado", () => {
  const passos = passosOnboarding({ ...cheio, dominioVerificado: false });
  const dominio = passos.find((p) => p.chave === "dominio")!;
  assert.equal(dominio.feito, false);
  assert.equal(passos.find((p) => p.chave === "admin")!.feito, true);
});

test("progresso conta só os passos essenciais", () => {
  // Essenciais: admin, modulos, dominio. Opcionais: logo, whatsapp, pix.
  const semOpcionais: EstadoOnboarding = {
    temAdmin: true, modulosDefinidos: true, dominioVerificado: true,
    temLogo: false, whatsappConectado: false, pixConfigurado: false,
  };
  const p = progressoOnboarding(passosOnboarding(semOpcionais));
  assert.equal(p.total, 3);
  assert.equal(p.feitos, 3);
  assert.equal(p.pct, 100);
  assert.equal(p.noAr, true, "opcionais pendentes não impedem ir ao ar");
});

test("progresso parcial quando falta um essencial", () => {
  const p = progressoOnboarding(passosOnboarding({ ...cheio, dominioVerificado: false }));
  assert.equal(p.feitos, 2);
  assert.equal(p.total, 3);
  assert.equal(p.noAr, false);
  assert.equal(p.pct, 67);
});
