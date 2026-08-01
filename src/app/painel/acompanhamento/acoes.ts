"use server";

import { revalidatePath } from "next/cache";
import type { StatusPessoa } from "@prisma/client";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { ROTULO_ETAPA, transicaoValida } from "@/lib/pessoas/jornada";

/**
 * Move uma pessoa entre etapas da jornada (Kanban). Só permite passos
 * adjacentes (visitante ↔ acompanhamento ↔ congregante ↔ membro) e re-autoriza
 * no servidor. Registra a mudança na auditoria.
 */
export async function moverEtapa(
  pessoaId: string,
  novoStatus: StatusPessoa,
): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const ctx = await exigirPermissao("pessoas.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const pessoa = await ctx.db.pessoa.findFirst({
      where: { id: pessoaId, excluidoEm: null },
      select: { status: true, nome: true },
    });
    if (!pessoa) return { ok: false, mensagem: "Pessoa não encontrada." };

    if (!transicaoValida(pessoa.status, novoStatus)) {
      return { ok: false, mensagem: "Só é possível avançar ou voltar uma etapa por vez." };
    }

    await ctx.db.pessoa.update({ where: { id: pessoaId }, data: { status: novoStatus } });

    await auditar(ctx, {
      acao: "pessoa.moverEtapa",
      alvoTipo: "Pessoa",
      alvoId: pessoaId,
      detalhes: { de: ROTULO_ETAPA[pessoa.status], para: ROTULO_ETAPA[novoStatus] },
    });

    revalidatePath("/painel/acompanhamento");
    return { ok: true };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") {
      return { ok: false, mensagem: "Sem permissão." };
    }
    logger.erro("Falha ao mover etapa", erro, { acao: "moverEtapa" });
    return { ok: false, mensagem: "Não foi possível mover." };
  }
}
