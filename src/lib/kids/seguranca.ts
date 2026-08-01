import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * Segurança do Ministério Infantil — o núcleo mais sensível do sistema.
 *
 * Duas primitivas, ambas com o SEGREDO injetado por parâmetro (não lê env),
 * para serem 100% testáveis de forma determinística:
 *
 *  1. CÓDIGO DE SEGURANÇA (check-out): um código curto e legível é dado no
 *     check-in; guardamos só o HASH. Na retirada, comparamos em tempo constante.
 *     Código errado → recusado. (Regra inegociável 3.1 / 3.8-c.)
 *
 *  2. TOKEN DO QR: opaco, assinado (HMAC) e com validade curta. NÃO carrega
 *     dado da criança — só o id da sessão e a expiração. Escanear NÃO concede
 *     acesso: o token só leva o pai até a porta; a chave é o login dele
 *     (regra 3.2). O uso único é garantido no banco (qr_token.usado).
 */

// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) — código ditado por telefone
// ou lido de um crachá não vira erro.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Gera um código de segurança legível (padrão 6 caracteres). */
export function gerarCodigoSeguranca(tamanho = 6): string {
  let saida = "";
  for (let i = 0; i < tamanho; i++) {
    saida += ALFABETO[randomInt(0, ALFABETO.length)];
  }
  return saida;
}

/** HMAC-SHA256 do código (normalizado). Só o hash é guardado. */
export function hashCodigo(codigo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(codigo.trim().toUpperCase()).digest("hex");
}

/** Compara o código informado com o hash guardado, em tempo constante. */
export function verificarCodigo(codigo: string, hashGuardado: string, segredo: string): boolean {
  const calculado = hashCodigo(codigo, segredo);
  const a = Buffer.from(calculado, "hex");
  const b = Buffer.from(hashGuardado, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// -----------------------------------------------------------------------------
// Token do QR
// -----------------------------------------------------------------------------

export type PayloadQr = { sid: string; exp: number };

function base64url(dado: string | Buffer): string {
  return Buffer.from(dado).toString("base64url");
}

/** Assina `{ sid, exp }` → "payload.assinatura". `exp` é epoch em ms. */
export function assinarTokenQr(dados: PayloadQr, segredo: string): string {
  const payload = base64url(JSON.stringify(dados));
  const assinatura = base64url(createHmac("sha256", segredo).update(payload).digest());
  return `${payload}.${assinatura}`;
}

/**
 * Verifica assinatura e validade. `agoraMs` é injetado para o teste ser
 * determinístico. Retorna os dados só se o token for íntegro E não expirado.
 */
export function verificarTokenQr(
  token: string,
  segredo: string,
  agoraMs: number,
): { valido: boolean; dados?: PayloadQr } {
  const partes = token.split(".");
  if (partes.length !== 2) return { valido: false };
  const [payload, assinatura] = partes as [string, string];

  const esperada = base64url(createHmac("sha256", segredo).update(payload).digest());
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valido: false };

  let dados: PayloadQr;
  try {
    dados = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PayloadQr;
  } catch {
    return { valido: false };
  }
  if (typeof dados.sid !== "string" || typeof dados.exp !== "number") return { valido: false };
  if (dados.exp < agoraMs) return { valido: false }; // expirado

  return { valido: true, dados };
}
