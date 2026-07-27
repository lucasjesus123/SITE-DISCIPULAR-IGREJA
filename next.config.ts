import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança aplicados a TODAS as respostas.
 *
 * O Content-Security-Policy NÃO fica aqui: ele é montado por requisição no
 * middleware (src/middleware.ts) porque usa um nonce aleatório por resposta e
 * porque a lista de origens permitidas varia conforme o tenant (ex.: domínio
 * próprio da igreja). Ver `buildCsp()` em src/lib/security/headers.ts.
 */
const securityHeaders = [
  // Impede sniffing de MIME type (defesa contra XSS via upload).
  { key: "X-Content-Type-Options", value: "nosniff" },

  // Clickjacking. O CSP frame-ancestors é a defesa moderna; este é o fallback.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },

  // Não vaza a URL completa (que pode conter IDs de tenant) para terceiros.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Desliga APIs de hardware que o sistema não usa.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=(self)",
      "camera=()",
      "display-capture=()",
      "encrypted-media=(self)",
      "fullscreen=(self)",
      "geolocation=()",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()",
    ].join(", "),
  },

  // HSTS: 2 anos, subdomínios, elegível a preload.
  // Só faz efeito sobre HTTPS — em HTTP local o navegador ignora.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },

  // Isolamento de origem cruzada.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },

  // Evita que o Next exponha a versão do framework.
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Não expor "X-Powered-By: Next.js" (redução de superfície de fingerprinting).
  poweredByHeader: false,

  // Source maps de produção NUNCA vão para o navegador: eles revelariam a
  // estrutura interna do backend e facilitariam a busca por vulnerabilidades.
  productionBrowserSourceMaps: false,

  // Build standalone: imagem Docker mínima, sem devDependencies em produção.
  output: "standalone",

  eslint: {
    // O lint roda no CI como job próprio; não deve mascarar erro de build.
    ignoreDuringBuilds: false,
  },
  typescript: {
    // NUNCA ligar ignoreBuildErrors: erros de tipo já pegaram bugs de tenant.
    ignoreBuildErrors: false,
  },

  images: {
    // Só permitimos otimizar imagens de origens conhecidas. Isso fecha a porta
    // para SSRF via /_next/image?url=<qualquer coisa>.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
    ],
    // Uploads dos tenants são servidos pela nossa própria rota autorizada
    // (/api/arquivos/[id]), que já valida tenant — não precisa de allowlist.
    formats: ["image/avif", "image/webp"],
  },

  experimental: {
    // Limita o tamanho de payload das Server Actions (default é 1MB).
    serverActions: { bodySizeLimit: "2mb" },
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // O service worker precisa ser revalidado sempre, senão o PWA
        // fica preso numa versão antiga (inclusive com bug de segurança).
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Nenhuma resposta de API pode ser cacheada por proxy compartilhado:
        // isso vazaria dados de um tenant para outro.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
