"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { id as idSchema, textoLongo } from "@/lib/validation/comum";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

const schemaAtualizacao = z.object({
  status: z.enum(["RECEBIDO", "ORANDO", "RESPONDIDO", "ARQUIVADO"]),
  respostaTestemunho: textoLongo(3000).optional(),
});

/** Atualiza a situação de um pedido de oração. */
export async function atualizarPedidoOracao(
  pedidoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("oracao.responder");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(pedidoId);
    const dados = schemaAtualizacao.parse(dadosBrutos);

    const existente = await ctx.db.pedidoOracao.findFirst({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existente) return { ok: false, mensagem: "Pedido não encontrado." };

    await ctx.db.pedidoOracao.update({
      where: { id },
      data: {
        status: dados.status,
        respostaTestemunho: dados.respostaTestemunho ?? undefined,
        respondidoEm: dados.status === "RESPONDIDO" ? new Date() : undefined,
        responsavelId: ctx.sessao.userId,
      },
    });

    await auditar(ctx, {
      acao: "oracao.atualizar",
      alvoTipo: "PedidoOracao",
      alvoId: id,
      // O conteúdo do pedido e o testemunho NÃO vão para a auditoria: o log
      // seria uma segunda cópia do dado sensível, num lugar com retenção mais
      // longa e menos controle de acesso.
      detalhes: { statusAnterior: existente.status, statusNovo: dados.status },
    });

    revalidatePath("/painel/oracao");
    revalidatePath("/painel");
    return { ok: true, mensagem: "Pedido atualizado." };
  } catch (erro) {
    return traduzir(erro, "atualizarPedidoOracao");
  }
}

/**
 * Exclui um pedido de oração.
 *
 * Exclusão DEFINITIVA, não lógica. É o oposto do que fazemos com pessoas
 * (que usam `excluidoEm`), e é intencional: quando alguém pede para o seu
 * pedido de oração ser apagado, ele precisa sumir de verdade. É o direito de
 * eliminação da LGPD, e "marcar como excluído" não o atende.
 *
 * O registro de auditoria guarda que a exclusão aconteceu, sem guardar o que
 * foi excluído.
 */
export async function excluirPedidoOracao(pedidoId: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("oracao.excluir");

    const id = idSchema.parse(pedidoId);

    const existente = await ctx.db.pedidoOracao.findFirst({
      where: { id },
      select: { id: true, categoria: true, anonimo: true },
    });
    if (!existente) return { ok: false, mensagem: "Pedido não encontrado." };

    await ctx.db.pedidoOracao.delete({ where: { id } });

    await auditar(ctx, {
      acao: "oracao.excluir",
      alvoTipo: "PedidoOracao",
      alvoId: id,
      detalhes: { categoria: existente.categoria, eraAnonimo: existente.anonimo },
    });

    revalidatePath("/painel/oracao");
    return { ok: true, mensagem: "Pedido excluído definitivamente." };
  } catch (erro) {
    return traduzir(erro, "excluirPedidoOracao");
  }
}

function traduzir(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) return { ok: false, mensagem: "Dados inválidos." };
  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") return { ok: false, mensagem: "Sessão expirada." };
  if (nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão para esta ação." };
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Pedido não encontrado." };
  }
  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
