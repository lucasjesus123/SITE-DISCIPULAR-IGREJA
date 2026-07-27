import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";

/**
 * robots.txt por tenant.
 *
 * O site público de cada igreja DEVE ser indexado — é o objetivo dele. Mas o
 * painel, o app e as APIs NUNCA podem aparecer no Google: eles servem dado
 * pessoal e área administrativa. Por isso o bloqueio explícito abaixo, além
 * do `X-Robots-Tag: noindex` que o middleware já injeta nessas rotas.
 */
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const tenant = await tenantDaRequisicao();

  // Fora de um tenant (host desconhecido): não autoriza indexação de nada.
  if (!tenant) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  const host = (await headers()).get("x-discipular-host") ?? tenant.hostCanonico;
  const base = `https://${host}`;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/painel", "/painel/", "/plataforma", "/plataforma/", "/app", "/app/", "/api/", "/login", "/redefinir-senha", "/recuperar-senha"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
