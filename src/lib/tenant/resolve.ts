import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { hostAtual } from "@/lib/http/contexto";
import type { TenantStatus } from "@prisma/client";

/**
 * Resolução de tenant a partir do hostname.
 *
 * ESTA É A DECISÃO DE SEGURANÇA MAIS IMPORTANTE DO SISTEMA MULTI-TENANT.
 *
 * O tenant NUNCA vem de:
 *   - query string  (?tenant=xxx)
 *   - body da requisição
 *   - header customizado enviado pelo cliente
 *   - path parameter  (/api/igrejas/xxx/pessoas)
 *
 * Ele vem exclusivamente do HOSTNAME, que é determinado pelo DNS e validado
 * contra a tabela `tenant_domains`. Um usuário logado na Igreja A que trocar
 * qualquer parâmetro da requisição continua confinado à Igreja A, porque o
 * host dele continua sendo o da Igreja A.
 *
 * Dois formatos de host são aceitos:
 *   1. Domínio próprio, verificado:  igrejaexemplo.com.br
 *   2. Subdomínio da plataforma:     igrejaexemplo.discipular.app
 */

export interface TenantResolvido {
  id: string;
  slug: string;
  nome: string;
  status: TenantStatus;
  plano: string;
  /** Host canônico do tenant, usado para links absolutos e o manifest do PWA. */
  hostCanonico: string;
  /** true quando o acesso veio pelo subdomínio da plataforma. */
  viaSubdominio: boolean;
}

/**
 * `cache()` do React deduplica a chamada dentro de UMA renderização.
 * Sem isso, uma página com 10 componentes que precisam do tenant faria 10
 * consultas idênticas ao banco — multiplicado por 90 usuários simultâneos,
 * viraria o gargalo do sistema.
 *
 * Importante: o escopo é a requisição, não o processo. Não há risco de um
 * tenant ver o cache do outro.
 */
export const resolverTenantPorHost = cache(
  async (host: string): Promise<TenantResolvido | null> => {
    const hostname = normalizarHost(host);
    if (!hostname) return null;

    // ---- Caminho 1: domínio próprio verificado
    const dominio = await prisma.tenantDomain.findUnique({
      where: { hostname },
      select: {
        status: true,
        principal: true,
        tenant: {
          select: {
            id: true,
            slug: true,
            nome: true,
            status: true,
            plano: true,
            excluidoEm: true,
            dominios: {
              where: { principal: true, status: "VERIFICADO" },
              select: { hostname: true },
              take: 1,
            },
          },
        },
      },
    });

    if (dominio) {
      // Domínio cadastrado mas ainda não verificado não serve conteúdo.
      // Sem isso, alguém poderia cadastrar o domínio de outra igreja e
      // apontar o DNS depois, sequestrando o tráfego.
      if (dominio.status !== "VERIFICADO") return null;
      if (dominio.tenant.excluidoEm) return null;

      return {
        id: dominio.tenant.id,
        slug: dominio.tenant.slug,
        nome: dominio.tenant.nome,
        status: dominio.tenant.status,
        plano: dominio.tenant.plano,
        hostCanonico:
          dominio.tenant.dominios[0]?.hostname ??
          `${dominio.tenant.slug}.${env.ROOT_DOMAIN}`,
        viaSubdominio: false,
      };
    }

    // ---- Caminho 2: subdomínio da plataforma
    const slug = extrairSlugDeSubdominio(hostname);
    if (!slug) return null;

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        nome: true,
        status: true,
        plano: true,
        excluidoEm: true,
        dominios: {
          where: { principal: true, status: "VERIFICADO" },
          select: { hostname: true },
          take: 1,
        },
      },
    });

    if (!tenant || tenant.excluidoEm) return null;

    return {
      id: tenant.id,
      slug: tenant.slug,
      nome: tenant.nome,
      status: tenant.status,
      plano: tenant.plano,
      hostCanonico: tenant.dominios[0]?.hostname ?? `${tenant.slug}.${env.ROOT_DOMAIN}`,
      viaSubdominio: true,
    };
  },
);

/** Resolve o tenant da requisição atual. Retorna null fora de um tenant. */
export const tenantDaRequisicao = cache(async (): Promise<TenantResolvido | null> => {
  return resolverTenantPorHost(await hostAtual());
});

/**
 * Igual a `tenantDaRequisicao`, mas lança se não houver tenant ou se ele não
 * estiver operacional. Use em qualquer rota que sirva dado de igreja.
 */
export async function exigirTenant(): Promise<TenantResolvido> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) {
    throw new TenantNaoEncontradoError();
  }
  if (tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
    throw new TenantIndisponivelError(tenant.status);
  }
  return tenant;
}

export class TenantNaoEncontradoError extends Error {
  constructor() {
    super("Nenhuma igreja está vinculada a este endereço.");
    this.name = "TenantNaoEncontradoError";
  }
}

export class TenantIndisponivelError extends Error {
  constructor(public readonly status: TenantStatus) {
    super("Esta igreja está temporariamente indisponível.");
    this.name = "TenantIndisponivelError";
  }
}

// -----------------------------------------------------------------------------
// Normalização de hostname
// -----------------------------------------------------------------------------

/**
 * Normaliza para a forma canônica usada na tabela `tenant_domains`.
 *
 * Sem normalização, `WWW.Igreja.com.br.` e `igreja.com.br` seriam hosts
 * distintos: um resolveria e o outro não, ou pior, alguém poderia cadastrar a
 * variante para se passar pela igreja original.
 */
export function normalizarHost(host: string): string | null {
  if (!host) return null;

  let h = host.toLowerCase().trim();
  h = h.split(":")[0]!;      // remove porta
  h = h.replace(/\.$/, "");  // remove ponto final do FQDN absoluto

  // Só letras, dígitos, hífen e ponto. Bloqueia tentativa de injeção via Host.
  if (!/^[a-z0-9.-]+$/.test(h)) return null;
  if (h.length > 253) return null;
  if (h.includes("..") || h.startsWith(".") || h.startsWith("-")) return null;

  // `www.` é tratado como alias do domínio nu.
  if (h.startsWith("www.")) h = h.slice(4);

  return h;
}

/** Subdomínios que pertencem à plataforma e nunca podem virar slug de igreja. */
const SLUGS_RESERVADOS = new Set([
  "www", "app", "api", "admin", "painel", "plataforma", "super",
  "mail", "smtp", "imap", "ftp", "ns1", "ns2", "cdn", "static", "assets",
  "status", "docs", "blog", "suporte", "ajuda", "conta", "login", "auth",
  "webhook", "webhooks", "dev", "staging", "test", "teste", "localhost",
]);

function extrairSlugDeSubdominio(hostname: string): string | null {
  const raiz = env.ROOT_DOMAIN;

  // Ambiente local: aceita "minhaigreja.localhost".
  if (hostname.endsWith(".localhost")) {
    const slug = hostname.slice(0, -".localhost".length);
    return validarSlug(slug);
  }

  if (!hostname.endsWith(`.${raiz}`)) return null;

  const slug = hostname.slice(0, -(raiz.length + 1));
  // Só um nível de subdomínio: "a.b.discipular.app" não resolve.
  if (slug.includes(".")) return null;

  return validarSlug(slug);
}

function validarSlug(slug: string): string | null {
  if (!slug) return null;
  if (SLUGS_RESERVADOS.has(slug)) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) return null;
  return slug;
}

/** true quando o host é o domínio raiz da plataforma (área do super admin). */
export function ehHostDaPlataforma(host: string): boolean {
  const h = normalizarHost(host);
  if (!h) return false;
  return h === env.ROOT_DOMAIN || h === "localhost" || h === "127.0.0.1";
}
