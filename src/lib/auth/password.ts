import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  senha: string | Buffer,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Hash de senha com scrypt (RFC 7914), da biblioteca padrão do Node.
 *
 * Por que scrypt e não bcrypt/argon2:
 *  - Vem no Node, sem dependência nativa que possa quebrar no build da VPS
 *    nem entrar na superfície de ataque de supply chain.
 *  - É memory-hard, ao contrário do bcrypt: encarece muito o ataque em GPU.
 *  - Argon2id seria marginalmente melhor, mas exige binding nativo. A troca
 *    é possível depois sem migração forçada, porque o formato abaixo carrega
 *    o algoritmo e os parâmetros (ver `precisaRehash`).
 */

// N=2^16 (65536), r=8, p=1 -> ~64 MB de RAM e ~100ms por hash em CPU de VPS.
// Este é o perfil "INTERACTIVE" endurecido: forte o bastante para senha de
// usuário, leve o bastante para não virar vetor de DoS no login.
const PARAMS = { N: 65536, r: 8, p: 1 } as const;
const KEYLEN = 32;
const SALT_BYTES = 16;
// maxmem precisa ser > 128 * N * r, senão o Node recusa os parâmetros.
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

/**
 * Produz `scrypt$N$r$p$<salt-b64>$<hash-b64>`.
 * Os parâmetros ficam embutidos para que hashes antigos continuem
 * verificáveis depois de endurecermos o custo.
 */
export async function hashSenha(senha: string): Promise<string> {
  validarForca(senha);
  const salt = randomBytes(SALT_BYTES);
  const derivada = await scrypt(senha.normalize("NFKC"), salt, KEYLEN, {
    ...PARAMS,
    maxmem: MAXMEM,
  });
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derivada.toString("base64"),
  ].join("$");
}

/**
 * Verifica a senha em tempo constante.
 *
 * Retorna false para qualquer hash malformado em vez de lançar: um registro
 * corrompido no banco não deve derrubar a rota de login (nem virar um sinal
 * distinguível para quem está sondando contas).
 */
export async function verificarSenha(senha: string, hashArmazenado: string): Promise<boolean> {
  try {
    const partes = hashArmazenado.split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return false;

    const N = Number(partes[1]);
    const r = Number(partes[2]);
    const p = Number(partes[3]);
    const salt = Buffer.from(partes[4]!, "base64");
    const esperado = Buffer.from(partes[5]!, "base64");

    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    // Teto de custo: impede que um hash adulterado no banco force o servidor
    // a alocar gigabytes e derrubar o processo.
    if (N > 1 << 20 || r > 32 || p > 16) return false;

    const derivada = await scrypt(senha.normalize("NFKC"), salt, esperado.length, {
      N,
      r,
      p,
      maxmem: 128 * N * r * 2,
    });

    if (derivada.length !== esperado.length) return false;
    return timingSafeEqual(derivada, esperado);
  } catch {
    return false;
  }
}

/**
 * Indica que o hash foi gerado com parâmetros mais fracos que os atuais.
 * O login chama isto e regrava o hash de forma transparente, então a base
 * se fortalece sozinha conforme os usuários entram.
 */
export function precisaRehash(hashArmazenado: string): boolean {
  const partes = hashArmazenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return true;
  return Number(partes[1]) < PARAMS.N || Number(partes[2]) < PARAMS.r;
}

/** Erro de política de senha — a rota traduz para 400, não para 500. */
export class SenhaFracaError extends Error {
  constructor(public readonly motivo: string) {
    super(motivo);
    this.name = "SenhaFracaError";
  }
}

/**
 * Política de senha alinhada ao NIST SP 800-63B: comprimento importa,
 * regras de "1 maiúscula + 1 símbolo" não. Bloqueamos o que realmente
 * aparece em vazamento: senha curta, sequência óbvia e termo do produto.
 */
const SENHAS_PROIBIDAS = [
  "123456", "1234567", "12345678", "123456789", "1234567890",
  "senha", "password", "qwerty", "abc123", "111111", "000000",
  "igreja", "discipular", "jesus123", "deus123", "admin", "administrador",
  "mudar123", "trocar123", "teste123",
];

export function validarForca(senha: string): void {
  if (senha.length < 12) {
    throw new SenhaFracaError("A senha precisa ter pelo menos 12 caracteres.");
  }
  // Teto: senha gigante multiplicada pelo custo do scrypt é um DoS barato.
  if (senha.length > 256) {
    throw new SenhaFracaError("A senha pode ter no máximo 256 caracteres.");
  }
  const normalizada = senha.toLowerCase().normalize("NFKC");
  for (const proibida of SENHAS_PROIBIDAS) {
    if (normalizada === proibida || normalizada.startsWith(proibida)) {
      throw new SenhaFracaError("Esta senha é muito comum. Escolha outra.");
    }
  }
  // "aaaaaaaaaaaa" tem 12 caracteres mas ~1 bit de entropia.
  if (new Set(normalizada).size < 5) {
    throw new SenhaFracaError("A senha precisa ter mais variedade de caracteres.");
  }
}

/**
 * Consome tempo de CPU equivalente a uma verificação real.
 *
 * Chamado quando o e-mail não existe. Sem isso, "usuário inexistente"
 * responderia em 2ms e "senha errada" em 100ms — diferença suficiente para
 * enumerar quem tem conta no sistema.
 */
export async function verificacaoFalsa(): Promise<void> {
  const salt = randomBytes(SALT_BYTES);
  await scrypt("senha-descartavel-para-igualar-o-tempo", salt, KEYLEN, {
    ...PARAMS,
    maxmem: MAXMEM,
  });
}
