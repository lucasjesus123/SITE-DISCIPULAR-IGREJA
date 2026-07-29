/**
 * Content-Security-Policy montado por requisição.
 *
 * Roda no middleware (runtime Edge), então só pode usar Web APIs — nada de
 * `node:crypto` nem Prisma aqui.
 */

/** Nonce de 128 bits para autorizar os scripts inline do próprio Next.js. */
export function gerarNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface OpcoesCsp {
  nonce: string;
  /** Em dev o Next injeta eval no HMR; em produção isso é proibido. */
  desenvolvimento: boolean;
  /** true quando a rota embute player do YouTube (site público e app). */
  permitirYoutube: boolean;
}

/**
 * Política restritiva por padrão.
 *
 * Decisões que valem explicação:
 *
 * - `default-src 'none'`: nada é permitido a menos que liberado abaixo.
 *   Uma diretiva esquecida vira bloqueio, não vira permissão.
 *
 * - `script-src 'nonce-...' 'strict-dynamic'`: só executa script que carregue
 *   o nonce da resposta. `strict-dynamic` deixa esses scripts carregarem seus
 *   próprios chunks (o Next precisa disso) sem que a gente tenha de liberar
 *   host algum. É o que neutraliza XSS refletido: um `<script>` injetado pelo
 *   atacante não tem como adivinhar o nonce, que muda a cada resposta.
 *
 * - SEM `'unsafe-inline'` em script-src. Ele anularia toda a proteção acima.
 *
 * - `style-src 'unsafe-inline'`: infelizmente necessário. O tema whitelabel
 *   injeta as cores da igreja como custom properties CSS num <style>, e o
 *   React insere estilos inline. O risco residual é baixo (injeção de CSS
 *   permite defacement e exfiltração limitada, não execução de código) e é
 *   mitigado porque TODA cor passa por validação de regex hexadecimal antes
 *   de virar CSS — ver src/lib/site/theme.ts.
 *
 * - `frame-ancestors 'none'`: nem o painel nem o site podem ser embutidos em
 *   iframe de terceiro. Fecha clickjacking.
 *
 * - `form-action 'self'`: um XSS não consegue reescrever o `action` de um
 *   formulário para postar as credenciais em outro servidor.
 */
export function montarCsp({ nonce, desenvolvimento, permitirYoutube }: OpcoesCsp): string {
  const youtubeFrames = permitirYoutube
    ? ["https://www.youtube.com", "https://www.youtube-nocookie.com"]
    : [];
  const youtubeImagens = permitirYoutube
    ? ["https://i.ytimg.com", "https://img.youtube.com"]
    : [];

  const diretivas: Record<string, string[]> = {
    "default-src": ["'none'"],

    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // Navegadores antigos ignoram strict-dynamic; estes dois são o fallback
      // que eles enxergam, e os modernos ignoram por causa do nonce.
      "https:",
      ...(desenvolvimento ? ["'unsafe-eval'"] : []),
    ],

    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],

    // Tiles do mapa das células (OpenStreetMap, sem chave de API). São imagens
    // <img>, então basta o img-src — nada de connect-src. Cobre os subdomínios
    // a/b/c.tile e o host sem subdomínio.
    "img-src": [
      "'self'",
      "data:",
      "blob:",
      "https://*.tile.openstreetmap.org",
      "https://tile.openstreetmap.org",
      ...youtubeImagens,
    ],
    "media-src": ["'self'", "blob:"],

    // Só falamos com a nossa própria origem. Se um XSS acontecesse, ele não
    // teria para onde enviar os dados roubados.
    "connect-src": ["'self'", ...(desenvolvimento ? ["ws:", "wss:"] : [])],

    "frame-src": youtubeFrames,
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const partes = Object.entries(diretivas)
    .filter(([, valores]) => valores.length > 0)
    .map(([nome, valores]) => `${nome} ${valores.join(" ")}`);

  if (!desenvolvimento) {
    // Bloqueia qualquer sub-recurso que escape para http://
    partes.push("upgrade-insecure-requests");
  }

  return partes.join("; ");
}
