import "server-only";

import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Cliente do gateway ASAAS — cobrança PIX do "Contribuir".
 *
 * SEGURANÇA
 *  - A API key vive só no servidor (env.ASAAS_API_KEY), nunca no navegador.
 *  - Toda cobrança carrega `externalReference` = id da Contribuicao, para o
 *    webhook casar o pagamento com o registro certo, sem confiar em valor/nome.
 *  - Fluxo dinâmico (customer + payment PIX + QrCode): reconciliação limpa por
 *    referência e recibo por membro (necessário para LGPD/prestação de contas).
 */

export class ErroAsaas extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroAsaas";
  }
}

/** true quando a igreja configurou a chave do ASAAS no servidor. */
export function asaasConfigurado(): boolean {
  return env.ASAAS_API_KEY.trim().length > 0;
}

async function asaasFetch<T>(caminho: string, init: RequestInit): Promise<T> {
  if (!asaasConfigurado()) throw new ErroAsaas("ASAAS não configurado (falta ASAAS_API_KEY).");

  const resp = await fetch(`${env.ASAAS_BASE_URL}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: env.ASAAS_API_KEY,
      "User-Agent": "Discipular",
      ...(init.headers ?? {}),
    },
    // Nunca deixamos a chamada pendurar segurando o worker.
    signal: AbortSignal.timeout(15_000),
  });

  const texto = await resp.text();
  if (!resp.ok) {
    const ref = logger.erro("ASAAS respondeu erro", new Error(texto.slice(0, 300)), {
      caminho,
      status: resp.status,
    });
    throw new ErroAsaas(`Gateway recusou a operação. Referência: ${ref}`);
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

interface ClienteAsaas {
  id: string;
}
interface PagamentoAsaas {
  id: string;
  status: string;
}
interface QrCodeAsaas {
  encodedImage: string; // PNG base64 (sem prefixo data:)
  payload: string; // "copia e cola"
  expirationDate?: string;
}

/** Garante um cliente ASAAS para o pagador (CPF/CNPJ é exigido pelo gateway). */
async function garantirCliente(dados: { nome: string; cpfCnpj: string; email?: string }): Promise<string> {
  const cliente = await asaasFetch<ClienteAsaas>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: dados.nome,
      cpfCnpj: dados.cpfCnpj.replace(/\D/g, ""),
      email: dados.email || undefined,
      notificationDisabled: true,
    }),
  });
  return cliente.id;
}

export interface CobrancaPix {
  paymentId: string;
  pixCopiaECola: string;
  pixImagemBase64: string;
  expiraEm: string | null;
}

/**
 * Cria uma cobrança PIX dinâmica e devolve o "copia e cola" + a imagem do QR.
 * `valorCentavos` é convertido para reais (o ASAAS trabalha em reais decimais).
 */
export async function criarCobrancaPix(params: {
  valorCentavos: bigint;
  descricao: string;
  externalReference: string;
  pagador: { nome: string; cpfCnpj: string; email?: string };
}): Promise<CobrancaPix> {
  const clienteId = await garantirCliente(params.pagador);

  const valorReais = Number(params.valorCentavos) / 100;
  const hoje = new Date().toISOString().slice(0, 10); // vencimento hoje (PIX imediato)

  const pagamento = await asaasFetch<PagamentoAsaas>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: clienteId,
      billingType: "PIX",
      value: valorReais,
      dueDate: hoje,
      description: params.descricao,
      externalReference: params.externalReference,
    }),
  });

  const qr = await asaasFetch<QrCodeAsaas>(`/payments/${pagamento.id}/pixQrCode`, { method: "GET" });

  return {
    paymentId: pagamento.id,
    pixCopiaECola: qr.payload,
    pixImagemBase64: qr.encodedImage,
    expiraEm: qr.expirationDate ?? null,
  };
}

/**
 * Confere o token do webhook. O ASAAS envia, em todo POST de webhook, o header
 * `asaas-access-token` com o valor que a igreja cadastrou no painel do ASAAS.
 * Comparação de tempo constante para não vazar o segredo por timing.
 */
export function webhookAutentico(tokenRecebido: string | null): boolean {
  const esperado = env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado) return false; // sem token configurado, recusa tudo
  const a = Buffer.from(tokenRecebido ?? "");
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  // timingSafeEqual exige mesmo tamanho; já garantido acima.
  return timingSafeEqual(a, b);
}

/** Status do ASAAS que contam como "pago" (dinheiro caiu). */
export function pagamentoConfirmado(status: string): boolean {
  return status === "RECEIVED" || status === "CONFIRMED" || status === "RECEIVED_IN_CASH";
}
