import { env, isProd } from "@/lib/env";

/**
 * Logger estruturado.
 *
 * REGRA
 * Log é texto que sobrevive à requisição e frequentemente sai da máquina
 * (journald, agregador, backup). Tudo que entra aqui deve ser tratado como
 * potencialmente público.
 *
 * NUNCA logar: senha, token, cookie, conteúdo de pedido de oração, ficha de
 * membro, e-mail/telefone de terceiros. Use IDs — eles são resolvíveis por
 * quem tem acesso legítimo ao banco e inúteis para quem não tem.
 */

type Nivel = "debug" | "info" | "warn" | "error";

const ORDEM: Record<Nivel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MINIMO = ORDEM[env.LOG_LEVEL];

/** Chaves que são removidas de qualquer contexto, mesmo por engano. */
const PROIBIDAS = new Set([
  "senha", "password", "senhaHash", "token", "tokenHash", "cookie",
  "authorization", "secret", "apiKey", "pixChave", "cpf", "pedido",
  "observacoesPastorais", "_csrf",
]);

function limpar(contexto: Record<string, unknown>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(contexto)) {
    if (PROIBIDAS.has(chave) || PROIBIDAS.has(chave.toLowerCase())) {
      saida[chave] = "[removido]";
      continue;
    }
    if (typeof valor === "string" && valor.length > 300) {
      saida[chave] = `${valor.slice(0, 300)}…`;
      continue;
    }
    saida[chave] = valor;
  }
  return saida;
}

function emitir(nivel: Nivel, mensagem: string, contexto?: Record<string, unknown>) {
  if (ORDEM[nivel] < MINIMO) return;

  const registro = {
    ts: new Date().toISOString(),
    nivel,
    msg: mensagem,
    ...(contexto ? limpar(contexto) : {}),
  };

  // JSON em produção (para o agregador), legível em desenvolvimento.
  const saida = isProd ? JSON.stringify(registro) : `[${nivel}] ${mensagem} ${contexto ? JSON.stringify(limpar(contexto)) : ""}`;

  if (nivel === "error") console.error(saida);
  else if (nivel === "warn") console.warn(saida);
  else console.log(saida);
}

export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emitir("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emitir("info", msg, ctx),
  aviso: (msg: string, ctx?: Record<string, unknown>) => emitir("warn", msg, ctx),

  /**
   * Registra um erro com um ID de correlação.
   *
   * O ID é o que permite responder ao usuário "ocorreu um erro (ref: a1b2c3)"
   * sem contar NADA sobre a causa, e ainda assim achar o registro completo no
   * log em segundos. É o oposto de despejar stack trace na tela.
   */
  erro: (msg: string, erro: unknown, ctx?: Record<string, unknown>): string => {
    const id = crypto.randomUUID().slice(0, 8);
    emitir("error", msg, {
      ...ctx,
      refErro: id,
      tipo: erro instanceof Error ? erro.name : typeof erro,
      detalhe: erro instanceof Error ? erro.message : String(erro),
      // Stack só em desenvolvimento: em produção ele revela caminhos internos
      // e versões de biblioteca, úteis para quem procura vulnerabilidade.
      ...(isProd ? {} : { stack: erro instanceof Error ? erro.stack : undefined }),
    });
    return id;
  },
};
