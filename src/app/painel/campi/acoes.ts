"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { comTransacaoTenant } from "@/lib/db/tenant-client";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  id as idSchema,
  textoLimpo,
  telefoneOpcional,
  cep as cepSchema,
  uf as ufSchema,
} from "@/lib/validation/comum";

/**
 * Server Actions dos campi (sedes e congregações).
 *
 * A PERMISSÃO EXIGIDA É `site.editar`, E NÃO UMA PRÓPRIA.
 * Um campus é, na prática, conteúdo público: nome, endereço, telefone e mapa
 * aparecem no site e na página de contato. Quem pode editar o site pode editar
 * o endereço; a secretaria, que não mexe no site, também não muda a sede da
 * igreja. Criar uma permissão nova só para isto aumentaria a matriz de RBAC
 * sem separar poder nenhum de verdade.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  campusId?: string;
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

/**
 * URL DE MAPA — ESTA VALIDAÇÃO É CONTROLE DE SEGURANÇA, NÃO FORMATAÇÃO.
 *
 * O valor deste campo vira o `src` de um `<iframe>` dentro do site da igreja.
 * Um iframe com URL livre é uma das piores coisas que se pode permitir num
 * editor de conteúdo:
 *
 *   - O conteúdo enquadrado é escolhido por quem preenche o formulário, e é
 *     servido DENTRO do domínio da igreja. Um formulário de login falso ali
 *     dentro é indistinguível do site verdadeiro para o visitante — e a URL na
 *     barra de endereços, que é o que as pessoas conferem, continua a da
 *     igreja.
 *   - Um `javascript:` ou um `data:text/html` no `src` executa script no
 *     contexto da nossa origem: XSS armazenado com acesso a cookies.
 *   - Mesmo com um site externo inofensivo, o frame pode navegar a página de
 *     cima, abrir downloads, disparar redirecionamentos.
 *
 * Não dá para "sanitizar" isso: a única defesa que funciona é uma ALLOWLIST de
 * um único destino conhecido. Aceitamos exclusivamente
 * `https://www.google.com/maps/embed...`, que é o que o botão "Compartilhar →
 * Incorporar um mapa" do Google Maps gera. Qualquer outra coisa é recusada,
 * inclusive outros domínios do próprio Google.
 *
 * Por conveniência aceitamos que o usuário cole o `<iframe …>` inteiro: em vez
 * de ensiná-lo a extrair o `src` (e ele acabar colando qualquer coisa),
 * extraímos nós e revalidamos o que sobrou.
 */
const mapaEmbedUrl = z
  .string()
  .trim()
  .max(2000)
  .transform((bruto, ctx): string => {
    const url = extrairSrc(bruto);

    let u: URL;
    try {
      u = new URL(url);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cole o endereço de incorporação do Google Maps.",
      });
      return z.NEVER;
    }

    const valido =
      u.protocol === "https:" &&
      u.hostname === "www.google.com" &&
      u.pathname.startsWith("/maps/embed");

    if (!valido) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Só aceitamos o mapa incorporado do Google Maps (https://www.google.com/maps/embed...). " +
          "No Google Maps: Compartilhar → Incorporar um mapa → Copiar HTML.",
      });
      return z.NEVER;
    }

    // Devolvemos a URL RECONSTRUÍDA pelo parser, e não a string original: isso
    // normaliza escapes e elimina truques de encoding que passariam por uma
    // comparação textual ingênua.
    return u.toString();
  })
  .pipe(z.string().max(500, "Endereço do mapa longo demais."));

/** Aceita tanto a URL solta quanto o `<iframe src="…">` colado inteiro. */
function extrairSrc(bruto: string): string {
  if (!bruto.includes("<")) return bruto;
  const m = bruto.match(/src\s*=\s*["']([^"']+)["']/i);
  return m?.[1] ?? bruto;
}

const schemaCampus = z.object({
  nome: textoLimpo(120, 2),
  descricao: opcional(textoLimpo(255)),

  cep: opcional(cepSchema),
  logradouro: opcional(textoLimpo(200)),
  numero: opcional(textoLimpo(20)),
  complemento: opcional(textoLimpo(100)),
  bairro: opcional(textoLimpo(100)),
  cidade: opcional(textoLimpo(100)),
  uf: opcional(ufSchema),

  mapaEmbedUrl: opcional(mapaEmbedUrl),
  telefone: telefoneOpcional,

  principal: booleano,
  ativo: booleano,
  ordem: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().min(0).max(999).optional(),
  ),
});

type DadosCampus = z.infer<typeof schemaCampus>;

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

export async function criarCampus(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaCampus.parse(dadosBrutos);

    // Uma igreja tem sedes e congregações, não centenas de endereços. O teto
    // existe para que a página de contato não vire uma lista infinita.
    const existentes = await ctx.db.campus.count();
    if (existentes >= 50) {
      return { ok: false, mensagem: "Limite de 50 campi atingido. Desative os que não estão em uso." };
    }

    // Se nasce como principal, os outros deixam de ser — na mesma transação,
    // senão um erro no meio deixaria a igreja com dois endereços "principais"
    // (ou nenhum), e o site escolheria um deles sem critério.
    const campusId = await comTransacaoTenant(ctx.tenant.id, async (tx) => {
      if (dados.principal) {
        await tx.campus.updateMany({ where: { principal: true }, data: { principal: false } });
      }
      const criado = await tx.campus.create({
        data: camposComuns(dados),
        select: { id: true },
      });
      return criado.id;
    });

    await auditar(ctx, {
      acao: "campus.criar",
      alvoTipo: "Campus",
      alvoId: campusId,
      detalhes: {
        nome: dados.nome,
        principal: dados.principal,
        comMapa: Boolean(dados.mapaEmbedUrl),
      },
    });

    revalidarCampi();
    return { ok: true, mensagem: "Campus criado.", campusId };
  } catch (erro) {
    return traduzirErro(erro, "criarCampus");
  }
}

// -----------------------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------------------

export async function atualizarCampus(
  campusId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(campusId);
    const dados = schemaCampus.parse(dadosBrutos);

    const atual = await ctx.db.campus.findFirst({
      where: { id },
      select: { id: true, nome: true, principal: true, mapaEmbedUrl: true },
    });
    if (!atual) return { ok: false, mensagem: "Campus não encontrado." };

    await comTransacaoTenant(ctx.tenant.id, async (tx) => {
      if (dados.principal) {
        // `id: { not: id }` para não desmarcar justo aquele que estamos
        // promovendo — a ordem das duas escritas dentro da transação não
        // deveria importar, e desta forma não importa mesmo.
        await tx.campus.updateMany({
          where: { principal: true, id: { not: id } },
          data: { principal: false },
        });
      }
      await tx.campus.update({ where: { id }, data: camposComuns(dados) });
    });

    await auditar(ctx, {
      acao: "campus.atualizar",
      alvoTipo: "Campus",
      alvoId: id,
      detalhes: {
        principalAnterior: atual.principal,
        principalNovo: dados.principal,
        mapaAlterado: (atual.mapaEmbedUrl ?? null) !== (dados.mapaEmbedUrl ?? null),
      },
    });

    revalidarCampi();
    return { ok: true, mensagem: "Campus salvo.", campusId: id };
  } catch (erro) {
    return traduzirErro(erro, "atualizarCampus");
  }
}

// -----------------------------------------------------------------------------
// Excluir
// -----------------------------------------------------------------------------

/**
 * Exclui o campus.
 *
 * As relações são `onDelete: SetNull`, então nada é destruído em cascata: as
 * pessoas, células, itens de agenda e batismos ligados a ele simplesmente
 * ficam sem campus. Ainda assim avisamos quantos vínculos serão desfeitos —
 * apagar a "Sede" e descobrir depois que 800 pessoas ficaram sem campus é o
 * tipo de coisa que se percebe tarde demais.
 */
export async function excluirCampus(campusId: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(campusId);

    const campus = await ctx.db.campus.findFirst({
      where: { id },
      select: { id: true, nome: true, principal: true },
    });
    if (!campus) return { ok: false, mensagem: "Campus não encontrado." };

    const [pessoas, celulas, agenda] = await Promise.all([
      ctx.db.pessoa.count({ where: { campusId: id, excluidoEm: null } }),
      ctx.db.celula.count({ where: { campusId: id } }),
      ctx.db.agendaItem.count({ where: { campusId: id } }),
    ]);

    await ctx.db.campus.delete({ where: { id } });

    await auditar(ctx, {
      acao: "campus.excluir",
      alvoTipo: "Campus",
      alvoId: id,
      detalhes: { nome: campus.nome, pessoasDesvinculadas: pessoas, celulas, agenda },
    });

    revalidarCampi();

    const desvinculados = pessoas + celulas + agenda;
    return {
      ok: true,
      mensagem:
        desvinculados > 0
          ? `Campus removido. ${desvinculados} ${desvinculados === 1 ? "registro ficou" : "registros ficaram"} sem campus definido.`
          : "Campus removido.",
    };
  } catch (erro) {
    return traduzirErro(erro, "excluirCampus");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function camposComuns(dados: DadosCampus) {
  return {
    nome: dados.nome,
    descricao: dados.descricao ?? null,
    cep: dados.cep ?? null,
    logradouro: dados.logradouro ?? null,
    numero: dados.numero ?? null,
    complemento: dados.complemento ?? null,
    bairro: dados.bairro ?? null,
    cidade: dados.cidade ?? null,
    uf: dados.uf ?? null,
    // Já validado contra a allowlist do Google Maps. Campo em branco apaga o
    // mapa, que é o comportamento esperado de "removi o endereço do mapa".
    mapaEmbedUrl: dados.mapaEmbedUrl ?? null,
    telefone: dados.telefone ?? null,
    principal: dados.principal,
    ativo: dados.ativo,
    ordem: dados.ordem ?? 0,
  };
}

function revalidarCampi(): void {
  // Endereços aparecem no rodapé, na página de contato e no bloco "campi".
  revalidatePath("/", "layout");
  revalidatePath("/painel/campi");
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
    return { ok: false, mensagem: "Campus não encontrado." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
