import { NextResponse } from "next/server";
import { contextoDeRequest } from "@/lib/http/contexto";
import { resolverTenantPorHost } from "@/lib/tenant/resolve";
import { prisma } from "@/lib/db/prisma";
import { corSegura } from "@/lib/site/theme";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Manifest do PWA, gerado POR TENANT.
 *
 * É o que faz o membro instalar "Igreja Betel" na tela inicial, com o ícone e
 * as cores da igreja dele — e não um app genérico da plataforma. Como o
 * manifest é resolvido pelo hostname, cada domínio entrega o seu.
 *
 * SEGURANÇA
 *  - `Cache-Control: private`: um proxy compartilhado não pode guardar o
 *    manifest da Igreja A e servi-lo no domínio da Igreja B.
 *  - Cores passam por `corSegura()` antes de entrar no JSON.
 *  - `start_url` e `scope` são literais nossos, nunca vindos do banco.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { host } = contextoDeRequest(request);
  const tenant = await resolverTenantPorHost(host);

  if (!tenant) {
    return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  }

  const config = await prisma.siteConfig.findUnique({
    where: { tenantId: tenant.id },
    select: {
      nomeExibicao: true,
      pwaNome: true,
      pwaNomeCurto: true,
      pwaCorTema: true,
      pwaIconeId: true,
      faviconId: true,
      corPapel: true,
      descricaoSeo: true,
      tagline: true,
    },
  });

  const nome = config?.pwaNome || config?.nomeExibicao || tenant.nome;
  // `short_name` aparece embaixo do ícone: acima de ~12 caracteres o sistema
  // corta com reticências.
  const nomeCurto = (config?.pwaNomeCurto || nome).slice(0, 12);

  const iconeId = config?.pwaIconeId ?? config?.faviconId ?? null;
  const icones = iconeId
    ? [
        { src: urlArquivoPublico(iconeId), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: urlArquivoPublico(iconeId), sizes: "512x512", type: "image/png", purpose: "any" },
        { src: urlArquivoPublico(iconeId), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]
    : [
        { src: "/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ];

  const manifest = {
    id: `/app?tenant=${tenant.slug}`,
    name: nome,
    short_name: nomeCurto,
    description: config?.descricaoSeo || config?.tagline || `Aplicativo da ${nome}`,
    // Abre direto no app do membro, não na home institucional.
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: corSegura(config?.corPapel, "#EEF0F2"),
    theme_color: corSegura(config?.pwaCorTema, "#14161A"),
    lang: "pt-BR",
    dir: "ltr",
    categories: ["lifestyle", "social"],
    icons: icones,
    shortcuts: [
      { name: "Ao vivo", short_name: "Ao vivo", url: "/app/ao-vivo" },
      { name: "Pedido de oração", short_name: "Oração", url: "/app/oracao" },
      { name: "Agenda", short_name: "Agenda", url: "/app/agenda" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
