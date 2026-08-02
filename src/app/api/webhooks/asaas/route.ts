import { NextResponse } from "next/server";
import { webhookAutentico, pagamentoConfirmado } from "@/lib/pagamentos/asaas";
import { webhookTokenDaContribuicao } from "@/lib/pagamentos/config";
import { confirmarContribuicao } from "@/lib/services/contribuicao";
import { logger } from "@/lib/logger";

/**
 * POST /api/webhooks/asaas
 *
 * Recebe os eventos de pagamento do ASAAS. Autenticado pelo header
 * `asaas-access-token` (o mesmo valor cadastrado no painel do ASAAS e em
 * ASAAS_WEBHOOK_TOKEN). Quando o pagamento é confirmado, gera o lançamento de
 * entrada no Financeiro — de forma idempotente, então reentrega do mesmo evento
 * não duplica dinheiro.
 *
 * Devolve 200 sempre que o evento foi entendido (mesmo ignorado), para o ASAAS
 * não ficar reentregando. Só devolve 401 quando o token não confere.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EventoAsaas {
  event?: string;
  payment?: { id?: string; status?: string; externalReference?: string };
}

export async function POST(request: Request) {
  const token = request.headers.get("asaas-access-token");

  let corpo: EventoAsaas;
  try {
    corpo = (await request.json()) as EventoAsaas;
  } catch {
    return NextResponse.json({ erro: "payload inválido" }, { status: 400 });
  }

  const pagamento = corpo.payment;
  const status = pagamento?.status ?? "";
  const externalReference = pagamento?.externalReference ?? "";
  const paymentId = pagamento?.id ?? "";

  // 1) Só nos interessam eventos de pagamento efetivado com referência nossa.
  //    (Sem referência não dá para saber de qual igreja é — ignoramos com 200.)
  if (!externalReference || !paymentId || !pagamentoConfirmado(status)) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  // 2) Autenticação POR IGREJA: o token esperado é o da igreja dona da
  //    contribuição (config do painel) ou o do env, resolvido pela referência.
  const esperado = await webhookTokenDaContribuicao(externalReference);
  if (!esperado || !webhookAutentico(token, esperado)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  try {
    const r = await confirmarContribuicao(externalReference, paymentId);
    return NextResponse.json({ ok: r.ok, jaProcessada: r.jaProcessada ?? false });
  } catch (erro) {
    const ref = logger.erro("Falha ao confirmar contribuição do webhook ASAAS", erro, {
      externalReference,
      paymentId,
    });
    // 500 faz o ASAAS reentregar — desejável: a idempotência protege o dinheiro.
    return NextResponse.json({ erro: `falha interna. Referência: ${ref}` }, { status: 500 });
  }
}
