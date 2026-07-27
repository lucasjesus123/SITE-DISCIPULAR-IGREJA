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
 * Ordem de confiança: usamos o header `Host` já processado pelo Next
 * (request.nextUrl.hostname), que reflete o que o Nginx repassou. O Nginx
 * está configurado com `server_name` explícito e `proxy_set_header Host
 * $host`, então um Host forjado não chega até aqui — ele bate no
 * `default_server` que devolve 444. Ver nginx/discipular.conf.
 */
function extrairHost(request: NextRequest): string {
  const host = request.nextUrl.hostname || request.headers.get("host") || "";
  return host.toLowerCase().split(":")[0]!.replace(/\.$/, "").trim();
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

export function middleware(request: NextRequest) {
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

  const resposta = NextResponse.next({ request: { headers: headersRequisicao } });

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
