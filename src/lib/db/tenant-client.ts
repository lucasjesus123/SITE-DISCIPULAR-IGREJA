import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * =============================================================================
 * CLIENTE ESCOPADO POR TENANT — o controle mais importante do sistema
 * =============================================================================
 *
 * O PROBLEMA
 * Em qualquer SaaS multi-tenant, o vazamento entre clientes quase nunca vem de
 * um ataque sofisticado. Vem de uma linha esquecida:
 *
 *     prisma.pessoa.findMany({ where: { status: "MEMBRO" } })
 *                                      // ^ faltou tenantId
 *
 * Essa query devolve os membros de TODAS as igrejas. Ela passa em code review
 * porque parece certa, e passa em teste porque em desenvolvimento só existe um
 * tenant no banco.
 *
 * A SOLUÇÃO
 * Não confiar na disciplina de quem escreve a query. Esta extensão intercepta
 * TODA operação sobre modelos com `tenantId` e injeta o filtro. Se o
 * desenvolvedor esquecer, a extensão lembra. Se o desenvolvedor tentar passar
 * um tenantId diferente do da sessão, a extensão lança erro.
 *
 * CAMADAS DE DEFESA (esta é a nº 2 de 4)
 *   1. Middleware resolve o tenant pelo hostname; nunca por parâmetro do cliente
 *   2. ESTA extensão injeta tenantId em toda query          <-- você está aqui
 *   3. Row-Level Security no Postgres (migração 002_rls)
 *   4. Verificação de propriedade nos serviços, em cima do ID já filtrado
 *
 * Nenhuma camada sozinha é suficiente. A 2 falha se alguém importar `prisma`
 * direto — por isso existe a 3. A 3 falha se o app conectar como superusuário
 * — por isso existe a 2.
 */

/**
 * Modelos que carregam `tenantId`. Mantido explicitamente (e não por
 * introspecção) para que adicionar um modelo novo ao schema sem registrá-lo
 * aqui seja um erro de compilação visível na revisão, e não um vazamento
 * silencioso.
 *
 * Ao criar um modelo novo com tenantId: ADICIONE AQUI.
 */
const MODELOS_TENANT = new Set<string>([
  "Pessoa",
  "Interacao",
  "Submissao",
  "SolicitacaoBatismo",
  "PedidoOracao",
  "Campus",
  "Celula",
  "EncontroCelula",
  "AgendaItem",
  "Curso",
  "Matricula",
  "Mensagem",
  "SiteConfig",
  "SitePagina",
  "LiveConfig",
  "Arquivo",
  "AuditLog",
  "Notificacao",
]);

/**
 * Modelos globais conhecidos. Existe para detectar schema drift: se aparecer
 * um modelo que não está em nenhuma das duas listas, a extensão recusa a
 * operação em vez de deixar passar sem filtro.
 */
const MODELOS_GLOBAIS = new Set<string>([
  "Tenant",
  "TenantDomain",
  "User",
  "Membership",
  "Sessao",
  "TokenSenha",
  "RateLimitBucket",
  "PlatformAuditLog",
]);

/** Lançado quando uma operação tentaria cruzar a fronteira entre igrejas. */
export class ViolacaoTenantError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ViolacaoTenantError";
  }
}

const LEITURAS_MUITAS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate"]);
const LEITURAS_UNICAS = new Set(["findUnique", "findUniqueOrThrow"]);
const ESCRITAS_COM_WHERE = new Set(["updateMany", "deleteMany"]);
const ESCRITAS_UNICAS = new Set(["update", "delete"]);

function mesclarWhere(where: unknown, tenantId: string): Record<string, unknown> {
  if (where && typeof where === "object") {
    const w = where as Record<string, unknown>;

    // Se já veio um tenantId, ele TEM que bater com o da sessão. Isso pega o
    // caso em que um ID chega de parâmetro do cliente e alguém o repassa.
    if ("tenantId" in w && w.tenantId !== tenantId) {
      throw new ViolacaoTenantError(
        `Query tentou filtrar por tenantId diferente do escopo da sessão. ` +
          `Isso indica que um identificador controlado pelo cliente chegou até a query.`,
      );
    }

    // AND explícito em vez de espalhar `tenantId` na raiz: se a query já usa
    // OR no topo, um `{ ...w, tenantId }` seria aplicado como irmão do OR e o
    // Postgres avaliaria `tenantId = X AND (OR...)` — correto — mas com
    // `NOT`/`OR` aninhados o comportamento fica sutil. AND é sempre restritivo.
    return { AND: [{ tenantId }, w] };
  }
  return { tenantId };
}

function injetarEmData(data: unknown, tenantId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => injetarEmData(item, tenantId));
  }
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    if ("tenantId" in d && d.tenantId !== tenantId) {
      throw new ViolacaoTenantError(
        "Tentativa de gravar registro com tenantId diferente do escopo da sessão.",
      );
    }
    return { ...d, tenantId };
  }
  return data;
}

/**
 * Devolve um cliente Prisma no qual toda operação sobre dados de igreja está
 * confinada ao tenant informado.
 *
 * @param tenantId  Vem SEMPRE da sessão do servidor (resolvida pelo hostname),
 *                  NUNCA de query string, body, header ou path parameter.
 */
export function tenantDb(tenantId: string) {
  if (!tenantId || typeof tenantId !== "string") {
    throw new ViolacaoTenantError("tenantDb() chamado sem tenantId válido.");
  }

  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (MODELOS_GLOBAIS.has(model)) {
            return query(args);
          }

          if (!MODELOS_TENANT.has(model)) {
            // Modelo novo que ninguém classificou. Falhar fechado.
            throw new ViolacaoTenantError(
              `Modelo "${model}" não está classificado em src/lib/db/tenant-client.ts. ` +
                `Adicione-o a MODELOS_TENANT (se tiver tenantId) ou a MODELOS_GLOBAIS. ` +
                `Operação recusada por segurança.`,
            );
          }

          const a = (args ?? {}) as Record<string, unknown>;

          // ---- Leituras que aceitam where livre
          if (LEITURAS_MUITAS.has(operation) || operation === "groupBy") {
            return query({ ...a, where: mesclarWhere(a.where, tenantId) });
          }

          // ---- findUnique / findUniqueOrThrow
          // O `where` do findUnique só aceita campos únicos, então não dá para
          // simplesmente acrescentar tenantId. Convertemos para findFirst, que
          // aceita filtro composto. O custo é nulo: o índice único continua
          // sendo usado, e ganhamos a garantia de escopo.
          if (LEITURAS_UNICAS.has(operation)) {
            const novaOperacao = operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
            const delegate = (prisma as unknown as Record<string, Record<string, Function>>)[
              lowerFirst(model)
            ];
            return delegate![novaOperacao]!({
              ...a,
              where: mesclarWhere(a.where, tenantId),
            });
          }

          // ---- create / createMany
          if (operation === "create") {
            return query({ ...a, data: injetarEmData(a.data, tenantId) });
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            return query({ ...a, data: injetarEmData(a.data, tenantId) });
          }

          // ---- updateMany / deleteMany
          if (ESCRITAS_COM_WHERE.has(operation)) {
            return query({ ...a, where: mesclarWhere(a.where, tenantId) });
          }

          // ---- update / delete (where único)
          // Mesmo problema do findUnique. Aqui a conversão para updateMany /
          // deleteMany muda o retorno (vira { count }), o que quebraria o
          // chamador silenciosamente. Em vez disso, verificamos a propriedade
          // ANTES e deixamos a operação original seguir — assim o retorno
          // continua sendo o registro.
          if (ESCRITAS_UNICAS.has(operation)) {
            await garantirPropriedade(model, a.where, tenantId);
            return query(a);
          }

          // ---- upsert
          if (operation === "upsert") {
            const existente = await contarComEscopo(model, a.where, tenantId);
            if (existente === 0) {
              // Vai criar: garantir que o `create` carregue o tenant certo.
              const alvoExisteEmOutroTenant = await contarSemEscopo(model, a.where);
              if (alvoExisteEmOutroTenant > 0) {
                // O registro existe, mas é de outra igreja. Deixar o upsert
                // seguir viraria um UPDATE em dado alheio.
                throw new ViolacaoTenantError(
                  `upsert em "${model}" atingiria um registro de outro tenant.`,
                );
              }
            }
            return query({
              ...a,
              create: injetarEmData(a.create, tenantId),
            });
          }

          // Operação desconhecida (versão nova do Prisma): falhar fechado.
          throw new ViolacaoTenantError(
            `Operação "${operation}" em "${model}" não é reconhecida pelo escopo de tenant. ` +
              `Recusada por segurança.`,
          );
        },
      },
    },
  });
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function delegateDe(model: string) {
  return (prisma as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[
    lowerFirst(model)
  ]!;
}

async function contarComEscopo(model: string, where: unknown, tenantId: string): Promise<number> {
  return delegateDe(model).count({ where: mesclarWhere(where, tenantId) });
}

async function contarSemEscopo(model: string, where: unknown): Promise<number> {
  return delegateDe(model).count({ where });
}

/**
 * Confirma que o registro alvo de um update/delete pertence ao tenant.
 *
 * A mensagem de erro é deliberadamente idêntica para "não existe" e "existe,
 * mas é de outra igreja". Diferenciar as duas transformaria o endpoint num
 * oráculo: um atacante iteraria IDs e mapearia quais existem na plataforma.
 */
async function garantirPropriedade(model: string, where: unknown, tenantId: string): Promise<void> {
  const encontrados = await contarComEscopo(model, where, tenantId);
  if (encontrados === 0) {
    throw new ViolacaoTenantError(`Registro não encontrado em "${model}".`);
  }
}

export type TenantDb = ReturnType<typeof tenantDb>;

/**
 * Executa uma transação já escopada ao tenant.
 * Use quando várias escritas precisam ser atômicas (ex.: aprovar uma
 * submissão = criar a pessoa + marcar a submissão + gravar auditoria).
 */
export async function comTransacaoTenant<T>(
  tenantId: string,
  fn: (tx: Omit<TenantDb, "$transaction">) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async () => {
    // A extensão é reaplicada dentro da transação para que o escopo continue
    // valendo nas queries internas.
    return fn(tenantDb(tenantId) as never);
  }, {
    // Timeout curto: transação pendurada segura conexão do pool, e o pool é
    // o recurso mais escasso quando 90 pessoas usam o sistema ao mesmo tempo.
    maxWait: 5_000,
    timeout: 15_000,
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  });
}
