"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { gerarSlug } from "@/lib/inscricoes/slug";

export type ResultadoInscricao = { ok: boolean; mensagem: string } | null;

const schemaCriar = z.object({
  titulo: z.string().trim().min(3, "Dê um título.").max(160),
  descricao: z.string().trim().max(2000).optional(),
  pedirTelefone: z.string().optional(),
  pedirEmail: z.string().optional(),
});

/** Cria a inscrição com um slug único e leva para a tela dela. */
export async function criarInscricao(
  _estado: ResultadoInscricao,
  formData: FormData,
): Promise<ResultadoInscricao> {
  let destino: string | null = null;
  try {
    const ctx = await exigirPermissao("inscricoes.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const dados = schemaCriar.parse(Object.fromEntries(formData));

    // Slug único dentro da igreja: tenta a base e vai numerando.
    const base = gerarSlug(dados.titulo);
    let slug = base;
    for (let i = 2; i <= 60; i++) {
      const existe = await ctx.db.inscricao.findFirst({ where: { slug }, select: { id: true } });
      if (!existe) break;
      slug = `${base}-${i}`.slice(0, 80);
    }

    const inscricao = await ctx.db.inscricao.create({
      data: {
        tenantId: ctx.tenant.id,
        titulo: dados.titulo,
        descricao: dados.descricao || null,
        slug,
        pedirTelefone: dados.pedirTelefone === "on",
        pedirEmail: dados.pedirEmail === "on",
        criadoPorId: ctx.sessao.userId,
      },
      select: { id: true },
    });

    await auditar(ctx, { acao: "inscricao.criar", alvoTipo: "Inscricao", alvoId: inscricao.id, detalhes: { titulo: dados.titulo } });
    revalidatePath("/painel/inscricoes");
    destino = `/painel/inscricoes/${inscricao.id}`;
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao criar inscrição", erro, { acao: "criarInscricao" });
    return { ok: false, mensagem: `Não foi possível criar. Referência: ${ref}` };
  }
  // redirect() lança fora do try para não ser capturado como erro.
  redirect(destino);
}

/** Liga/desliga o recebimento de inscrições. */
export async function definirAtiva(inscricaoId: string, ativa: boolean): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const ctx = await exigirPermissao("inscricoes.gerenciar");
    await ctx.db.inscricao.update({ where: { id: inscricaoId }, data: { ativa } });
    await auditar(ctx, { acao: "inscricao.ativa", alvoTipo: "Inscricao", alvoId: inscricaoId, detalhes: { ativa } });
    revalidatePath(`/painel/inscricoes/${inscricaoId}`);
    revalidatePath("/painel/inscricoes");
    return { ok: true };
  } catch {
    return { ok: false, mensagem: "Não foi possível atualizar." };
  }
}

/** Exclui a inscrição (e suas respostas, por cascata). */
export async function excluirInscricao(inscricaoId: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await exigirPermissao("inscricoes.gerenciar");
    await ctx.db.inscricao.delete({ where: { id: inscricaoId } });
    await auditar(ctx, { acao: "inscricao.excluir", alvoTipo: "Inscricao", alvoId: inscricaoId });
  } catch {
    return { ok: false };
  }
  redirect("/painel/inscricoes");
}
