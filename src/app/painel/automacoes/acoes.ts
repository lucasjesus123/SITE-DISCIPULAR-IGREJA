"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { TEMPLATES_PADRAO } from "@/lib/mensagens/template";

export type ResultadoTemplate = { ok: boolean; mensagem: string } | null;

const schema = z.object({
  id: z.string().min(1),
  corpo: z.string().trim().min(2, "A mensagem não pode ficar vazia.").max(2000),
  ativo: z.string().optional(),
});

/** A secretaria edita o texto da automação. */
export async function salvarTemplate(_e: ResultadoTemplate, formData: FormData): Promise<ResultadoTemplate> {
  try {
    const ctx = await exigirPermissao("automacoes.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const d = schema.parse(Object.fromEntries(formData));
    await ctx.db.mensagemTemplate.update({
      where: { id: d.id },
      data: { corpo: d.corpo, ativo: d.ativo === "on" },
    });
    await auditar(ctx, { acao: "automacao.template.salvar", alvoTipo: "MensagemTemplate", alvoId: d.id });
    revalidatePath("/painel/automacoes");
    return { ok: true, mensagem: "Mensagem salva." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao salvar template", erro, { acao: "salvarTemplate" });
    return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
  }
}

/** Cria as mensagens padrão que ainda não existirem nesta igreja. */
export async function criarTemplatesPadrao(_formData?: FormData): Promise<void> {
  const ctx = await exigirPermissao("automacoes.gerenciar");
  for (const t of TEMPLATES_PADRAO) {
    const existe = await ctx.db.mensagemTemplate.findFirst({ where: { chave: t.chave }, select: { id: true } });
    if (!existe) {
      await ctx.db.mensagemTemplate.create({
        data: { tenantId: ctx.tenant.id, chave: t.chave, titulo: t.titulo, corpo: t.corpo, ativo: true },
      });
    }
  }
  await auditar(ctx, { acao: "automacao.template.padroes", alvoTipo: "Tenant", alvoId: ctx.tenant.id });
  revalidatePath("/painel/automacoes");
}
