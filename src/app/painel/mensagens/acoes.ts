"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  id as idSchema,
  idOpcional,
  slug as slugSchema,
  textoLimpo,
  textoLongo,
  dataOpcional,
  youtubeVideoId,
} from "@/lib/validation/comum";

/**
 * Server Actions das mensagens / pregações.
 *
 * DUAS DECISÕES DE SEGURANÇA MORAM AQUI
 *
 * 1. O VÍDEO É GUARDADO COMO ID, NUNCA COMO URL.
 *    O usuário cola o que quiser ("https://youtu.be/abc…", "youtube.com/watch?v=…",
 *    ou só o ID) e o schema `youtubeVideoId` EXTRAI os 11 caracteres e descarta
 *    o resto. Guardar a URL crua significaria montar `<iframe src={url}>` mais
 *    tarde — e aí o conteúdo do frame passa a ser escolhido por quem preencheu
 *    o formulário, não por nós. Um `javascript:`, um site de phishing com a
 *    marca da igreja, um player hostil: tudo dentro do domínio do cliente,
 *    herdando a confiança dele. Com o ID, o `src` é sempre construído por nós.
 *
 * 2. O SLUG É ÚNICO POR IGREJA E DERIVADO DO TÍTULO.
 *    Ele vira URL pública. Deixar o usuário digitá-lo livremente abriria espaço
 *    para caracteres de path ("../", "%2e%2e") e para colisão com rotas do
 *    sistema. Derivamos de um alfabeto fechado [a-z0-9-] e conferimos colisão
 *    dentro do tenant antes de gravar.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  /** Preenchido no sucesso da criação, para o cliente navegar até a mensagem. */
  mensagemId?: string;
}

// -----------------------------------------------------------------------------
// Blocos de validação
// -----------------------------------------------------------------------------

function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );
}

const booleano = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

const schemaMensagem = z.object({
  titulo: textoLimpo(200, 3),
  /** Em branco = derivado do título. Preenchido = usado como base, ainda
   *  normalizado e conferido contra colisão. */
  slug: opcional(slugSchema),
  descricao: opcional(textoLongo(5000)),
  preletor: opcional(textoLimpo(160)),
  serie: opcional(textoLimpo(120)),

  /** Aceita URL colada; guarda só o ID de 11 caracteres. */
  video: opcional(youtubeVideoId),

  /** O formulário pede minutos; o banco guarda segundos. */
  duracaoMinutos: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().min(0).max(600).optional(),
  ),

  data: dataOpcional,
  capaArquivoId: idOpcional,

  publicado: booleano,
  destaque: booleano,
});

type DadosMensagem = z.infer<typeof schemaMensagem>;

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

export async function criarMensagem(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("mensagens.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaMensagem.parse(dadosBrutos);

    const erroCapa = await validarCapa(ctx, dados.capaArquivoId);
    if (erroCapa) return erroCapa;

    const slug = await slugLivre(ctx, baseDeSlug(dados));
    if (!slug) {
      return {
        ok: false,
        mensagem: "Confira os campos destacados.",
        campos: { slug: ["Já existem mensagens demais com esse endereço. Mude o título ou o endereço."] },
      };
    }

    const criada = await ctx.db.mensagem.create({
      data: { ...camposComuns(dados), slug },
      select: { id: true },
    });

    await auditar(ctx, {
      acao: "mensagem.criar",
      alvoTipo: "Mensagem",
      alvoId: criada.id,
      detalhes: { slug, publicado: dados.publicado, comVideo: Boolean(dados.video) },
    });

    revalidarMensagens(slug);
    return { ok: true, mensagem: "Mensagem criada.", mensagemId: criada.id };
  } catch (erro) {
    return traduzirErro(erro, "criarMensagem");
  }
}

// -----------------------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------------------

export async function atualizarMensagem(
  mensagemId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("mensagens.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(mensagemId);
    const dados = schemaMensagem.parse(dadosBrutos);

    const atual = await ctx.db.mensagem.findFirst({
      where: { id },
      select: { id: true, slug: true, publicado: true },
    });
    if (!atual) return { ok: false, mensagem: "Mensagem não encontrada." };

    const erroCapa = await validarCapa(ctx, dados.capaArquivoId);
    if (erroCapa) return erroCapa;

    /**
     * O slug SÓ muda se o usuário pediu explicitamente.
     *
     * Renomear o slug a cada edição de título quebraria todo link já
     * compartilhado no WhatsApp da igreja — e ninguém entenderia por quê.
     * Editar o título é operação corriqueira; mudar o endereço público não é.
     */
    let slug = atual.slug;
    if (dados.slug && dados.slug !== atual.slug) {
      const candidato = await slugLivre(ctx, dados.slug, id);
      if (!candidato) {
        return {
          ok: false,
          mensagem: "Confira os campos destacados.",
          campos: { slug: ["Este endereço já está em uso por outra mensagem."] },
        };
      }
      slug = candidato;
    }

    await ctx.db.mensagem.update({ where: { id }, data: { ...camposComuns(dados), slug } });

    await auditar(ctx, {
      acao: "mensagem.atualizar",
      alvoTipo: "Mensagem",
      alvoId: id,
      detalhes: {
        slugAnterior: atual.slug,
        slugNovo: slug,
        publicadoAnterior: atual.publicado,
        publicadoNovo: dados.publicado,
      },
    });

    revalidarMensagens(slug, atual.slug);
    return { ok: true, mensagem: "Mensagem salva.", mensagemId: id };
  } catch (erro) {
    return traduzirErro(erro, "atualizarMensagem");
  }
}

// -----------------------------------------------------------------------------
// Excluir
// -----------------------------------------------------------------------------

export async function excluirMensagem(mensagemId: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("mensagens.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(mensagemId);

    const mensagem = await ctx.db.mensagem.findFirst({
      where: { id },
      select: { id: true, titulo: true, slug: true },
    });
    if (!mensagem) return { ok: false, mensagem: "Mensagem não encontrada." };

    // Exclusão física: o registro é autocontido (nada depende dele) e o arquivo
    // de capa continua no storage, referenciado só por este vínculo que some
    // junto. Apagar o binário é ação destrutiva com fluxo próprio.
    await ctx.db.mensagem.delete({ where: { id } });

    await auditar(ctx, {
      acao: "mensagem.excluir",
      alvoTipo: "Mensagem",
      alvoId: id,
      detalhes: { titulo: mensagem.titulo, slug: mensagem.slug },
    });

    revalidarMensagens(mensagem.slug);
    return { ok: true, mensagem: "Mensagem removida." };
  } catch (erro) {
    return traduzirErro(erro, "excluirMensagem");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function camposComuns(dados: DadosMensagem) {
  return {
    titulo: dados.titulo,
    descricao: dados.descricao ?? null,
    preletor: dados.preletor ?? null,
    serie: dados.serie ?? null,
    youtubeVideoId: dados.video ?? null,
    duracaoSegundos:
      dados.duracaoMinutos === undefined ? null : dados.duracaoMinutos * 60,
    data: paraData(dados.data),
    capaArquivoId: dados.capaArquivoId ?? null,
    publicado: dados.publicado,
    destaque: dados.destaque,
  };
}

/** "AAAA-MM-DD" -> Date à meia-noite UTC (a coluna é `@db.Date`). */
function paraData(valor?: string): Date | null {
  if (!valor) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function baseDeSlug(dados: DadosMensagem): string {
  return dados.slug ?? derivarSlug(dados.titulo);
}

/** "A Graça que Transforma" -> "a-graca-que-transforma" */
function derivarSlug(titulo: string): string {
  const base = titulo
    .normalize("NFD")
    // Remove os diacríticos separados pela decomposição NFD. Sem isto,
    // "Coração" viraria "corao" em vez de "coracao".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Alfabeto FECHADO: tudo que não é letra ou dígito vira hífen. É o que
    // garante que nada parecido com um caminho ("../", "%2f") sobreviva.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/g, "");

  // Um título só de pontuação ("!!!") produziria slug vazio, e um slug vazio
  // colidiria com a listagem da série.
  return base.length >= 2 ? base : "mensagem";
}

/**
 * Acha a primeira variação livre: `base`, `base-2`, `base-3`…
 *
 * A contagem passa pelo `ctx.db`, então a unicidade conferida é DENTRO da
 * igreja — que é exatamente o que o índice `@@unique([tenantId, slug])` exige.
 * Duas igrejas podem ter "/mensagens/a-graca-que-transforma" sem conflito.
 *
 * Ainda assim existe uma janela de corrida entre a contagem e o insert. Ela é
 * fechada pelo índice único do banco: o segundo insert falha, o catch traduz
 * para mensagem genérica e o usuário tenta de novo. Preferimos isso a um lock.
 */
async function slugLivre(
  ctx: ContextoAutorizado,
  base: string,
  ignorarId?: string,
): Promise<string | null> {
  for (let tentativa = 0; tentativa < 25; tentativa += 1) {
    const candidato = tentativa === 0 ? base : `${base.slice(0, 110)}-${tentativa + 1}`;

    const existe = await ctx.db.mensagem.count({
      where: {
        slug: candidato,
        ...(ignorarId ? { id: { not: ignorarId } } : {}),
      },
    });
    if (existe === 0) return candidato;
  }
  return null;
}

/**
 * Confirma que a capa existe NESTA igreja e é imagem.
 *
 * O `ctx.db` já impede pegar arquivo de outra igreja. A checagem de MIME é
 * outra coisa: um PDF como capa quebraria o layout do site, e o `id` chega
 * pelo payload da action — onde qualquer valor pode aparecer.
 */
async function validarCapa(
  ctx: ContextoAutorizado,
  capaArquivoId?: string,
): Promise<ResultadoAcao | null> {
  if (!capaArquivoId) return null;

  const arquivo = await ctx.db.arquivo.findFirst({
    where: { id: capaArquivoId },
    select: { id: true, mimeType: true },
  });

  if (!arquivo) {
    return {
      ok: false,
      mensagem: "Confira os campos destacados.",
      campos: { capaArquivoId: ["Imagem não encontrada. Envie o arquivo novamente."] },
    };
  }
  if (!arquivo.mimeType.startsWith("image/")) {
    return {
      ok: false,
      mensagem: "Confira os campos destacados.",
      campos: { capaArquivoId: ["A capa precisa ser uma imagem."] },
    };
  }
  return null;
}

function revalidarMensagens(...slugs: (string | undefined)[]): void {
  revalidatePath("/painel/mensagens");
  revalidatePath("/mensagens");
  for (const s of slugs) {
    if (s) revalidatePath(`/mensagens/${s}`);
  }
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    return { ok: false, mensagem: "Confira os campos destacados.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  if (nome === "NaoAutorizadoError") return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Mensagem não encontrada." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
