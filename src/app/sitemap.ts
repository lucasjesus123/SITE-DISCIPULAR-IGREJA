import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";

/**
 * Sitemap por tenant, gerado a partir das páginas publicadas da igreja.
 *
 * Escopado ao tenant do hostname: o sitemap de uma igreja jamais lista URLs
 * de outra. As páginas vêm de `carregarDadosSite`, que passa por `tenantDb`.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return [];

  const host = (await headers()).get("x-discipular-host") ?? tenant.hostCanonico;
  const base = `https://${host}`;

  const dados = await carregarDadosSite(tenant.id);
  const agora = new Date();

  // Rotas fixas do site público.
  const fixas = ["", "/quem-somos", "/pastores", "/celulas", "/escola", "/mensagens", "/contribua", "/contato", "/visita", "/oracao", "/batismo"];

  const entradasFixas: MetadataRoute.Sitemap = fixas.map((rota) => ({
    url: `${base}${rota}`,
    lastModified: agora,
    changeFrequency: rota === "" ? "weekly" : "monthly",
    priority: rota === "" ? 1 : 0.7,
  }));

  // Páginas extras criadas no editor whitelabel.
  const conhecidas = new Set(fixas.map((r) => r.replace("/", "")));
  const entradasPaginas: MetadataRoute.Sitemap = dados.paginas
    .filter((p) => !conhecidas.has(p.slug) && p.slug !== "home")
    .map((p) => ({
      url: `${base}/${p.slug}`,
      lastModified: agora,
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  return [...entradasFixas, ...entradasPaginas];
}
