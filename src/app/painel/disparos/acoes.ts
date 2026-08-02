"use server";

import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { carregarDadosSite } from "@/lib/services/site";
import { dispararManual } from "@/lib/services/disparo-manual";
import { logger } from "@/lib/logger";

export type ResultadoDisparoManual = { ok: boolean; mensagem: string } | null;

const schema = z.object({
  publico: z.enum(["TODOS", "MEMBROS", "VISITANTES"]),
  texto: z.string().trim().min(5, "Escreva a mensagem.").max(2000),
});

export async function enviarDisparoManual(_estado: ResultadoDisparoManual, formData: FormData): Promise<ResultadoDisparoManual> {
  try {
    const ctx = await exigirPermissao("automacoes.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const dados = schema.parse(Object.fromEntries(formData));
    const site = await carregarDadosSite(ctx.tenant.id);

    const r = await dispararManual(ctx.tenant.id, {
      publico: dados.publico,
      texto: dados.texto,
      igreja: site.config.nomeExibicao,
    });

    if (!r.ok) {
      return { ok: false, mensagem: "O WhatsApp da igreja ainda não está conectado. Conecte o número na aba WhatsApp." };
    }

    await auditar(ctx, { acao: "disparo.manual", detalhes: { publico: dados.publico, destinatarios: r.destinatarios, enviados: r.enviados } });
    return {
      ok: true,
      mensagem: `Disparo concluído: ${r.enviados} de ${r.destinatarios} enviada(s)${r.erros ? `, ${r.erros} falha(s)` : ""}.`,
    };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha no disparo manual", erro, { acao: "enviarDisparoManual" });
    return { ok: false, mensagem: `Não foi possível enviar. Referência: ${ref}` };
  }
}
