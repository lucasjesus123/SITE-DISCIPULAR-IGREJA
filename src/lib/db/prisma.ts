import { PrismaClient } from "@prisma/client";
import { env, isProd } from "@/lib/env";

/**
 * Cliente Prisma base (SEM escopo de tenant).
 *
 * ATENÇÃO
 * Use este cliente APENAS para:
 *   - modelos globais (Tenant, User, Sessao, TenantDomain, RateLimitBucket...)
 *   - rotinas da plataforma (super admin), que por definição cruzam tenants
 *
 * Para qualquer dado de igreja, use `tenantDb(tenantId)` de
 * `@/lib/db/tenant-client`, que injeta o filtro de tenant automaticamente.
 * A regra é verificada pelo lint em eslint.config.mjs (no-restricted-imports).
 */

const criarCliente = () =>
  new PrismaClient({
    // Em produção nunca logamos a query: os parâmetros contêm dados pessoais
    // de membros e o conteúdo de pedidos de oração.
    log: isProd ? ["warn", "error"] : ["warn", "error"],
    errorFormat: isProd ? "minimal" : "pretty",
  });

// Em desenvolvimento o hot reload recria módulos; sem este cache o Node
// abriria um pool novo a cada alteração e estouraria max_connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? criarCliente();

if (!isProd) globalForPrisma.prisma = prisma;

/**
 * Encerra o pool de forma limpa. Chamado pelos sinais de shutdown para que
 * o Postgres não fique com conexões órfãs a cada deploy.
 */
export async function fecharConexoes(): Promise<void> {
  await prisma.$disconnect();
}

export { env };
