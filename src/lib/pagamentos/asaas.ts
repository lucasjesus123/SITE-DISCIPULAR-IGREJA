import "server-only";

import { timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/logger";
import type { CredenciaisAsaas } from "@/lib/pagamentos/config";

/**
 * Cliente do gateway ASAAS — cobrança PIX do "Contribuir".
 *
 * SEGURANÇA
 *  - As credenciais são resolvidas por igreja (painel > env) em
 *    src/lib/pagamentos/config.ts e passadas aqui; nunca vão ao navegador.
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

async function asaasFetch<T>(cred: CredenciaisAsaas, caminho: string, init: RequestInit): Promise<T> {
  const resp = await fetch(`${cred.baseUrl}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: cred.apiKey,
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
async function garantirCliente(cred: CredenciaisAsaas, dados: { nome: string; cpfCnpj: string; email?: string }): Promise<string> {
  const cliente = await asaasFetch<ClienteAsaas>(cred, "/customers", {
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
export async function criarCobrancaPix(
  cred: CredenciaisAsaas,
  params: {
    valorCentavos: bigint;
    descricao: string;
    externalReference: string;
    pagador: { nome: string; cpfCnpj: string; email?: string };
  },
): Promise<CobrancaPix> {
  const clienteId = await garantirCliente(cred, params.pagador);

  const valorReais = Number(params.valorCentavos) / 100;
  const hoje = new Date().toISOString().slice(0, 10); // vencimento hoje (PIX imediato)

  const pagamento = await asaasFetch<PagamentoAsaas>(cred, "/payments", {
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

  const qr = await asaasFetch<QrCodeAsaas>(cred, `/payments/${pagamento.id}/pixQrCode`, { method: "GET" });

  return {
    paymentId: pagamento.id,
    pixCopiaECola: qr.payload,
    pixImagemBase64: qr.encodedImage,
    expiraEm: qr.expirationDate ?? null,
  };
}

/** Testa se as credenciais funcionam (usado pelo painel ao salvar). */
export async function validarCredenciais(cred: CredenciaisAsaas): Promise<boolean> {
  try {
    await asaasFetch<{ object?: string }>(cred, "/myAccount", { method: "GET" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Confere o token do webhook contra o esperado (do tenant ou do env).
 * Comparação de tempo constante para não vazar o segredo por timing.
 */
export function webhookAutentico(tokenRecebido: string | null, esperado: string): boolean {
  if (!esperado) return false; // sem token configurado, recusa tudo
  const a = Buffer.from(tokenRecebido ?? "");
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Status do ASAAS que contam como "pago" (dinheiro caiu). */
export function pagamentoConfirmado(status: string): boolean {
  return status === "RECEIVED" || status === "CONFIRMED" || status === "RECEIVED_IN_CASH";
}
