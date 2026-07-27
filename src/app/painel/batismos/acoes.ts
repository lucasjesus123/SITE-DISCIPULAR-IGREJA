"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { comTransacaoTenant } from "@/lib/db/tenant-client";
import {
  id as idSchema,
  idOpcional,
  dataISO,
  horario as horarioSchema,
  textoLimpo,
  textoLongo,
  telefoneOpcional,
} from "@/lib/validation/comum";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import type { StatusBatismo } from "@prisma/client";

/**
 * Server Actions da fila de batismos.
 *
 * Este módulo tem duas regras que não são de software, são da vida real:
 *
 *   1. MENOR DE IDADE NÃO É BATIZADO SEM AUTORIZAÇÃO DO RESPONSÁVEL.
 *      Está codificado como bloqueio, não como aviso — um aviso é clicável.
 *
 *   2. "REALIZADO" NÃO É SÓ UM STATUS.
 *      Quando o batismo acontece, a ficha da pessoa passa a dizer que ela é
 *      batizada. As duas escritas andam juntas, em transação: um batismo
 *      marcado como realizado com a ficha dizendo "ainda não" é o tipo de
 *      inconsistência que ninguém percebe até alguém montar a lista de membros.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
}

function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );
}

/**
 * Transições permitidas.
 *
 * Sem uma máquina de estados explícita, a Server Action aceitaria qualquer
 * `status` do enum — inclusive voltar de REALIZADO para SOLICITADO, o que
 * deixaria a `Pessoa` marcada como batizada e a solicitação dizendo que não.
 * REALIZADO é terminal de propósito: batismo não se desfaz.
 */
const TRANSICOES: Record<StatusBatismo, readonly StatusBatismo[]> = {
  SOLICITADO: ["EM_PREPARO", "APROVADO", "AGENDADO", "RECUSADO", "CANCELADO"],
  EM_PREPARO: ["SOLICITADO", "APROVADO", "AGENDADO", "RECUSADO", "CANCELADO"],
  APROVADO: ["EM_PREPARO", "AGENDADO", "REALIZADO", "RECUSADO", "CANCELADO"],
  AGENDADO: ["APROVADO", "REALIZADO", "CANCELADO"],
  REALIZADO: [],
  RECUSADO: ["SOLICITADO"],
  CANCELADO: ["SOLICITADO"],
};

/** Status a partir dos quais a pessoa é considerada apta ao batismo. */
const STATUS_QUE_EXIGEM_AUTORIZACAO: readonly StatusBatismo[] = [
  "APROVADO",
  "AGENDADO",
  "REALIZADO",
];

// -----------------------------------------------------------------------------
// Mudança simples de status
// -----------------------------------------------------------------------------

/**
 * Muda o status da solicitação.
 *
 * AGENDADO, REALIZADO e RECUSADO NÃO passam por aqui: cada um exige dado
 * adicional (data, atualização da ficha, motivo) e tem ação própria. Se este
 * schema aceitasse os três, alguém marcaria "realizado" sem que a ficha da
 * pessoa fosse atualizada — que é justamente o erro que queremos impossibilitar.
 */
const schemaStatus = z.object({
  status: z.enum(["SOLICITADO", "EM_PREPARO", "APROVADO", "CANCELADO"]),
  turmaPreparatoria: opcional(textoLimpo(120)),
  observacoes: opcional(textoLongo(1000)),
});

export async function mudarStatusBatismo(
  batismoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("batismos.aprovar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(batismoId);
    const dados = schemaStatus.parse(dadosBrutos);

    const atual = await carregar(ctx, id);
    if (!atual) return { ok: false, mensagem: "Solicitação não encontrada." };

    const transicao = validarTransicao(atual.status, dados.status);
    if (transicao) return transicao;

    const bloqueio = bloqueioPorMenorIdade(atual, dados.status);
    if (bloqueio) return bloqueio;

    await ctx.db.solicitacaoBatismo.update({
      where: { id },
      data: {
        status: dados.status,
        turmaPreparatoria: dados.turmaPreparatoria ?? undefined,
        observacoes: dados.observacoes ?? undefined,
      },
    });

    await auditar(ctx, {
      acao: "batismo.status",
      alvoTipo: "SolicitacaoBatismo",
      alvoId: id,
      detalhes: { statusAnterior: atual.status, statusNovo: dados.status },
    });

    revalidar(id);
    return { ok: true, mensagem: "Situação atualizada." };
  } catch (erro) {
    return traduzirErro(erro, "mudarStatusBatismo");
  }
}

// -----------------------------------------------------------------------------
// Agendamento
// -----------------------------------------------------------------------------

const schemaAgendamento = z.object({
  data: dataISO,
  horario: opcional(horarioSchema),
  campusId: idOpcional,
  turmaPreparatoria: opcional(textoLimpo(120)),
  observacoes: opcional(textoLongo(1000)),
});

export async function agendarBatismo(
  batismoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("batismos.aprovar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(batismoId);
    const dados = schemaAgendamento.parse(dadosBrutos);

    const atual = await carregar(ctx, id);
    if (!atual) return { ok: false, mensagem: "Solicitação não encontrada." };

    const transicao = validarTransicao(atual.status, "AGENDADO");
    if (transicao) return transicao;

    const bloqueio = bloqueioPorMenorIdade(atual, "AGENDADO");
    if (bloqueio) return bloqueio;

    const quando = montarDataHora(dados.data, dados.horario);
    if (quando.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        mensagem: "Dados inválidos.",
        campos: { data: ["A data do agendamento está no passado. Para registrar um batismo que já aconteceu, use 'marcar como realizado'."] },
      };
    }

    if (dados.campusId) {
      const campus = await ctx.db.campus.findFirst({
        where: { id: dados.campusId },
        select: { id: true },
      });
      if (!campus) {
        return { ok: false, mensagem: "Dados inválidos.", campos: { campusId: ["Campus não encontrado."] } };
      }
    }

    await ctx.db.solicitacaoBatismo.update({
      where: { id },
      data: {
        status: "AGENDADO",
        dataBatismo: quando,
        campusId: dados.campusId ?? null,
        turmaPreparatoria: dados.turmaPreparatoria ?? undefined,
        observacoes: dados.observacoes ?? undefined,
      },
    });

    await auditar(ctx, {
      acao: "batismo.agendar",
      alvoTipo: "SolicitacaoBatismo",
      alvoId: id,
      detalhes: { statusAnterior: atual.status, data: quando.toISOString() },
    });

    revalidar(id);
    return { ok: true, mensagem: "Batismo agendado." };
  } catch (erro) {
    return traduzirErro(erro, "agendarBatismo");
  }
}

// -----------------------------------------------------------------------------
// Recusa
// -----------------------------------------------------------------------------

const schemaRecusa = z.object({
  // Motivo obrigatório: uma recusa sem justificativa registrada vira, meses
  // depois, "ninguém sabe por que negaram". Quem recusa assume o registro.
  motivoRecusa: textoLimpo(500, 5),
});

export async function recusarBatismo(
  batismoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("batismos.aprovar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(batismoId);
    const dados = schemaRecusa.parse(dadosBrutos);

    const atual = await carregar(ctx, id);
    if (!atual) return { ok: false, mensagem: "Solicitação não encontrada." };

    const transicao = validarTransicao(atual.status, "RECUSADO");
    if (transicao) return transicao;

    await ctx.db.solicitacaoBatismo.update({
      where: { id },
      data: { status: "RECUSADO", motivoRecusa: dados.motivoRecusa, dataBatismo: null },
    });

    await auditar(ctx, {
      acao: "batismo.recusar",
      alvoTipo: "SolicitacaoBatismo",
      alvoId: id,
      // O motivo fica no registro, não no log: é conversa pastoral, não
      // metadado de segurança.
      detalhes: { statusAnterior: atual.status },
    });

    revalidar(id);
    return { ok: true, mensagem: "Solicitação recusada." };
  } catch (erro) {
    return traduzirErro(erro, "recusarBatismo");
  }
}

// -----------------------------------------------------------------------------
// Realização
// -----------------------------------------------------------------------------

const schemaRealizado = z.object({
  data: dataISO,
  horario: opcional(horarioSchema),
});

/**
 * Marca o batismo como realizado E atualiza a ficha da pessoa.
 *
 * As duas escritas rodam na mesma transação. Se a segunda falhar, a primeira
 * volta atrás: é melhor o operador clicar de novo do que a igreja ficar com uma
 * solicitação REALIZADA e um membro marcado como não batizado — divergência que
 * só apareceria na hora de emitir a lista de membros, meses depois.
 */
export async function marcarRealizado(
  batismoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("batismos.aprovar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(batismoId);
    const dados = schemaRealizado.parse(dadosBrutos);

    const atual = await carregar(ctx, id);
    if (!atual) return { ok: false, mensagem: "Solicitação não encontrada." };

    const transicao = validarTransicao(atual.status, "REALIZADO");
    if (transicao) return transicao;

    const bloqueio = bloqueioPorMenorIdade(atual, "REALIZADO");
    if (bloqueio) return bloqueio;

    const quando = montarDataHora(dados.data, dados.horario);
    if (quando.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        mensagem: "Dados inválidos.",
        campos: { data: ["Um batismo só é marcado como realizado depois de acontecer."] },
      };
    }

    await comTransacaoTenant(ctx.tenant.id, async (tx) => {
      await tx.solicitacaoBatismo.update({
        where: { id },
        data: { status: "REALIZADO", dataBatismo: quando },
      });

      if (atual.pessoaId) {
        await tx.pessoa.update({
          where: { id: atual.pessoaId },
          data: {
            batizado: true,
            // `Pessoa.dataBatismo` é @db.Date: guardamos só o dia, à
            // meia-noite UTC, para não introduzir hora onde a coluna não tem.
            dataBatismo: new Date(`${dados.data}T00:00:00Z`),
          },
        });
      }
    });

    await auditar(ctx, {
      acao: "batismo.realizado",
      alvoTipo: "SolicitacaoBatismo",
      alvoId: id,
      detalhes: {
        statusAnterior: atual.status,
        data: quando.toISOString(),
        fichaAtualizada: Boolean(atual.pessoaId),
      },
    });

    revalidar(id);
    if (atual.pessoaId) revalidatePath(`/painel/pessoas/${atual.pessoaId}`);
    revalidatePath("/painel/pessoas");

    return {
      ok: true,
      mensagem: atual.pessoaId
        ? "Batismo registrado e ficha da pessoa atualizada."
        : "Batismo registrado. Esta solicitação não tem cadastro vinculado — crie a ficha pela caixa de entrada para o histórico ficar completo.",
    };
  } catch (erro) {
    return traduzirErro(erro, "marcarRealizado");
  }
}

// -----------------------------------------------------------------------------
// Autorização do responsável
// -----------------------------------------------------------------------------

const schemaResponsavel = z.object({
  responsavelNome: textoLimpo(160, 3),
  responsavelTelefone: telefoneOpcional,
  /** Confirmação explícita de quem está registrando. */
  autorizacaoRecebida: z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === "on" || v === "true" || v === "1")
    .refine((v) => v === true, "Confirme que a autorização foi recebida."),
});

/**
 * Registra a autorização do responsável por um menor.
 *
 * Sem esta ação, uma solicitação de menor sem autorização ficaria travada para
 * sempre — o bloqueio de aprovação não teria saída legítima. Quem registra é
 * identificado na auditoria: é a pessoa que afirma ter recebido a autorização.
 */
export async function registrarAutorizacaoResponsavel(
  batismoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("batismos.aprovar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(batismoId);
    const dados = schemaResponsavel.parse(dadosBrutos);

    const atual = await carregar(ctx, id);
    if (!atual) return { ok: false, mensagem: "Solicitação não encontrada." };

    await ctx.db.solicitacaoBatismo.update({
      where: { id },
      data: {
        menorIdade: true,
        responsavelNome: dados.responsavelNome,
        responsavelTelefone: dados.responsavelTelefone ?? null,
        autorizacaoResponsavel: true,
      },
    });

    await auditar(ctx, {
      acao: "batismo.autorizacaoResponsavel",
      alvoTipo: "SolicitacaoBatismo",
      alvoId: id,
      detalhes: { registradoPor: ctx.sessao.userId },
    });

    revalidar(id);
    return { ok: true, mensagem: "Autorização do responsável registrada." };
  } catch (erro) {
    return traduzirErro(erro, "registrarAutorizacaoResponsavel");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

interface BatismoAtual {
  id: string;
  status: StatusBatismo;
  pessoaId: string | null;
  menorIdade: boolean;
  autorizacaoResponsavel: boolean;
  dataNascimento: Date | null;
}

/** Leitura escopada ao tenant: um ID de outra igreja não existe aqui. */
async function carregar(ctx: ContextoAutorizado, id: string): Promise<BatismoAtual | null> {
  return ctx.db.solicitacaoBatismo.findFirst({
    where: { id },
    select: {
      id: true,
      status: true,
      pessoaId: true,
      menorIdade: true,
      autorizacaoResponsavel: true,
      dataNascimento: true,
    },
  });
}

function validarTransicao(atual: StatusBatismo, novo: StatusBatismo): ResultadoAcao | null {
  if (atual === novo) return { ok: false, mensagem: "A solicitação já está nesta situação." };
  if (!TRANSICOES[atual].includes(novo)) {
    return {
      ok: false,
      mensagem:
        atual === "REALIZADO"
          ? "Um batismo já realizado não muda de situação."
          : "Esta mudança de situação não é permitida a partir do estado atual.",
    };
  }
  return null;
}

/**
 * Bloqueio de menor sem autorização.
 *
 * `menorIdade` vem de um formulário PÚBLICO — é autodeclarado e pode estar
 * errado por engano ou por conveniência. Por isso não confiamos só nele: se a
 * data de nascimento informada indica menos de 18 anos, tratamos como menor
 * mesmo que a caixinha diga que não. Na dúvida, o sistema exige a autorização.
 */
function bloqueioPorMenorIdade(atual: BatismoAtual, novoStatus: StatusBatismo): ResultadoAcao | null {
  if (!STATUS_QUE_EXIGEM_AUTORIZACAO.includes(novoStatus)) return null;

  const menorPelaData = ehMenorDeIdade(atual.dataNascimento);
  const menor = atual.menorIdade || menorPelaData;

  if (menor && !atual.autorizacaoResponsavel) {
    return {
      ok: false,
      mensagem:
        "Esta solicitação é de menor de idade e ainda não tem a autorização do responsável registrada. Registre a autorização antes de aprovar ou agendar.",
    };
  }

  return null;
}

// Não exportado: um arquivo "use server" só pode exportar funções assíncronas
// (tudo que ele exporta vira endpoint). As páginas calculam a idade por conta.
function ehMenorDeIdade(nascimento: Date | null): boolean {
  if (!nascimento) return false;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const mes = hoje.getUTCMonth() - nascimento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < nascimento.getUTCDate())) idade -= 1;
  return idade >= 0 && idade < 18;
}

/**
 * Monta o instante do batismo.
 *
 * Guardamos (e exibimos) em UTC, tratando o que o operador digitou como hora
 * de parede. Assim "domingo, 18:00" continua sendo 18:00 para todo mundo,
 * independente do fuso do servidor ou do navegador de quem consulta. Converter
 * para o fuso da igreja exigiria conhecer esse fuso — hoje ele só existe na
 * configuração do "ao vivo", e um servidor que mudasse de TZ deslocaria
 * batismos já agendados.
 */
function montarDataHora(data: string, horario?: string): Date {
  return new Date(`${data}T${horario ?? "00:00"}:00Z`);
}

function revalidar(id: string): void {
  revalidatePath("/painel/batismos");
  revalidatePath(`/painel/batismos/${id}`);
  revalidatePath("/painel");
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) {
      (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    }
    return { ok: false, mensagem: "Confira os campos destacados.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") {
    return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  }
  if (nome === "NaoAutorizadoError") {
    return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  }
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Solicitação não encontrada." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
