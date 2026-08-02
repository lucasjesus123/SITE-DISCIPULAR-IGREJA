"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { criptografar } from "@/lib/crypto";
import { validarCredenciais } from "@/lib/pagamentos/asaas";
import { logger } from "@/lib/logger";

export type ResultadoConfigPagamento = { ok: boolean; mensagem: string } | null;

const schema = z.object({
  ambiente: z.enum(["producao", "sandbox"]),
  apiKey: z.string().trim().max(300).optional(),
  webhookToken: z.string().trim().max(120).optional(),
  ativo: z.string().optional(),
});

/**
 * Salva a configuração do gateway (ASAAS) da igreja. A chave é CIFRADA antes de
 * ir ao banco e nunca volta para o cliente. Se o campo da chave vier vazio,
 * mantemos a que já existe (permite editar o resto sem redigitar a chave).
 */
export async function salvarConfigPagamento(_estado: ResultadoConfigPagamento, formData: FormData): Promise<ResultadoConfigPagamento> {
  try {
    const ctx = await exigirPermissao("config.gerenciar");
    const dados = schema.parse(Object.fromEntries(formData));
    const ativo = dados.ativo === "on";

    const atual = await ctx.db.configuracaoPagamento.findFirst({
      select: { apiKeyCriptografada: true, webhookToken: true, ambiente: true },
    });

    const novaChaveEmClaro = dados.apiKey && dados.apiKey.length > 0 ? dados.apiKey : null;
    const apiKeyCriptografada = novaChaveEmClaro ? criptografar(novaChaveEmClaro) : atual?.apiKeyCriptografada ?? null;
    const webhookToken = dados.webhookToken && dados.webhookToken.length > 0 ? dados.webhookToken : atual?.webhookToken ?? null;

    if (ativo && !apiKeyCriptografada) {
      return { ok: false, mensagem: "Para ativar, informe a chave da API do ASAAS." };
    }

    // Se ativando com chave nova, faz um teste rápido contra o ASAAS.
    if (ativo && novaChaveEmClaro) {
      const baseUrl = dados.ambiente === "sandbox" ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
      const valida = await validarCredenciais({ apiKey: novaChaveEmClaro, baseUrl, webhookToken: webhookToken ?? "" });
      if (!valida) return { ok: false, mensagem: "O ASAAS recusou essa chave. Confira a chave e o ambiente (produção/sandbox)." };
    }

    await ctx.db.configuracaoPagamento.upsert({
      where: { tenantId: ctx.tenant.id },
      create: { tenantId: ctx.tenant.id, provedor: "ASAAS", ambiente: dados.ambiente, apiKeyCriptografada, webhookToken, ativo },
      update: { ambiente: dados.ambiente, apiKeyCriptografada, webhookToken, ativo },
    });

    // Nunca logamos a chave — só o fato de ter mudado.
    await auditar(ctx, { acao: "pagamento.config.salvar", alvoTipo: "ConfiguracaoPagamento", detalhes: { ambiente: dados.ambiente, ativo, trocouChave: Boolean(novaChaveEmClaro) } });
    revalidatePath("/painel/pagamentos");
    return { ok: true, mensagem: ativo ? "Gateway configurado e ativo. O Contribuir do app já usa o PIX." : "Configuração salva." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao salvar config de pagamento", erro, { acao: "salvarConfigPagamento" });
    return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
  }
}
