"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { criptografar } from "@/lib/crypto";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  corHex,
  emailOpcional,
  telefoneOpcional,
  textoLimpo,
  textoLongo,
  urlOpcional,
  youtubeChannelId,
  youtubeVideoId,
  horario,
  diaSemana,
} from "@/lib/validation/comum";
import { fontesDisponiveis } from "@/lib/site/theme";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
}

/**
 * Edição do site whitelabel.
 *
 * Cada campo aqui vira conteúdo público servido no domínio da igreja. O
 * conjunto de validações não é formalidade: é o que impede que um admin de
 * igreja (ou uma conta dele comprometida) transforme o próprio site em vetor
 * de ataque.
 *
 *   - cores      -> regex hexadecimal ancorada (senão: injeção de CSS)
 *   - fontes     -> lista fechada (senão: @import de CSS externo)
 *   - URLs       -> só http(s), sem host interno (senão: SSRF / javascript:)
 *   - YouTube    -> só o ID de 11 caracteres (senão: iframe arbitrário)
 *   - PIX/banco  -> criptografado em repouso (é alvo direto de fraude)
 */

const schemaMarca = z.object({
  nomeExibicao: textoLimpo(120, 2),
  tagline: textoLimpo(200).optional(),
  descricaoSeo: textoLimpo(300).optional(),

  corAcento: corHex,
  corAcentoClara: corHex,
  corTinta: corHex,
  corPapel: corHex,

  // `z.enum` sobre a allowlist do tema. Uma fonte fora da lista é recusada
  // no schema, antes mesmo de `fonteSegura()` ter que agir na renderização.
  fonteTitulo: z.enum(fontesDisponiveis as [string, ...string[]]),
  fonteTexto: z.enum(fontesDisponiveis as [string, ...string[]]),

  heroEyebrow: textoLimpo(80).optional(),
  heroTitulo: textoLimpo(200).optional(),
  heroSubtitulo: textoLongo(400).optional(),
  heroCtaTexto: textoLimpo(60).optional(),
  heroCtaLink: textoLimpo(200).optional(),
  // Ids de Arquivo (cuid) de imagens. Vazio = sem imagem. A posse pelo tenant e
  // o tipo (imagem) são checados abaixo, antes de gravar.
  heroImagemId: z.string().max(30).optional(),
  fundoImagemId: z.string().max(30).optional(),
  fotoPastorId: z.string().max(30).optional(),
  fotoPastoraId: z.string().max(30).optional(),

  emailContato: emailOpcional,
  telefoneContato: telefoneOpcional,
  whatsapp: telefoneOpcional,

  instagram: urlOpcional,
  facebook: urlOpcional,
  youtube: urlOpcional,
  spotify: urlOpcional,

  pixChave: textoLimpo(200).optional(),
  pixTitular: textoLimpo(160).optional(),
  pixDescricao: textoLongo(1000).optional(),
  dadosBancarios: textoLongo(1000).optional(),

  pwaNome: textoLimpo(60).optional(),
  pwaNomeCurto: textoLimpo(20).optional(),
  pwaCorTema: corHex.optional(),
});

export async function salvarConfigSite(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaMarca.parse(dadosBrutos);

    /**
     * Imagem de capa: só aceitamos um Arquivo que pertença A ESTA igreja, que
     * seja imagem e que esteja marcado como público. Sem esta checagem, alguém
     * poderia mandar o id de um arquivo de OUTRO tenant e exibi-lo no seu site
     * — vazamento entre igrejas — ou apontar para um PDF/secreto. Vazio limpa.
     */
    async function idImagemValida(id: string | undefined): Promise<string | null | false> {
      if (!id || id.length === 0) return null; // vazio = sem imagem
      const arquivo = await ctx.db.arquivo.findFirst({
        where: { id },
        select: { id: true, mimeType: true, publico: true },
      });
      if (!arquivo || !arquivo.mimeType.startsWith("image/") || !arquivo.publico) return false;
      return arquivo.id;
    }

    const heroImagemId = await idImagemValida(dados.heroImagemId);
    const fundoImagemId = await idImagemValida(dados.fundoImagemId);
    const fotoPastorId = await idImagemValida(dados.fotoPastorId);
    const fotoPastoraId = await idImagemValida(dados.fotoPastoraId);
    if (
      heroImagemId === false || fundoImagemId === false ||
      fotoPastorId === false || fotoPastoraId === false
    ) {
      return {
        ok: false,
        mensagem: "Uma das imagens é inválida. Envie o arquivo novamente.",
        campos: {
          ...(heroImagemId === false ? { heroImagemId: ["Imagem não encontrada. Envie novamente."] } : {}),
          ...(fundoImagemId === false ? { fundoImagemId: ["Imagem não encontrada. Envie novamente."] } : {}),
          ...(fotoPastorId === false ? { fotoPastorId: ["Imagem não encontrada. Envie novamente."] } : {}),
          ...(fotoPastoraId === false ? { fotoPastoraId: ["Imagem não encontrada. Envie novamente."] } : {}),
        },
      };
    }

    /**
     * Dados bancários são criptografados com AES-256-GCM antes de ir para o
     * banco. Um dump vazado não entrega para onde transferir o dinheiro das
     * ofertas da igreja — que é o dado mais diretamente monetizável de todo
     * o sistema.
     *
     * A chave PIX fica em claro de propósito: ela é publicada no site, então
     * criptografá-la seria teatro. Dados bancários completos (banco, agência,
     * conta, titular) não são publicados, e por isso são protegidos.
     */
    const bancariosCriptografados = dados.dadosBancarios
      ? criptografar(dados.dadosBancarios)
      : undefined;

    await ctx.db.siteConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: {
        tenantId: ctx.tenant.id,
        nomeExibicao: dados.nomeExibicao,
        tagline: dados.tagline,
        descricaoSeo: dados.descricaoSeo,
        corAcento: dados.corAcento,
        corAcentoClara: dados.corAcentoClara,
        corTinta: dados.corTinta,
        corPapel: dados.corPapel,
        fonteTitulo: dados.fonteTitulo,
        fonteTexto: dados.fonteTexto,
        heroEyebrow: dados.heroEyebrow,
        heroTitulo: dados.heroTitulo,
        heroSubtitulo: dados.heroSubtitulo,
        heroCtaTexto: dados.heroCtaTexto,
        heroCtaLink: dados.heroCtaLink,
        heroImagemId,
        fundoImagemId,
        fotoPastorId,
        fotoPastoraId,
        emailContato: dados.emailContato,
        telefoneContato: dados.telefoneContato,
        whatsapp: dados.whatsapp,
        instagram: dados.instagram,
        facebook: dados.facebook,
        youtube: dados.youtube,
        spotify: dados.spotify,
        pixChave: dados.pixChave,
        pixTitular: dados.pixTitular,
        pixDescricao: dados.pixDescricao,
        dadosBancariosCriptografados: bancariosCriptografados,
        pwaNome: dados.pwaNome,
        pwaNomeCurto: dados.pwaNomeCurto,
        pwaCorTema: dados.pwaCorTema ?? dados.corTinta,
      },
      update: {
        nomeExibicao: dados.nomeExibicao,
        tagline: dados.tagline ?? null,
        descricaoSeo: dados.descricaoSeo ?? null,
        corAcento: dados.corAcento,
        corAcentoClara: dados.corAcentoClara,
        corTinta: dados.corTinta,
        corPapel: dados.corPapel,
        fonteTitulo: dados.fonteTitulo,
        fonteTexto: dados.fonteTexto,
        heroEyebrow: dados.heroEyebrow ?? null,
        heroTitulo: dados.heroTitulo ?? null,
        heroSubtitulo: dados.heroSubtitulo ?? null,
        heroCtaTexto: dados.heroCtaTexto ?? null,
        heroCtaLink: dados.heroCtaLink ?? null,
        heroImagemId,
        fundoImagemId,
        fotoPastorId,
        fotoPastoraId,
        emailContato: dados.emailContato ?? null,
        telefoneContato: dados.telefoneContato ?? null,
        whatsapp: dados.whatsapp ?? null,
        instagram: dados.instagram ?? null,
        facebook: dados.facebook ?? null,
        youtube: dados.youtube ?? null,
        spotify: dados.spotify ?? null,
        pixChave: dados.pixChave ?? null,
        pixTitular: dados.pixTitular ?? null,
        pixDescricao: dados.pixDescricao ?? null,
        // `undefined` mantém o valor atual; só sobrescreve se o campo veio
        // preenchido. Sem isso, salvar o formulário com o campo em branco
        // apagaria os dados bancários por acidente.
        dadosBancariosCriptografados: bancariosCriptografados,
        pwaNome: dados.pwaNome ?? null,
        pwaNomeCurto: dados.pwaNomeCurto ?? null,
        pwaCorTema: dados.pwaCorTema ?? dados.corTinta,
      },
    });

    await auditar(ctx, {
      acao: "site.configurar",
      alvoTipo: "SiteConfig",
      // A auditoria registra QUAIS campos foram tocados, não os valores —
      // `mascarar()` já removeria pixChave e dados bancários de qualquer forma.
      detalhes: { camposAlterados: Object.keys(dados).length },
    });

    // O site inteiro depende destes valores: invalida tudo.
    revalidatePath("/", "layout");
    revalidatePath("/painel/site");

    return { ok: true, mensagem: "Configurações do site salvas." };
  } catch (erro) {
    return traduzir(erro, "salvarConfigSite");
  }
}

// -----------------------------------------------------------------------------
// Transmissão ao vivo
// -----------------------------------------------------------------------------

const schemaJanela = z.object({
  diaSemana,
  inicio: horario,
  fim: horario,
});

const schemaLive = z
  .object({
    modo: z.enum(["AUTO", "MANUAL", "AGENDA"]),
    youtubeChannelId: z.union([youtubeChannelId, z.literal("")]).optional(),
    youtubeVideoIdManual: z.union([youtubeVideoId, z.literal("")]).optional(),
    forcarAoVivo: z.coerce.boolean().default(false),
    janelas: z.array(schemaJanela).max(20).default([]),
    fusoHorario: z.string().max(60).default("America/Sao_Paulo"),
    mensagemAoVivo: textoLimpo(120).optional(),
    exibirNoSite: z.coerce.boolean().default(true),
    exibirNoApp: z.coerce.boolean().default(true),
  })
  .refine((d) => d.modo !== "AUTO" || (d.youtubeChannelId && d.youtubeChannelId.length > 0), {
    message: "Para detecção automática é necessário informar o ID do canal.",
    path: ["youtubeChannelId"],
  })
  // Janela invertida (fim antes do início) nunca casaria, e o operador ficaria
  // procurando por que a luzinha não acende.
  .refine((d) => d.janelas.every((j) => j.inicio < j.fim), {
    message: "O horário de término precisa ser depois do horário de início.",
    path: ["janelas"],
  });

export async function salvarConfigLive(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaLive.parse(dadosBrutos);

    // Fuso inválido quebraria o cálculo de janela silenciosamente.
    try {
      new Intl.DateTimeFormat("pt-BR", { timeZone: dados.fusoHorario });
    } catch {
      return { ok: false, mensagem: "Fuso horário inválido.", campos: { fusoHorario: ["Fuso horário inválido."] } };
    }

    const base = {
      modo: dados.modo,
      youtubeChannelId: dados.youtubeChannelId || null,
      youtubeVideoIdManual: dados.youtubeVideoIdManual || null,
      forcarAoVivo: dados.forcarAoVivo,
      janelas: dados.janelas,
      fusoHorario: dados.fusoHorario,
      mensagemAoVivo: dados.mensagemAoVivo ?? null,
      exibirNoSite: dados.exibirNoSite,
      exibirNoApp: dados.exibirNoApp,
      // Muda a configuração -> zera o cache e o backoff, para o efeito ser
      // imediato em vez de esperar o TTL vencer no meio do culto.
      ultimoCheckEm: null,
      falhasConsecutivas: 0,
    };

    await ctx.db.liveConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: { ...base, tenantId: ctx.tenant.id },
      update: base,
    });

    await auditar(ctx, {
      acao: "live.configurar",
      alvoTipo: "LiveConfig",
      detalhes: { modo: dados.modo, forcarAoVivo: dados.forcarAoVivo, janelas: dados.janelas.length },
    });

    revalidatePath("/", "layout");
    revalidatePath("/painel/ao-vivo");

    return { ok: true, mensagem: "Configuração da transmissão salva." };
  } catch (erro) {
    return traduzir(erro, "salvarConfigLive");
  }
}

/** Liga/desliga a transmissão manualmente — o botão de emergência do culto. */
export async function alternarAoVivo(ligar: boolean): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    await ctx.db.liveConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: { forcarAoVivo: ligar, modo: "MANUAL", tenantId: ctx.tenant.id },
      update: { forcarAoVivo: ligar, ultimoCheckEm: null },
    });

    await auditar(ctx, {
      acao: ligar ? "live.ligar" : "live.desligar",
      alvoTipo: "LiveConfig",
    });

    revalidatePath("/", "layout");
    revalidatePath("/painel/ao-vivo");

    return { ok: true, mensagem: ligar ? "Transmissão marcada como AO VIVO." : "Transmissão encerrada." };
  } catch (erro) {
    return traduzir(erro, "alternarAoVivo");
  }
}

function traduzir(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    return { ok: false, mensagem: "Confira os campos destacados.", campos };
  }
  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") return { ok: false, mensagem: "Sessão expirada." };
  if (nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão para esta ação." };
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Registro não encontrado." };
  }
  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
}

// -----------------------------------------------------------------------------
// CONTEÚDO DA HOME — ministérios e depoimentos (JSON validado).
// -----------------------------------------------------------------------------
export async function salvarConteudoHome(dadosBrutos: unknown): Promise<ResultadoAcao> {
  const acao = "salvarConteudoHome";
  try {
    const ctx = await exigirPermissao("site.editar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const { serializarMinisterios, serializarDepoimentos } = await import("@/lib/site/conteudo-home");

    const schema = z.object({
      ministerios: z.array(z.object({
        titulo: z.string().trim().max(80).optional().default(""),
        descricao: z.string().trim().max(400).optional().default(""),
        icone: z.string().trim().max(4).optional().default(""),
      })).max(6).default([]),
      depoimentos: z.array(z.object({
        texto: z.string().trim().max(500).optional().default(""),
        nome: z.string().trim().max(80).optional().default(""),
        papel: z.string().trim().max(80).optional().default(""),
      })).max(6).default([]),
    });
    const dados = schema.parse(dadosBrutos);

    await ctx.db.siteConfig.upsert({
      where: { tenantId: ctx.tenant.id },
      create: {
        tenantId: ctx.tenant.id,
        nomeExibicao: ctx.tenant.nome,
        ministeriosJson: serializarMinisterios(dados.ministerios),
        depoimentosJson: serializarDepoimentos(dados.depoimentos),
      },
      update: {
        ministeriosJson: serializarMinisterios(dados.ministerios),
        depoimentosJson: serializarDepoimentos(dados.depoimentos),
      },
    });

    await auditar(ctx, { acao: "site.conteudoHome", alvoTipo: "SiteConfig" });
    revalidatePath("/painel/site");
    revalidatePath("/");
    return { ok: true, mensagem: "Conteúdo da home salvo." };
  } catch (erro) {
    return traduzir(erro, acao);
  }
}
