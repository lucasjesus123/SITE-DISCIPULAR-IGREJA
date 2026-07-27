"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { schemaTriagem } from "@/lib/validation/submissoes";
import { id as idSchema } from "@/lib/validation/comum";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import type { StatusPessoa } from "@prisma/client";

/**
 * Server Actions da triagem.
 *
 * SOBRE SEGURANÇA EM SERVER ACTIONS
 * Uma Server Action é um endpoint HTTP, mesmo parecendo uma chamada de função.
 * Qualquer pessoa pode invocá-la com os argumentos que quiser. Então cada uma
 * repete o ciclo completo:
 *
 *   1. exigirPermissao()  — autentica, resolve o tenant pelo host e autoriza
 *   2. rate limit         — teto de escrita por usuário
 *   3. validação Zod      — os argumentos são entrada não confiável
 *   4. operação via ctx.db — cliente já escopado ao tenant
 *   5. auditar()          — quem fez o quê
 *
 * O CSRF é coberto pelo próprio Next (Server Actions verificam Origin) somado
 * à checagem de origem do nosso middleware.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
}

/** Atualiza a triagem de uma submissão e, opcionalmente, cria a Pessoa. */
export async function processarSubmissao(
  submissaoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("submissoes.processar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(submissaoId);
    const dados = schemaTriagem.parse(dadosBrutos);

    // A leitura já vem escopada: se o ID for de outra igreja, não existe aqui.
    const submissao = await ctx.db.submissao.findFirst({
      where: { id },
      select: {
        id: true, tipo: true, nome: true, email: true, telefone: true,
        dados: true, status: true, pessoaGeradaId: true, consentimentoLgpd: true,
      },
    });

    if (!submissao) {
      return { ok: false, mensagem: "Registro não encontrado." };
    }

    let pessoaId: string | null = submissao.pessoaGeradaId;

    // ---- Vincular a uma pessoa existente
    if (dados.pessoaExistenteId) {
      const existente = await ctx.db.pessoa.findFirst({
        where: { id: dados.pessoaExistenteId, excluidoEm: null },
        select: { id: true },
      });
      if (!existente) {
        return { ok: false, mensagem: "A pessoa selecionada não foi encontrada." };
      }
      pessoaId = existente.id;

      await registrarInteracao(ctx, existente.id, submissao);
    }

    // ---- Criar pessoa a partir da submissão
    else if (dados.criarPessoa && !pessoaId) {
      /**
       * Sem consentimento LGPD registrado, não incorporamos o dado à base de
       * pessoas. A submissão fica guardada (é registro do que foi recebido),
       * mas não vira ficha de membro. Essa é a diferença entre "recebemos uma
       * mensagem" e "passamos a tratar os dados desta pessoa".
       */
      if (!submissao.consentimentoLgpd) {
        return {
          ok: false,
          mensagem:
            "Esta submissão não tem consentimento LGPD registrado. Não é possível criar o cadastro a partir dela.",
        };
      }

      const d = (submissao.dados ?? {}) as Record<string, unknown>;

      const pessoa = await ctx.db.pessoa.create({
        data: {
          nome: submissao.nome,
          email: submissao.email,
          telefone: submissao.telefone,
          status: (dados.statusPessoa ?? statusPadraoPorTipo(submissao.tipo)) as StatusPessoa,
          origem: "SITE",
          dataNascimento: textoParaData(d.dataNascimento),
          genero: enumOu(d.genero, ["MASCULINO", "FEMININO", "NAO_INFORMADO"], "NAO_INFORMADO"),
          estadoCivil: enumOu(
            d.estadoCivil,
            ["SOLTEIRO", "CASADO", "DIVORCIADO", "VIUVO", "UNIAO_ESTAVEL", "NAO_INFORMADO"],
            "NAO_INFORMADO",
          ),
          cep: texto(d.cep, 9),
          logradouro: texto(d.logradouro, 200),
          numero: texto(d.numero, 20),
          complemento: texto(d.complemento, 100),
          bairro: texto(d.bairro, 100),
          cidade: texto(d.cidade, 100),
          uf: texto(d.uf, 2),
          dataConversao: textoParaData(d.dataConversao),
          batizado: d.jaEBatizado === true || d.jaFoiBatizado === true,
          dataBatismo: textoParaData(d.dataBatismo),
          igrejaAnterior: texto(d.igrejaAnterior, 160),
          celulaId: dados.celulaId ?? null,
          // O consentimento é copiado da submissão, com a origem registrada:
          // é a prova de que a pessoa autorizou, e por qual caminho.
          consentimentoLgpd: true,
          consentimentoEm: new Date(),
          consentimentoOrigem: `submissao:${submissao.tipo}`,
        },
        select: { id: true },
      });

      pessoaId = pessoa.id;

      await auditar(ctx, {
        acao: "pessoa.criar",
        alvoTipo: "Pessoa",
        alvoId: pessoa.id,
        detalhes: { origem: "triagem", submissaoId: submissao.id, tipo: submissao.tipo },
      });
    }

    // ---- Atualiza a submissão
    await ctx.db.submissao.update({
      where: { id },
      data: {
        status: dados.status,
        notaInterna: dados.notaInterna ?? null,
        responsavelId: ctx.sessao.userId,
        processadoEm: dados.status === "CONCLUIDO" || dados.status === "ARQUIVADO" ? new Date() : null,
        pessoaGeradaId: pessoaId,
      },
    });

    await auditar(ctx, {
      acao: "submissao.processar",
      alvoTipo: "Submissao",
      alvoId: id,
      detalhes: {
        statusAnterior: submissao.status,
        statusNovo: dados.status,
        pessoaVinculada: pessoaId ?? undefined,
      },
    });

    revalidatePath("/painel/caixa-entrada");
    revalidatePath("/painel");

    return {
      ok: true,
      mensagem: pessoaId ? "Triagem concluída e cadastro vinculado." : "Triagem atualizada.",
    };
  } catch (erro) {
    return traduzirErro(erro, "processarSubmissao");
  }
}

/** Marca várias submissões como spam de uma vez. */
export async function marcarComoSpam(ids: string[]): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("submissoes.processar");

    // Teto no tamanho do lote: evita que uma requisição forjada tente
    // atualizar a tabela inteira num único comando.
    const listaIds = z.array(idSchema).min(1).max(100).parse(ids);

    const { count } = await ctx.db.submissao.updateMany({
      where: { id: { in: listaIds } },
      data: { status: "SPAM", responsavelId: ctx.sessao.userId, processadoEm: new Date() },
    });

    await auditar(ctx, {
      acao: "submissao.marcarSpam",
      alvoTipo: "Submissao",
      detalhes: { quantidade: count },
    });

    revalidatePath("/painel/caixa-entrada");
    return { ok: true, mensagem: `${count} ${count === 1 ? "item marcado" : "itens marcados"} como spam.` };
  } catch (erro) {
    return traduzirErro(erro, "marcarComoSpam");
  }
}

/** Busca pessoas para o seletor de "vincular a cadastro existente". */
export async function buscarPessoasParaVinculo(
  termo: string,
): Promise<{ id: string; nome: string; email: string | null; status: string }[]> {
  try {
    const ctx = await exigirPermissao("pessoas.ler");

    const t = z.string().trim().min(2).max(80).parse(termo);

    // `contains` do Prisma é parametrizado: não existe injeção de SQL aqui.
    // O limite de 10 resultados evita que a busca vire um dump da base.
    return ctx.db.pessoa.findMany({
      where: {
        excluidoEm: null,
        OR: [
          { nome: { contains: t, mode: "insensitive" } },
          { email: { contains: t, mode: "insensitive" } },
          { telefone: { contains: t.replace(/\D/g, "") } },
        ],
      },
      select: { id: true, nome: true, email: true, status: true },
      take: 10,
      orderBy: { nome: "asc" },
    });
  } catch {
    // Busca é auxiliar: falhar em silêncio é melhor que quebrar o formulário
    // de triagem que a secretária está no meio de preencher.
    return [];
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

async function registrarInteracao(
  ctx: Awaited<ReturnType<typeof exigirPermissao>>,
  pessoaId: string,
  submissao: { tipo: string; id: string },
): Promise<void> {
  await ctx.db.interacao
    .create({
      data: {
        pessoaId,
        tipo: "MENSAGEM",
        descricao: `Nova submissão do tipo ${submissao.tipo} vinculada a este cadastro.`,
        autorId: ctx.sessao.userId,
        autorNome: ctx.sessao.nome,
      },
    })
    .catch(() => {
      /* histórico é complementar; não bloqueia a triagem */
    });
}

function statusPadraoPorTipo(tipo: string): StatusPessoa {
  switch (tipo) {
    case "NOVO_MEMBRO":
      return "CONGREGANTE";
    case "BATISMO":
    case "QUERO_CELULA":
    case "INSCRICAO_CURSO":
      return "EM_ACOMPANHAMENTO";
    default:
      return "VISITANTE";
  }
}

function texto(valor: unknown, max: number): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim();
  return v ? v.slice(0, max) : null;
}

function textoParaData(valor: unknown): Date | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function enumOu<T extends string>(valor: unknown, permitidos: T[], padrao: T): T {
  return typeof valor === "string" && (permitidos as string[]).includes(valor)
    ? (valor as T)
    : padrao;
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) {
      (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    }
    return { ok: false, mensagem: "Dados inválidos.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  if (nome === "NaoAutorizadoError") return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Registro não encontrado." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
