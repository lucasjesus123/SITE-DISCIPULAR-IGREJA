"use server";

import { z } from "zod";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { sessaoAtual } from "@/lib/auth/session";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { ipHashAtual } from "@/lib/http/contexto";
import { asaasDisponivel } from "@/lib/pagamentos/config";
import { reaisParaCentavos } from "@/lib/pagamentos/contribuicao";
import { iniciarContribuicao } from "@/lib/services/contribuicao";
import { logger } from "@/lib/logger";

export type ResultadoPix =
  | { ok: true; pixCopiaECola: string; pixImagemBase64: string }
  | { ok: false; mensagem: string }
  | null;

const schema = z.object({
  tipo: z.enum(["DIZIMO", "OFERTA", "MISSOES"]),
  valor: z.string().min(1),
  nome: z.string().trim().min(2, "Informe seu nome.").max(160),
  cpf: z.string().trim().min(11, "Informe um CPF válido.").max(18),
});

/**
 * Gera a cobrança PIX da contribuição. Coletamos nome e CPF porque o gateway
 * (ASAAS) exige e porque o recibo/prestação de contas pede identificação —
 * nada disso vira dado público, e a confirmação/lançamento vem pelo webhook.
 */
export async function iniciarContribuicaoAction(_estado: ResultadoPix, formData: FormData): Promise<ResultadoPix> {
  try {
    const tenant = await tenantDaRequisicao();
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };
    if (!(await asaasDisponivel(tenant.id))) return { ok: false, mensagem: "O PIX ainda não está configurado nesta igreja." };

    // Rate limit por IP: evita alguém enfileirar cobranças em massa.
    const ipHash = await ipHashAtual();
    const limite = await verificarLimite(REGRAS.submissaoPublica, `pix:${ipHash}`, tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas tentativas. Aguarde um instante." };

    const dados = schema.parse(Object.fromEntries(formData));
    const valorCentavos = reaisParaCentavos(dados.valor);
    if (!valorCentavos) return { ok: false, mensagem: "Valor inválido." };
    if (valorCentavos < 500n) return { ok: false, mensagem: "O valor mínimo é R$ 5,00." };

    const sessao = await sessaoAtual();
    const membroUserId = sessao && sessao.tenantId === tenant.id ? sessao.userId : null;

    const r = await iniciarContribuicao(tenant.id, {
      tipo: dados.tipo,
      valorCentavos,
      membroUserId,
      campusId: null,
      pagador: { nome: dados.nome, cpfCnpj: dados.cpf, email: sessao?.email },
    });

    return { ok: true, pixCopiaECola: r.pixCopiaECola, pixImagemBase64: r.pixImagemBase64 };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    const ref = logger.erro("Falha ao iniciar contribuição PIX", erro, { acao: "iniciarContribuicaoAction" });
    return { ok: false, mensagem: `Não foi possível gerar o PIX agora. Referência: ${ref}` };
  }
}
