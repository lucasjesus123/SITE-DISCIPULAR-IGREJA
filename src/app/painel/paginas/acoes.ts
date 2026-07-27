"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { id as idSchema, slug as slugSchema, textoLimpo } from "@/lib/validation/comum";
import { schemaPagina } from "@/lib/validation/blocos";

/**
 * Server Actions do editor de páginas do site.
 *
 * POR QUE O EDITOR É DE BLOCOS ESTRUTURADOS E NÃO DE HTML LIVRE
 *
 * O caminho fácil seria um editor rich-text guardando HTML. Isso entrega ao
 * cliente — e a qualquer conta de cliente comprometida — a capacidade de
 * injetar `<script>` no site da própria igreja: XSS armazenado com escopo
 * total, executando no domínio dela, com acesso aos cookies dali. E não
 * precisa nem de má-fé: basta um pastor copiar um trecho "bonito" de um site
 * infectado e colar no editor.
 *
 * "É só sanitizar o HTML" é a resposta que parece resolver e não resolve:
 * sanitizador é denylist disfarçada, a superfície (mathml, svg, atributos de
 * evento, `srcdoc`, mutação XSS no parser) muda a cada versão de navegador, e
 * quem mantém o sanitizador precisa acertar sempre — o atacante, uma vez só.
 *
 * Aqui o conteúdo é DADO ESTRUTURADO: uma lista de blocos com tipo conhecido e
 * campos de texto puro. O `schemaPagina` (Zod, união discriminada por `tipo`)
 * rejeita qualquer coisa fora do catálogo e descarta campos extras. Na
 * renderização, o React escapa tudo — e não existe um único
 * `dangerouslySetInnerHTML` no caminho. Não há como marcação do usuário virar
 * marcação da página, porque marcação do usuário nunca é armazenada.
 *
 * O preço é liberdade de formatação. Para um site de igreja, é troca óbvia: em
 * compensação o conteúdo fica consistente com o tema, responsivo de graça e
 * reaproveitável no aplicativo.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  /** Preenchido na criação, para o cliente navegar até o editor. */
  slug?: string;
}

/**
 * Slugs que pertencem ao sistema.
 *
 * Espelha a lista de `src/app/(site)/[slug]/page.tsx`. Uma página com um
 * desses slugs nunca seria exibida (a rota específica tem prioridade no
 * roteador), então o cliente criaria uma página fantasma e passaria a tarde
 * tentando entender por que ela não aparece. Pior: "painel" e "api" dariam a
 * impressão de que a área administrativa foi substituída.
 */
const SLUGS_RESERVADOS = new Set([
  "api", "painel", "plataforma", "app", "login", "sair", "logout",
  "manifest.webmanifest", "sw.js", "_next", "oracao", "visita", "batismo",
  "contato", "privacidade", "mensagens", "escolher-igreja", "recuperar-senha",
  "redefinir-senha", "sem-acesso",
]);

const MAX_PAGINAS = 60;

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

const schemaNovaPagina = z.object({
  titulo: textoLimpo(160, 2),
  slug: slugSchema,
});

export async function criarPagina(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaNovaPagina.parse(dadosBrutos);

    if (SLUGS_RESERVADOS.has(dados.slug)) {
      return {
        ok: false,
        mensagem: "Confira os campos destacados.",
        campos: { slug: ["Este endereço é usado pelo sistema. Escolha outro."] },
      };
    }

    const total = await ctx.db.sitePagina.count();
    if (total >= MAX_PAGINAS) {
      return { ok: false, mensagem: `Limite de ${MAX_PAGINAS} páginas atingido.` };
    }

    // A contagem passa pelo `ctx.db`: a unicidade conferida é dentro da igreja,
    // que é o que `@@unique([tenantId, slug])` exige. Duas igrejas podem ter
    // "/quem-somos" sem nenhum conflito.
    const existe = await ctx.db.sitePagina.count({ where: { slug: dados.slug } });
    if (existe > 0) {
      return {
        ok: false,
        mensagem: "Confira os campos destacados.",
        campos: { slug: ["Já existe uma página com esse endereço."] },
      };
    }

    const pagina = await ctx.db.sitePagina.create({
      data: {
        titulo: dados.titulo,
        slug: dados.slug,
        // Nasce vazia e NÃO PUBLICADA. Publicar é um ato separado, feito depois
        // de ver a página montada.
        blocos: [],
        publicada: false,
      },
      select: { id: true, slug: true },
    });

    await auditar(ctx, {
      acao: "sitePagina.criar",
      alvoTipo: "SitePagina",
      alvoId: pagina.id,
      detalhes: { slug: pagina.slug, titulo: dados.titulo },
    });

    revalidatePath("/painel/paginas");
    return { ok: true, mensagem: "Página criada.", slug: pagina.slug };
  } catch (erro) {
    return traduzirErro(erro, "criarPagina");
  }
}

// -----------------------------------------------------------------------------
// Salvar conteúdo
// -----------------------------------------------------------------------------

export async function salvarPagina(
  paginaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(paginaId);

    /**
     * Campos de texto opcionais vazios viram `undefined` ANTES do parse.
     *
     * Os blocos usam `textoLimpo(80).optional()`, que exige no mínimo 1
     * caractere quando presente. Um campo que o usuário abriu e deixou em
     * branco chegaria como `""` e reprovaria a página inteira com um erro
     * incompreensível ("String must contain at least 1 character(s)") apontando
     * para um bloco lá no meio. Limpar aqui é o que transforma "deixei em
     * branco" em "não preenchi".
     */
    const dados = schemaPagina.parse(limparVazios(dadosBrutos));

    const atual = await ctx.db.sitePagina.findFirst({
      where: { id },
      select: { id: true, slug: true, publicada: true },
    });
    if (!atual) return { ok: false, mensagem: "Página não encontrada." };

    /**
     * Publicar é uma permissão SEPARADA de editar.
     *
     * Quem tem `site.editar` monta a página; quem tem `site.publicar` decide
     * que ela vai ao ar. Sem esta checagem, o campo `publicada` do payload
     * bastaria para qualquer editor colocar conteúdo no site — a tela do
     * editor até esconde o botão, mas a Server Action aceita qualquer payload
     * de quem a chamar direto.
     */
    let publicada = atual.publicada;
    let avisoPublicacao = "";
    if (dados.publicada !== atual.publicada) {
      if (ctx.pode("site.publicar")) {
        publicada = dados.publicada;
      } else {
        avisoPublicacao = " O conteúdo foi salvo, mas mudar a publicação exige permissão de publicar.";
      }
    }

    await ctx.db.sitePagina.update({
      where: { id },
      data: {
        titulo: dados.titulo,
        seoTitulo: dados.seoTitulo ?? null,
        seoDescricao: dados.seoDescricao ?? null,
        // Já validado bloco a bloco pela união discriminada: o que vai para o
        // banco é exatamente o catálogo conhecido, sem campos extras.
        blocos: dados.blocos,
        publicada,
        mostrarMenu: dados.mostrarMenu,
        ordemMenu: dados.ordemMenu ?? null,
      },
    });

    await auditar(ctx, {
      acao: "sitePagina.salvar",
      alvoTipo: "SitePagina",
      alvoId: id,
      // Guardamos a ESTRUTURA, não o conteúdo: a auditoria não precisa virar
      // uma segunda cópia do site, e o que interessa investigar é "quem mexeu
      // e o que mudou de forma", não o texto de cada parágrafo.
      detalhes: {
        slug: atual.slug,
        blocos: dados.blocos.length,
        tipos: dados.blocos.map((b) => b.tipo),
        publicadaAnterior: atual.publicada,
        publicadaNova: publicada,
      },
    });

    revalidatePath(`/${atual.slug}`);
    revalidatePath("/", "layout");
    revalidatePath("/painel/paginas");
    revalidatePath(`/painel/paginas/${atual.slug}`);

    return { ok: true, mensagem: `Página salva.${avisoPublicacao}` };
  } catch (erro) {
    return traduzirErro(erro, "salvarPagina");
  }
}

// -----------------------------------------------------------------------------
// Excluir
// -----------------------------------------------------------------------------

export async function excluirPagina(paginaId: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("site.editar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(paginaId);

    const pagina = await ctx.db.sitePagina.findFirst({
      where: { id },
      select: { id: true, slug: true, titulo: true, sistema: true },
    });
    if (!pagina) return { ok: false, mensagem: "Página não encontrada." };

    // Páginas de sistema são as que o site espera encontrar (home, por
    // exemplo). Apagá-las deixaria o site com um buraco que o cliente não
    // conseguiria recriar sozinho.
    if (pagina.sistema) {
      return {
        ok: false,
        mensagem: "Esta página faz parte da estrutura do site e não pode ser excluída. Você pode despublicá-la.",
      };
    }

    await ctx.db.sitePagina.delete({ where: { id } });

    await auditar(ctx, {
      acao: "sitePagina.excluir",
      alvoTipo: "SitePagina",
      alvoId: id,
      detalhes: { slug: pagina.slug, titulo: pagina.titulo },
    });

    revalidatePath(`/${pagina.slug}`);
    revalidatePath("/", "layout");
    revalidatePath("/painel/paginas");

    return { ok: true, mensagem: "Página excluída." };
  } catch (erro) {
    return traduzirErro(erro, "excluirPagina");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/**
 * Remove strings vazias de um payload, recursivamente.
 *
 * A profundidade é limitada: um objeto profundamente aninhado, enviado de
 * propósito, não pode virar estouro de pilha no caminho de validação. Além do
 * limite devolvemos o valor como está — o `schemaPagina` recusa depois, que é
 * o comportamento correto para algo que já não tem forma de bloco.
 */
function limparVazios(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return valor;

  if (Array.isArray(valor)) {
    return valor.map((v) => limparVazios(v, profundidade + 1));
  }

  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim() === "") continue;
      saida[chave] = limparVazios(v, profundidade + 1);
    }
    return saida;
  }

  return valor;
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
    return { ok: false, mensagem: "Página não encontrada." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
}
