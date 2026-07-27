import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

/**
 * Primitivas criptográficas do sistema.
 *
 * Tudo aqui usa apenas o módulo `node:crypto` — sem dependência externa.
 * Menos dependências no caminho da criptografia significa menos superfície
 * para uma vulnerabilidade de cadeia de suprimentos.
 */

const ENCRYPTION_KEY = Buffer.from(env.ENCRYPTION_KEY, "base64").subarray(0, 32);
const SESSION_SECRET = Buffer.from(env.SESSION_SECRET, "base64");
const CSRF_SECRET = Buffer.from(env.CSRF_SECRET, "base64");

// -----------------------------------------------------------------------------
// Tokens aleatórios
// -----------------------------------------------------------------------------

/**
 * Token opaco com 256 bits de entropia, seguro para URL.
 * Usado em sessão, verificação de domínio e reset de senha.
 */
export function gerarToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// -----------------------------------------------------------------------------
// Hash com chave (para guardar tokens no banco)
// -----------------------------------------------------------------------------

/**
 * HMAC-SHA256 com a chave de sessão.
 *
 * Guardamos no banco o resultado disto, nunca o token em claro. Se o banco
 * vazar, o atacante não consegue montar um cookie válido, porque o HMAC não
 * é reversível e ele não tem SESSION_SECRET.
 *
 * É HMAC e não SHA-256 puro justamente para isso: um SHA-256 puro de um
 * token de 256 bits seria irreversível na prática, mas o HMAC dá a
 * propriedade extra de que trocar SESSION_SECRET invalida tudo de uma vez.
 */
export function hashToken(token: string): string {
  return createHmac("sha256", SESSION_SECRET).update(token).digest("hex");
}

/**
 * Hash de IP para logs e rate limit.
 *
 * O IP é dado pessoal sob a LGPD. Guardamos só o HMAC: continuamos capazes de
 * dizer "estas 400 tentativas vieram do mesmo lugar" sem armazenar de quem é.
 */
export function hashIp(ip: string): string {
  return createHmac("sha256", SESSION_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 64);
}

// -----------------------------------------------------------------------------
// Comparação em tempo constante
// -----------------------------------------------------------------------------

/**
 * Compara duas strings sem vazar, pelo tempo de execução, em qual caractere
 * elas divergem. Obrigatório ao comparar tokens, hashes e assinaturas.
 */
export function compararSeguro(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual exige mesmo comprimento; normalizamos com um HMAC para
  // que nem o comprimento vaze.
  const normA = createHmac("sha256", SESSION_SECRET).update(bufA).digest();
  const normB = createHmac("sha256", SESSION_SECRET).update(bufB).digest();
  return timingSafeEqual(normA, normB);
}

// -----------------------------------------------------------------------------
// Criptografia simétrica autenticada (AES-256-GCM)
// -----------------------------------------------------------------------------

/**
 * Cifra um texto para guardar no banco.
 *
 * Formato de saída: `v1.<iv-b64url>.<tag-b64url>.<ciphertext-b64url>`
 * O prefixo de versão permite trocar de algoritmo no futuro sem quebrar os
 * dados já gravados.
 *
 * GCM (e não CBC) porque é AEAD: detecta adulteração do ciphertext. Com CBC
 * um atacante com acesso de escrita ao banco poderia alterar bytes e o
 * sistema decifraria lixo silenciosamente.
 */
export function criptografar(textoClaro: string): string {
  const iv = randomBytes(12); // 96 bits, tamanho recomendado para GCM
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const cifrado = Buffer.concat([cipher.update(textoClaro, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

/**
 * Decifra um valor produzido por `criptografar`.
 * Retorna null se o formato for inválido ou a tag de autenticação não bater
 * (dado corrompido ou adulterado) — nunca lança para o chamador.
 */
export function descriptografar(valor: string): string | null {
  try {
    const partes = valor.split(".");
    if (partes.length !== 4 || partes[0] !== "v1") return null;

    const iv = Buffer.from(partes[1]!, "base64url");
    const tag = Buffer.from(partes[2]!, "base64url");
    const cifrado = Buffer.from(partes[3]!, "base64url");

    if (iv.length !== 12 || tag.length !== 16) return null;

    const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString("utf8");
  } catch {
    // Falha de autenticação cai aqui. Silenciar é correto: qualquer detalhe
    // devolvido viraria um oráculo de padding/autenticação.
    return null;
  }
}

// -----------------------------------------------------------------------------
// Assinatura de payload curto (CSRF)
// -----------------------------------------------------------------------------

export function assinarCsrf(valor: string): string {
  return createHmac("sha256", CSRF_SECRET).update(valor).digest("base64url");
}

export function verificarAssinaturaCsrf(valor: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinarCsrf(valor), "utf8");
  const recebida = Buffer.from(assinatura, "utf8");
  if (esperada.length !== recebida.length) return false;
  return timingSafeEqual(esperada, recebida);
}
