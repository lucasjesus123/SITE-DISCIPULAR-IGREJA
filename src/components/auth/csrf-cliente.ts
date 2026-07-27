"use client";

/**
 * Leitura do token CSRF no navegador.
 *
 * O cookie de CSRF é deliberadamente legível por JavaScript (ao contrário do
 * de sessão, que é HttpOnly): ele PRECISA ser lido aqui para viajar no header
 * `x-csrf-token`. Isso não o enfraquece — a proteção do double-submit não vem
 * do sigilo do valor, e sim de um site de terceiros não conseguir LER o cookie
 * do nosso domínio para replicá-lo na requisição forjada.
 *
 * Dois nomes porque o prefixo `__Host-` exige `Secure`, que não existe em
 * `http://localhost`. Ver src/lib/security/csrf.ts.
 */
export function tokenCsrf(): string {
  return lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "";
}

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}
