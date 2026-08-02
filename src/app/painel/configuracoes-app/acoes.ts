"use server";

import { revalidatePath } from "next/cache";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";

export type ResultadoConfigApp = { ok: boolean; mensagem: string } | null;

const CHAVES = ["palavra", "contribuir", "agenda", "celula", "notificacoes"] as const;

/**
 * Salva os toggles do App de Membros. Início e Perfil são a base do app e não
 * têm toggle (não dá para desligar). Guarda uma linha por igreja (upsert).
 */
export async function salvarConfigApp(
  _estado: ResultadoConfigApp,
  formData: FormData,
): Promise<ResultadoConfigApp> {
  try {
    const ctx = await exigirPermissao("config.gerenciar");

    const valores = Object.fromEntries(CHAVES.map((c) => [c, formData.get(c) === "on"])) as Record<
      (typeof CHAVES)[number],
      boolean
    >;

    await ctx.db.configuracaoAppMembro.upsert({
      where: { tenantId: ctx.tenant.id },
      create: { tenantId: ctx.tenant.id, ...valores },
      update: { ...valores },
    });

    await auditar(ctx, { acao: "app.config.salvar", alvoTipo: "ConfiguracaoAppMembro", detalhes: valores });
    revalidatePath("/painel/configuracoes-app");
    return { ok: true, mensagem: "Configuração salva. O app dos membros já reflete as mudanças." };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao salvar config do app", erro, { acao: "salvarConfigApp" });
    return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
  }
}
