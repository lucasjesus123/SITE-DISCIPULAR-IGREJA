// =============================================================================
// QA SMOKE — teste de fumaça do site ao vivo (Playwright, autossuficiente)
// =============================================================================
//
// Roda ONDE ALCANÇA a URL de produção (na sua VPS ou máquina) — o ambiente do
// Claude é isolado e não chega no seu domínio. Um único arquivo, sem depender
// de framework de QA. Só precisa do Playwright + Chromium instalados.
//
// USO (na VPS, dentro do repo):
//   npm i -g playwright && npx playwright install chromium
//   NODE_PATH="$(npm root -g)" BASE_URL="https://discipularigreja.com.br" \
//     node qa/smoke.mjs
//
//   # Opcional — também entra no painel (somente leitura, não cria nada):
//   NODE_PATH="$(npm root -g)" BASE_URL="https://discipularigreja.com.br" \
//     PANEL_EMAIL="admin@..." PANEL_PASSWORD="..." node qa/smoke.mjs
//
// O QUE FAZ (100% leitura — NÃO envia formulário, NÃO cria registro):
//   • abre cada página pública, coleta status HTTP, título, erros de console e
//     exceções da página, e tira um screenshot;
//   • confere se o conteúdo esperado renderizou (âncoras de texto por página);
//   • se PANEL_EMAIL/PANEL_PASSWORD vierem, faz login e abre algumas telas do
//     painel (também só leitura);
//   • grava tudo em qa/runs/<timestamp>/ (screenshots + report.json) e imprime
//     um resumo. Sai com código 1 se algo falhar (bom para CI).
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// Playwright é resolvido via `require` (não via `import`) de propósito: o
// `import` de ESM ignora o NODE_PATH, então o Playwright instalado GLOBALMENTE
// (npm i -g playwright) não seria encontrado. O `require` do CommonJS honra o
// NODE_PATH — por isso `NODE_PATH="$(npm root -g)" node qa/smoke.mjs` funciona.
// Se preferir instalar local (`npm i playwright` no repo), também resolve.
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = (process.env.BASE_URL || "https://discipularigreja.com.br").replace(/\/$/, "");
const OUT = join("qa", "runs", new Date().toISOString().replace(/[:.]/g, "-"));
mkdirSync(OUT, { recursive: true });

// Páginas públicas + âncoras de conteúdo esperadas (prova de que renderizou).
const PUBLICAS = [
  { path: "/", esperar: [] },
  { path: "/mensagens", esperar: ["Mensagens"] },
  { path: "/celulas", esperar: ["élula"] },
  { path: "/escola", esperar: ["Escola", "Cursos"] },
  { path: "/contribua", esperar: ["PIX"] },
  { path: "/contato", esperar: ["Contato"] },
  { path: "/agenda", esperar: [] },
  { path: "/login", esperar: ["ntrar", "senha", "mail"] },
];

const PAINEL = ["/painel", "/painel/pessoas", "/painel/site", "/painel/cursos", "/painel/celulas"];

const resultados = [];
let falhas = 0;

function slug(p) {
  return p === "/" ? "home" : p.replace(/^\//, "").replace(/\//g, "_");
}

async function visitar(page, path, { esperar = [], area = "publica" } = {}) {
  const url = BASE + path;
  const erros = [];
  const onConsole = (m) => m.type() === "error" && erros.push(m.text().slice(0, 300));
  const onPageErr = (e) => erros.push("PAGEERROR: " + String(e).slice(0, 300));
  page.on("console", onConsole);
  page.on("pageerror", onPageErr);

  let status = 0;
  let titulo = "";
  let faltando = [];
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
    status = resp ? resp.status() : 0;
    titulo = await page.title().catch(() => "");
    const corpo = await page.content();
    faltando = esperar.filter((t) => !corpo.includes(t));
    await page.screenshot({ path: join(OUT, `${area}_${slug(path)}.png`), fullPage: true }).catch(() => {});
  } catch (e) {
    erros.push("NAVEGACAO: " + String(e).slice(0, 300));
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageErr);
  }

  const ok = status >= 200 && status < 400 && erros.length === 0 && faltando.length === 0;
  if (!ok) falhas += 1;
  const r = { area, path, status, titulo, faltando, erros };
  resultados.push(r);
  const marca = ok ? "OK " : "XX ";
  console.log(`${marca}${String(status).padStart(3)}  ${path}` +
    (faltando.length ? `  [faltou: ${faltando.join(", ")}]` : "") +
    (erros.length ? `  [${erros.length} erro(s) console]` : ""));
  return r;
}

async function talvezLogar(context, page) {
  const email = process.env.PANEL_EMAIL;
  const senha = process.env.PANEL_PASSWORD;
  if (!email || !senha) {
    console.log("\n(painel pulado — defina PANEL_EMAIL e PANEL_PASSWORD para incluí-lo)");
    return false;
  }
  if (senha === "SUA_SENHA") {
    console.log("\n== Painel ==  PANEL_PASSWORD ainda é o placeholder 'SUA_SENHA' — troque pela senha real.");
    return false;
  }
  console.log("\n== Painel (login somente leitura) ==");
  try {
    await page.goto(BASE + "/login", { waitUntil: "networkidle", timeout: 45_000 });

    // Localiza os campos de forma tolerante e AVISA se não achar (assim
    // distinguimos "senha errada" de "formulário diferente do esperado").
    const campoEmail = page.locator('input[type="email"], input[name="email"]').first();
    const campoSenha = page.locator('input[type="password"], input[name="senha"], input[name="password"]').first();
    if (!(await campoEmail.count()) || !(await campoSenha.count())) {
      console.log("login NÃO testado: não achei os campos de e-mail/senha nesta tela de login.");
      await page.screenshot({ path: join(OUT, "painel_login-form-nao-encontrado.png"), fullPage: true }).catch(() => {});
      return false;
    }

    await campoEmail.fill(email);
    await campoSenha.fill(senha);
    await page.click('button[type="submit"], button:has-text("Entrar"), button:has-text("Acessar")').catch(() => {});

    // Login costuma ser fetch + redirecionamento client-side: esperamos sair
    // de /login por até 20s, sem falhar o processo se não sair.
    await page.waitForURL((u) => !String(u).includes("/login"), { timeout: 20_000 }).catch(() => {});

    const logou = !/\/login(\?|$|#|\/)/.test(page.url());
    if (logou) {
      console.log("login OK → " + page.url());
      return true;
    }

    // Não saiu de /login: capture a mensagem de erro visível (prova do motivo).
    const msg = await page
      .locator('[role="alert"], .alerta, .erro, .form__erro, [data-erro]')
      .first()
      .innerText()
      .catch(() => "");
    console.log("login NÃO confirmou (segue em /login)" + (msg ? ` · mensagem da tela: "${msg.trim().slice(0, 160)}"` : " · sem mensagem visível (provável senha incorreta)"));
    await page.screenshot({ path: join(OUT, "painel_login-falhou.png"), fullPage: true }).catch(() => {});
    return false;
  } catch (e) {
    console.log("falha no login:", String(e).slice(0, 200));
    return false;
  }
}

const navegador = await chromium.launch();
const context = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();

console.log(`\n== Smoke em ${BASE} ==  (evidências em ${OUT})\n`);
console.log("== Público (somente leitura) ==");
for (const p of PUBLICAS) await visitar(page, p.path, { esperar: p.esperar, area: "publica" });

if (await talvezLogar(context, page)) {
  for (const p of PAINEL) await visitar(page, p, { area: "painel" });
}

await navegador.close();

const total = resultados.length;
const passou = total - falhas;
const pct = total ? Math.round((passou / total) * 100) : 0;
writeFileSync(join(OUT, "report.json"), JSON.stringify({ base: BASE, total, passou, falhas, pct, resultados }, null, 2));

console.log(`\n== Resumo ==  ${passou}/${total} telas OK (${pct}%) · falhas: ${falhas}`);
console.log(`Evidências: ${OUT}/  (screenshots + report.json)`);
process.exit(falhas > 0 ? 1 : 0);
