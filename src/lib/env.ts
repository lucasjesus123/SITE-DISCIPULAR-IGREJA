import { z } from "zod";

/**
 * Validação das variáveis de ambiente.
 *
 * Por que falhar na inicialização em vez de tratar `undefined` no meio do
 * código: um `SESSION_SECRET` ausente faria o HMAC ser calculado sobre a
 * string "undefined", e todo mundo passaria a ter o mesmo hash de sessão.
 * É melhor o processo nem subir.
 */

const base64Min = (bytes: number) =>
  z.string().refine(
    (v) => {
      try {
        return Buffer.from(v, "base64").length >= bytes;
      } catch {
        return false;
      }
    },
    { message: `precisa ser base64 com pelo menos ${bytes} bytes de entropia` },
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),

  SESSION_SECRET: base64Min(32),
  ENCRYPTION_KEY: base64Min(32),
  CSRF_SECRET: base64Min(32),

  ROOT_DOMAIN: z
    .string()
    .min(3)
    .transform((v) => v.toLowerCase().trim()),
  APP_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3000),

  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  STORAGE_DIR: z.string().min(1).default("/var/lib/discipular/storage"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  YOUTUBE_API_KEY: z.string().optional().default(""),
  YOUTUBE_LIVE_CACHE_SECONDS: z.coerce.number().int().min(15).default(60),

  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().int().optional().default(587),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASSWORD: z.string().optional().default(""),
  SMTP_FROM: z.string().optional().default(""),

  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

function load() {
  // Durante `next build`, o Next importa todos os módulos para coletar as
  // páginas — mas as variáveis de ambiente (segredos) são de RUNTIME, não de
  // build, e não devem estar presentes na máquina de build. Se validássemos
  // aqui, o build quebraria por falta de segredo, empurrando o desenvolvedor a
  // colocar segredo de produção no ambiente de build — exatamente o que não
  // queremos. A validação de verdade acontece quando o servidor sobe (fase
  // diferente de NEXT_PHASE), com os segredos reais injetados pelo runtime.
  const emBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (emBuild) {
    return schema.parse({
      ...process.env,
      // Placeholders APENAS para o build passar. Nunca alcançam o runtime:
      // no `next start` este ramo não roda e a validação real ocorre.
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build",
      SESSION_SECRET: process.env.SESSION_SECRET ?? Buffer.alloc(32, 1).toString("base64"),
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY ?? Buffer.alloc(32, 2).toString("base64"),
      CSRF_SECRET: process.env.CSRF_SECRET ?? Buffer.alloc(32, 3).toString("base64"),
      ROOT_DOMAIN: process.env.ROOT_DOMAIN ?? "build.local",
      APP_URL: process.env.APP_URL ?? "http://localhost:3000",
      NODE_ENV: "development",
    });
  }

  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    // Listamos apenas os NOMES das variáveis problemáticas. Imprimir o valor
    // recebido despejaria segredos no log de inicialização do systemd/Docker.
    const problemas = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");

    throw new Error(
      `Configuração de ambiente inválida. Corrija o .env:\n${problemas}\n` +
        `Use .env.example como referência.`,
    );
  }

  const env = parsed.data;

  // Travas que só fazem sentido em produção.
  if (env.NODE_ENV === "production") {
    if (!env.APP_URL.startsWith("https://")) {
      throw new Error("APP_URL precisa usar https:// em produção.");
    }
    // Impede subir produção com os placeholders do .env.example.
    const placeholders = ["GERE_COM", "TROQUE_ESTA_SENHA", "changeme", "secret"];
    for (const [chave, valor] of Object.entries({
      SESSION_SECRET: env.SESSION_SECRET,
      ENCRYPTION_KEY: env.ENCRYPTION_KEY,
      CSRF_SECRET: env.CSRF_SECRET,
      DATABASE_URL: env.DATABASE_URL,
    })) {
      if (placeholders.some((p) => valor.includes(p))) {
        throw new Error(
          `${chave} ainda está com o valor de exemplo. Gere um segredo real antes de ir para produção.`,
        );
      }
    }
    // Três segredos distintos: se um vazar, os outros dois continuam válidos.
    const segredos = new Set([env.SESSION_SECRET, env.ENCRYPTION_KEY, env.CSRF_SECRET]);
    if (segredos.size !== 3) {
      throw new Error(
        "SESSION_SECRET, ENCRYPTION_KEY e CSRF_SECRET precisam ser valores diferentes entre si.",
      );
    }
  }

  return env;
}

export const env = load();

export const isProd = env.NODE_ENV === "production";
export const isDev = env.NODE_ENV === "development";
