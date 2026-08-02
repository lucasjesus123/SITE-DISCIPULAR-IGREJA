import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { TenantDb } from "@/lib/db/tenant-client";
import { normalizarModulos, type ConfigModulos } from "@/lib/modulos/modulos";

/**
 * Leitura dos módulos ("gavetas") de uma igreja. Devolve o conjunto completo
 * (padrão quando ainda não há linha salva). `gestao` é sempre true.
 */

const SELECT = {
  gestao: true, site: true, app: true, louvor: true, kids: true,
  financeiro: true, inscricoes: true, celulas: true, escola: true, comunicacao: true,
} as const;

/** Via cliente escopado (painel, app, site — já têm o tenant resolvido). */
export async function carregarModulos(db: TenantDb): Promise<ConfigModulos> {
  const cfg = await db.configuracaoModulos.findFirst({ select: SELECT });
  return normalizarModulos(cfg);
}

/** Via prisma cru por tenantId (Super Admin, que opera fora do escopo do tenant). */
export async function carregarModulosPorTenant(tenantId: string): Promise<ConfigModulos> {
  const cfg = await prisma.configuracaoModulos.findUnique({ where: { tenantId }, select: SELECT });
  return normalizarModulos(cfg);
}
