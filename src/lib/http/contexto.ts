import { headers } from "next/headers";
import { hashIp } from "@/lib/crypto";

/**
 * Leitura do contexto confiável que o middleware anexou à requisição.
 *
 * Estes headers são reescritos incondicionalmente em src/middleware.ts, então
 * o cliente não consegue forjá-los. Toda decisão de segurança que dependa de
 * hostname ou IP deve passar por aqui — nunca ler `host` ou
 * `x-forwarded-for` direto.
 */

const HEADER_HOST = "x-discipular-host";
const HEADER_NONCE = "x-discipular-nonce";
const HEADER_IP = "x-discipular-ip";

export async function hostAtual(): Promise<string> {
  const h = await headers();
  return h.get(HEADER_HOST) ?? "";
}

export async function nonceAtual(): Promise<string> {
  const h = await headers();
  return h.get(HEADER_NONCE) ?? "";
}

export async function ipAtual(): Promise<string> {
  const h = await headers();
  return h.get(HEADER_IP) ?? "0.0.0.0";
}

/** IP já hasheado, pronto para gravar em log ou usar como chave de rate limit. */
export async function ipHashAtual(): Promise<string> {
  return hashIp(await ipAtual());
}

export async function userAgentAtual(): Promise<string> {
  const h = await headers();
  // Truncado: user agents chegam a milhares de caracteres em ataques de
  // enchimento de log.
  return (h.get("user-agent") ?? "").slice(0, 255);
}

/** Versão para Route Handlers, que recebem o Request diretamente. */
export function contextoDeRequest(request: Request) {
  return {
    host: request.headers.get(HEADER_HOST) ?? "",
    nonce: request.headers.get(HEADER_NONCE) ?? "",
    ip: request.headers.get(HEADER_IP) ?? "0.0.0.0",
    ipHash: hashIp(request.headers.get(HEADER_IP) ?? "0.0.0.0"),
    userAgent: (request.headers.get("user-agent") ?? "").slice(0, 255),
  };
}
