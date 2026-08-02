import "server-only";

import { prisma } from "@/lib/db/prisma";
import { tenantDb, type TenantDb } from "@/lib/db/tenant-client";
import { descriptografar } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Resolução das credenciais do gateway de pagamento (ASAAS).
 *
 * Ordem de prioridade:
 *   1. Configuração do PAINEL (por igreja), com a chave CIFRADA no banco;
 *   2. Variáveis de ambiente (fallback global, se a igreja não configurou).
 *
 * A chave em claro só existe em memória, no servidor, no instante do uso.
 * Nunca volta para o cliente e nunca é logada.
 */

export interface CredenciaisAsaas {
  apiKey: string;
  baseUrl: string;
  webhookToken: string;
}

function baseUrlDe(ambiente: string): string {
  return ambiente === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
}

/** Credenciais efetivas do tenant (painel tem prioridade sobre env). */
export async function credenciaisAsaasDoTenant(tenantId: string): Promise<CredenciaisAsaas | null> {
  const db = tenantDb(tenantId);
  const cfg = await db.configuracaoPagamento.findFirst({
    select: { ambiente: true, apiKeyCriptografada: true, webhookToken: true, ativo: true },
  });

  if (cfg?.ativo && cfg.apiKeyCriptografada) {
    const apiKey = descriptografar(cfg.apiKeyCriptografada);
    if (apiKey) {
      return {
        apiKey,
        baseUrl: baseUrlDe(cfg.ambiente),
        webhookToken: cfg.webhookToken || env.ASAAS_WEBHOOK_TOKEN,
      };
    }
  }

  if (env.ASAAS_API_KEY) {
    return { apiKey: env.ASAAS_API_KEY, baseUrl: env.ASAAS_BASE_URL, webhookToken: env.ASAAS_WEBHOOK_TOKEN };
  }
  return null;
}

/** Há um gateway utilizável para esta igreja? */
export async function asaasDisponivel(tenantId: string): Promise<boolean> {
  return (await credenciaisAsaasDoTenant(tenantId)) !== null;
}

export interface StatusPagamento {
  ativo: boolean;
  temChave: boolean;
  temWebhook: boolean;
  ambiente: string;
  usandoEnv: boolean;
}

/** Estado para exibir no painel — NUNCA devolve a chave em si. */
export async function statusPagamento(db: TenantDb): Promise<StatusPagamento> {
  const cfg = await db.configuracaoPagamento.findFirst({
    select: { ativo: true, apiKeyCriptografada: true, webhookToken: true, ambiente: true },
  });
  const temChavePainel = Boolean(cfg?.apiKeyCriptografada);
  return {
    ativo: cfg?.ativo ?? false,
    temChave: temChavePainel,
    temWebhook: Boolean(cfg?.webhookToken),
    ambiente: cfg?.ambiente ?? "producao",
    usandoEnv: !temChavePainel && env.ASAAS_API_KEY.length > 0,
  };
}

/** Token de webhook do tenant dono de uma contribuição (para autenticar). */
export async function webhookTokenDaContribuicao(externalReference: string): Promise<string | null> {
  const c = await prisma.contribuicao.findUnique({
    where: { id: externalReference },
    select: { tenantId: true },
  });
  if (!c) return null;
  const cred = await credenciaisAsaasDoTenant(c.tenantId);
  return cred?.webhookToken || null;
}
