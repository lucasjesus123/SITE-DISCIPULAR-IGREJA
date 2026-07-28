import { cookies } from "next/headers";
import { gerarToken, assinarCsrf, verificarAssinaturaCsrf } from "@/lib/crypto";
import { isProd } from "@/lib/env";

/**
 * Proteção CSRF por double-submit assinado.
 *
 * POR QUE PRECISAMOS DISSO
 * A sessão é mantida em cookie (e não em Authorization: Bearer). Cookie é
 * enviado automaticamente pelo navegador em qualquer requisição para o
 * domínio — inclusive numa disparada por um site malicioso. Sem proteção, uma
 * página em `site-do-atacante.com` poderia fazer o pastor logado excluir
 * membros só por visitá-la.
 *
 * POR QUE COOKIE E NÃO BEARER TOKEN
 * Token em localStorage é legível por qualquer XSS. Cookie HttpOnly não é.
 * Trocamos um risco (CSRF, que tem defesa determinística) por outro (XSS, que
 * não tem) — e ficamos com o que dá para resolver de verdade.
 *
 * AS TRÊS CAMADAS
 *   1. SameSite=Lax no cookie de sessão. Bloqueia POST cross-site na maioria
 *      dos navegadores atuais. Sozinho não basta: não cobre navegador antigo
 *      nem subdomínio comprometido.
 *   2. Verificação de Origin/Sec-Fetch-Site no middleware.
 *   3. Este token double-submit. É o que continua valendo mesmo se um
 *      subdomínio do cliente for comprometido, cenário em que "same-site"
 *      deixa de ser garantia.
 */

const COOKIE_CSRF = "__Host-discipular-csrf";
export const CAMPO_CSRF = "_csrf";
export const HEADER_CSRF = "x-csrf-token";

/**
 * Nome com prefixo `__Host-`: o navegador só aceita esse cookie se ele vier
 * com Secure, Path=/ e SEM atributo Domain. Isso impede que um subdomínio
 * comprometido (ex.: um site do cliente hospedado em blog.igreja.com.br)
 * sobrescreva o cookie CSRF do domínio principal.
 *
 * Em desenvolvimento (http://localhost) o prefixo `__Host-` não funciona
 * porque exige Secure, então caímos para um nome simples.
 */
function nomeCookie(): string {
  return isProd ? COOKIE_CSRF : "discipular-csrf";
}

/**
 * Garante que existe um token CSRF para esta sessão de navegador e o devolve.
 * Chamado nos Server Components que renderizam formulários.
 */
export async function obterTokenCsrf(): Promise<string> {
  const jar = await cookies();
  const existente = jar.get(nomeCookie())?.value;

  if (existente && validarFormato(existente)) {
    return existente;
  }

  const valor = gerarToken(32);
  const token = `${valor}.${assinarCsrf(valor)}`;

  // O Next 15 PROÍBE gravar cookie durante o render de uma página (só em Server
  // Action ou Route Handler). Numa página pública de formulário (contato,
  // escola) isso lançava exceção e derrubava a página inteira. Quem GARANTE o
  // cookie é o middleware (src/middleware.ts), que roda antes e pode gravá-lo.
  // Aqui o set é só um reforço: se falhar (contexto de render), engolimos o
  // erro e devolvemos o token — a página renderiza e o cookie do middleware
  // cobre o envio do formulário.
  try {
    jar.set(nomeCookie(), token, {
      httpOnly: false, // precisa ser legível por JS para ir no header em fetch()
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  } catch {
    // Render de página: o middleware já cuidou (ou cuidará) do cookie.
  }

  return token;
}

/**
 * Valida o token de uma requisição mutável.
 *
 * O token pode chegar por header (fetch/JSON) ou por campo oculto do
 * formulário (POST tradicional e Server Actions).
 *
 * Retorna `true` só se as três condições valerem:
 *   - existe cookie CSRF
 *   - existe token na requisição
 *   - os dois são idênticos E a assinatura confere
 *
 * A assinatura é o que impede o "cookie tossing": sem ela, um atacante que
 * conseguisse definir um cookie no domínio poderia escolher o par
 * cookie+token e passar na comparação.
 */
export async function validarCsrf(request: Request): Promise<boolean> {
  const jar = await cookies();
  const doCookie = jar.get(nomeCookie())?.value;
  if (!doCookie || !validarFormato(doCookie)) return false;

  let daRequisicao = request.headers.get(HEADER_CSRF);

  if (!daRequisicao) {
    const contentType = request.headers.get("content-type") ?? "";
    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      try {
        // clone(): o corpo só pode ser lido uma vez, e o handler ainda
        // precisa dele.
        const form = await request.clone().formData();
        const campo = form.get(CAMPO_CSRF);
        if (typeof campo === "string") daRequisicao = campo;
      } catch {
        return false;
      }
    }
  }

  if (!daRequisicao) return false;

  // Comparação de tamanho antes: strings de tamanhos diferentes não têm como
  // ser iguais, e evita alocação desnecessária.
  if (daRequisicao.length !== doCookie.length) return false;

  let diferenca = 0;
  for (let i = 0; i < doCookie.length; i++) {
    diferenca |= doCookie.charCodeAt(i) ^ daRequisicao.charCodeAt(i);
  }
  if (diferenca !== 0) return false;

  return validarFormato(doCookie);
}

function validarFormato(token: string): boolean {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return false;
  const valor = token.slice(0, idx);
  const assinatura = token.slice(idx + 1);
  if (valor.length < 20 || assinatura.length < 20) return false;
  return verificarAssinaturaCsrf(valor, assinatura);
}

/** Erro específico para o handler traduzir em 403 sem vazar detalhe. */
export class CsrfInvalidoError extends Error {
  constructor() {
    super("Token de segurança inválido ou expirado. Recarregue a página.");
    this.name = "CsrfInvalidoError";
  }
}

export async function exigirCsrf(request: Request): Promise<void> {
  if (!(await validarCsrf(request))) {
    throw new CsrfInvalidoError();
  }
}
