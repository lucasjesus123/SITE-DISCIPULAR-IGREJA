import "server-only";
import { env } from "@/lib/env";

/**
 * Cliente da uazapi (uazapiGO v2).
 *
 * REGRA DE OURO: nenhum token da uazapi pode chegar ao navegador.
 *   - Admin token (chave-mestra da conta): env `UAZAPI_ADMIN_TOKEN`, header
 *     `admintoken`. Cria/gerencia instâncias.
 *   - Token de instância (por igreja): guardado em `whatsapp_instances.uazToken`,
 *     header `token`. Conecta e envia por AQUELE número.
 *
 * Este módulo é `server-only` — importá-lo de um componente client é erro de
 * build, não um vazamento silencioso.
 */

export class UazapiError extends Error {
  constructor(mensagem: string, public status = 0) {
    super(mensagem);
    this.name = "UazapiError";
  }
}

function baseUrl(): string {
  return env.UAZAPI_BASE_URL.replace(/\/+$/, "");
}

/** WhatsApp só está utilizável se o Admin token foi configurado no servidor. */
export function whatsappConfigurado(): boolean {
  return env.UAZAPI_ADMIN_TOKEN.trim().length > 0;
}

type Opcoes = {
  metodo?: "GET" | "POST";
  admin?: boolean;
  token?: string;
  corpo?: Record<string, unknown>;
};

async function requisitar(caminho: string, opcoes: Opcoes): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opcoes.admin) headers["admintoken"] = env.UAZAPI_ADMIN_TOKEN;
  else if (opcoes.token) headers["token"] = opcoes.token;

  let resposta: Response;
  try {
    resposta = await fetch(baseUrl() + caminho, {
      method: opcoes.metodo ?? "POST",
      headers,
      body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new UazapiError("Não foi possível falar com o serviço de WhatsApp.", 502);
  }

  const texto = await resposta.text();
  let dados: Record<string, unknown> = {};
  try {
    dados = texto ? (JSON.parse(texto) as Record<string, unknown>) : {};
  } catch {
    dados = { raw: texto };
  }

  if (!resposta.ok) {
    const msg =
      (typeof dados.error === "string" && dados.error) ||
      (typeof dados.message === "string" && dados.message) ||
      `Erro do WhatsApp (${resposta.status}).`;
    throw new UazapiError(msg, resposta.status);
  }
  return dados;
}

/** O QR pode vir como data URL ou base64 cru — normaliza para uma <img>. */
function normalizarQr(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length === 0) return null;
  return valor.startsWith("data:") ? valor : `data:image/png;base64,${valor}`;
}

function comoObjeto(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Cria a instância do cliente (1x). Usa o Admin token. */
export async function criarInstancia(nome: string, donoUserId: string) {
  const d = await requisitar("/instance/create", {
    admin: true,
    corpo: { name: nome, adminField01: donoUserId },
  });
  const inst = comoObjeto(d.instance ?? d);
  const id = (inst.id ?? inst.instanceId) as string | undefined;
  const token = inst.token as string | undefined;
  if (!id || !token) throw new UazapiError("Resposta inesperada ao criar a instância.", 500);
  return { id, token };
}

/** Gera o QR (ou paircode se `phone`). Usa o token da instância. */
export async function conectarInstancia(token: string, phone?: string) {
  const d = await requisitar("/instance/connect", {
    token,
    corpo: phone ? { phone } : {},
  });
  const inst = comoObjeto(d.instance ?? d);
  return {
    qrcode: normalizarQr(inst.qrcode),
    paircode: (inst.paircode as string) ?? null,
  };
}

/** Status atual. `conectado && logado` é a verdade final de "está pronto". */
export async function statusInstancia(token: string) {
  const d = await requisitar("/instance/status", { metodo: "GET", token });
  const s = comoObjeto(d.status ?? d.instance ?? d);
  return {
    conectado: Boolean(s.connected),
    logado: Boolean(s.loggedIn),
    textoStatus: (s.status as string) ?? "desconhecido",
    numero: (s.phone as string) ?? (s.owner as string) ?? null,
    perfilNome: (s.profileName as string) ?? (s.profilename as string) ?? null,
  };
}

/** Envio avulso de texto. `delay` (ms) simula "digitando…" e ajuda a entrega. */
export async function enviarTexto(token: string, numero: string, texto: string, delayMs?: number) {
  return requisitar("/send/text", {
    token,
    corpo: { number: numero, text: texto, ...(delayMs ? { delay: delayMs } : {}) },
  });
}
