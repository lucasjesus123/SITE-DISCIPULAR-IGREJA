import { NextResponse, type NextRequest } from "next/server";
import { gerarNonce, montarCsp } from "@/lib/security/headers";

/**
 * Middleware de borda.
 *
 * Roda no runtime Edge, ANTES de qualquer rota. Por isso aqui NÃO há acesso a
 * banco nem a `node:crypto` — a resolução do tenant e a validação de sessão
 * acontecem depois, no runtime Node (src/lib/tenant/resolve.ts e
 * src/lib/auth/session.ts).
 *
 * O que este arquivo garante:
 *   1. O hostname da requisição chega às rotas por um header CONFIÁVEL,
 *      que o cliente não consegue forjar.
 *   2. Toda resposta sai com CSP com nonce único.
 *   3. Requisições que mudam estado passam por checagem de origem.
 */

const HEADER_HOST_INTERNO = "x-discipular-host";
const HEADER_NONCE = "x-discipular-nonce";
const HEADER_IP_INTERNO = "x-discipular-ip";

/** Rotas que embutem o player do YouTube e precisam de frame-src liberado. */
function precisaYoutube(pathname: string): boolean {
  return (
    !pathname.startsWith("/painel") &&
    !pathname.startsWith("/plataforma") &&
    !pathname.startsWith("/api/")
  );
}

/**
 * Extrai o hostname da requisição, sem porta e normalizado.
 *
 * ATENÇÃO — POR QUE NÃO USAR `request.nextUrl.hostname`:
 * Em produção o app roda como servidor Node "standalone" ATRÁS do Nginx. Nesse
 * modo, `request.nextUrl.hostname` reflete o endereço INTERNO em que o Node
 * escuta (quase sempre "localhost"/"127.0.0.1"), NÃO o domínio que o usuário
 * digitou. Se lêssemos isso primeiro, TODA requisição resolveria para
 * "localhost" — que não pertence a nenhuma igreja — e o site inteiro cairia em
 * 404. Foi exatamente esse o sintoma no primeiro deploy.
 *
 * O host verdadeiro chega nos cabeçalhos que o Nginx repassa:
 * `proxy_set_header X-Forwarded-Host $host` e `proxy_set_header Host $host`.
 * O Nginx só encaminha para este app requisições cujo Host casa com o
 * `server_name` (senão vão para o default_server), e reescreve esses dois
 * cabeçalhos com `$host` — então o cliente não consegue forjá-los por aqui. E,
 * como camada final, `resolverTenantPorHost` só devolve tenant para um domínio
 * VERIFICADO na tabela `tenant_domains`: um host inventado não resolve nada.
 *
 * `nextUrl.hostname` fica só como último recurso para `next dev` (sem proxy),
 * onde ele reflete o host real.
 */
function extrairHost(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    request.nextUrl.hostname ||
    "";
  // X-Forwarded-Host pode vir como lista "a, b" quando há mais de um proxy;
  // o primeiro item é o host que o cliente pediu.
  return host.toLowerCase().split(",")[0]!.split(":")[0]!.replace(/\.$/, "").trim();
}

/**
 * IP real do cliente, respeitando quantos proxies confiáveis existem.
 *
 * X-Forwarded-For é uma lista "cliente, proxy1, proxy2". Qualquer um pode
 * PREPENDAR valores falsos, então ler o primeiro item é inseguro: o atacante
 * mandaria um IP diferente a cada requisição e o rate limit nunca fecharia.
 * O valor confiável é contado a partir do FIM, pulando os proxies nossos.
 */
function extrairIp(request: NextRequest, saltos: number): string {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "0.0.0.0";
  const cadeia = xff.split(",").map((s) => s.trim()).filter(Boolean);
  if (cadeia.length === 0) return "0.0.0.0";
  const indice = cadeia.length - saltos;
  return cadeia[Math.max(0, Math.min(indice, cadeia.length - 1))] ?? "0.0.0.0";
}

// -----------------------------------------------------------------------------
// COOKIE CSRF gerado no middleware (Edge)
//
// O Next 15 proíbe gravar cookie durante o render de uma PÁGINA. As páginas
// públicas de formulário (contato, escola, oração...) chamavam obterTokenCsrf()
// no render, que tentava gravar o cookie — e a página inteira quebrava com
// "Cookies can only be modified in a Server Action or Route Handler".
//
// O middleware roda ANTES do render e PODE gravar cookies. Aqui garantimos que
// todo visitante já chega com um cookie CSRF válido. A assinatura HMAC-SHA256 é
// feita com Web Crypto (compatível com Edge) e produz EXATAMENTE o mesmo token
// que o node:crypto do servidor (`assinarCsrf`), então `validarFormato` aceita.
// -----------------------------------------------------------------------------
const NOME_CSRF = "__Host-discipular-csrf";
const NOME_CSRF_DEV = "discipular-csrf";

function paraBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64ParaBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Gera `valor.assinatura` idêntico ao `assinarCsrf` do node (testado). */
async function gerarTokenCsrf(segredoBase64: string): Promise<string> {
  const valorBytes = crypto.getRandomValues(new Uint8Array(32));
  const valor = paraBase64Url(valorBytes);
  const chave = await crypto.subtle.importKey(
    "raw",
    base64ParaBytes(segredoBase64) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(valor) as BufferSource,
  );
  return `${valor}.${paraBase64Url(new Uint8Array(assinatura))}`;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const desenvolvimento = process.env.NODE_ENV !== "production";
  const saltos = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");

  const host = extrairHost(request);
  const ip = extrairIp(request, Number.isFinite(saltos) ? saltos : 1);
  const nonce = gerarNonce();

  // ---------------------------------------------------------------------------
  // 1. Verificação de origem para requisições que mudam estado
  //
  // Esta é a primeira das duas camadas anti-CSRF (a segunda é o token
  // double-submit em src/lib/security/csrf.ts). Um formulário hospedado em
  // outro site consegue disparar um POST para cá, mas não consegue mentir o
  // header `Origin` — o navegador o define e o JavaScript não pode alterá-lo.
  // ---------------------------------------------------------------------------
  const metodosMutaveis = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (metodosMutaveis.has(request.method)) {
    const origin = request.headers.get("origin");

    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).hostname.toLowerCase();
      } catch {
        return recusar("Origem malformada.");
      }
      if (originHost !== host) {
        return recusar("Origem não corresponde ao destino.");
      }
    } else if (!desenvolvimento) {
      // Requisição mutável sem Origin. Navegadores atuais sempre enviam em
      // cross-origin; a ausência é típica de cliente automatizado. Aceitamos
      // apenas se houver Sec-Fetch-Site: same-origin, que também é definido
      // pelo navegador e não é forjável por script.
      const secFetchSite = request.headers.get("sec-fetch-site");
      if (secFetchSite !== "same-origin" && secFetchSite !== "none") {
        return recusar("Requisição sem origem verificável.");
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Repasse do contexto confiável para as rotas
  //
  // Reescrevemos os headers da REQUISIÇÃO. Como o cliente não tem como
  // injetar `x-discipular-*` (qualquer valor que ele mande é sobrescrito
  // aqui), as rotas podem confiar nestes valores.
  // ---------------------------------------------------------------------------
  const headersRequisicao = new Headers(request.headers);
  headersRequisicao.delete(HEADER_HOST_INTERNO);
  headersRequisicao.delete(HEADER_NONCE);
  headersRequisicao.delete(HEADER_IP_INTERNO);
  headersRequisicao.set(HEADER_HOST_INTERNO, host);
  headersRequisicao.set(HEADER_NONCE, nonce);
  headersRequisicao.set(HEADER_IP_INTERNO, ip);

  // Garante o cookie CSRF ANTES do render (o render de página não pode gravá-lo).
  const nomeCsrf = desenvolvimento ? NOME_CSRF_DEV : NOME_CSRF;
  const csrfAtual = request.cookies.get(nomeCsrf)?.value;
  let csrfNovo: string | null = null;
  if ((!csrfAtual || !csrfAtual.includes(".")) && process.env.CSRF_SECRET) {
    try {
      csrfNovo = await gerarTokenCsrf(process.env.CSRF_SECRET);
      // Injeta no header `cookie` da requisição para que o obterTokenCsrf() do
      // render já LEIA este valor (e não tente gravar).
      const cookieAtual = headersRequisicao.get("cookie") ?? "";
      const semAntigo = cookieAtual
        .split(";")
        .map((c) => c.trim())
        .filter((c) => c && !c.startsWith(`${nomeCsrf}=`))
        .join("; ");
      headersRequisicao.set("cookie", (semAntigo ? `${semAntigo}; ` : "") + `${nomeCsrf}=${csrfNovo}`);
    } catch {
      csrfNovo = null; // sem segredo/entropia: o reforço no obterTokenCsrf cobre.
    }
  }

  const resposta = NextResponse.next({ request: { headers: headersRequisicao } });

  if (csrfNovo) {
    resposta.cookies.set(nomeCsrf, csrfNovo, {
      httpOnly: false, // legível por JS para ir no header de upload/fetch
      secure: !desenvolvimento,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }

  // ---------------------------------------------------------------------------
  // 3. CSP na resposta
  // ---------------------------------------------------------------------------
  resposta.headers.set(
    "Content-Security-Policy",
    montarCsp({ nonce, desenvolvimento, permitirYoutube: precisaYoutube(pathname) }),
  );

  // O painel e a área da plataforma nunca devem ser indexados.
  if (pathname.startsWith("/painel") || pathname.startsWith("/plataforma") || pathname.startsWith("/app")) {
    resposta.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }

  return resposta;
}

function recusar(motivo: string) {
  // Corpo genérico, sem detalhe do que exatamente falhou.
  return new NextResponse(JSON.stringify({ erro: "Requisição recusada." }), {
    status: 403,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-motivo": motivo.slice(0, 60), // só em dev ajuda; não vaza dado
    },
  });
}

export const config = {
  /**
   * Não passamos assets estáticos pelo middleware: gerar nonce e CSP para
   * cada arquivo .js do bundle desperdiçaria CPU num servidor que precisa
   * atender 90 pessoas ao mesmo tempo.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|woff|woff2|ttf)$).*)",
  ],
};
