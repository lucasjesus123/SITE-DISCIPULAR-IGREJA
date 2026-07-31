"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { reaisParaCentavos } from "@/lib/financeiro/dinheiro";
import {
  ErroFinanceiro,
  criarLancamento,
  estornarLancamento,
  transferir,
} from "@/lib/financeiro/ledger";
import type { LinhaPartida } from "@/lib/financeiro/partidas";

/**
 * Ações do financeiro. Toda mutação:
 *  - re-autoriza no servidor (exigirPermissao) — não confia no front;
 *  - passa pelo motor do ledger (equilíbrio, idempotência, período fechado);
 *  - registra auditoria (quem, o quê, valor);
 *  - é atômica (o motor usa transação com escopo de tenant).
 */

export type ResultadoFinanceiro = { ok: boolean; mensagem: string } | null;

async function ipAtual(): Promise<string | null> {
  const h = await headers();
  return h.get("x-discipular-ip");
}

function dataDe(valor: string): Date {
  // Input <type=date> chega como "YYYY-MM-DD" → meia-noite UTC (só data).
  const d = new Date(`${valor}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new ErroFinanceiro("Data inválida.");
  return d;
}

const schemaMovimento = z.object({
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  campusId: z.string().min(1),
  contaFisicaId: z.string().min(1),
  categoriaId: z.string().min(1),
  valor: z.string().min(1),
  historico: z.string().trim().min(2).max(300),
  dataCaixa: z.string().min(1),
  chave: z.string().min(8).max(80),
  membroId: z.string().optional(),
  contribuicaoAnonima: z.string().optional(),
});

export async function lancarMovimento(
  _estado: ResultadoFinanceiro,
  formData: FormData,
): Promise<ResultadoFinanceiro> {
  try {
    const ctx = await exigirPermissao("financeiro.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };

    const dados = schemaMovimento.parse(Object.fromEntries(formData));
    const centavos = reaisParaCentavos(dados.valor);
    if (centavos <= 0n) return { ok: false, mensagem: "O valor precisa ser maior que zero." };

    const data = dataDe(dados.dataCaixa);

    // ENTRADA: dinheiro entra na conta física (débito) vindo de uma receita (crédito).
    // SAÍDA: uma despesa (débito) sai da conta física (crédito).
    const partidas: LinhaPartida[] =
      dados.tipo === "ENTRADA"
        ? [
            { contaId: dados.contaFisicaId, debitoCentavos: centavos, creditoCentavos: 0n },
            { contaId: dados.categoriaId, debitoCentavos: 0n, creditoCentavos: centavos },
          ]
        : [
            { contaId: dados.categoriaId, debitoCentavos: centavos, creditoCentavos: 0n },
            { contaId: dados.contaFisicaId, debitoCentavos: 0n, creditoCentavos: centavos },
          ];

    const lanc = await criarLancamento(ctx.tenant.id, {
      campusId: dados.campusId,
      dataCompetencia: data,
      dataCaixa: data,
      historico: dados.historico,
      partidas,
      chaveIdempotencia: dados.chave,
      criadoPorId: ctx.sessao.userId,
      membroId: dados.membroId || null,
      contribuicaoAnonima: dados.contribuicaoAnonima === "on",
      ip: await ipAtual(),
    });

    await auditar(ctx, {
      acao: dados.tipo === "ENTRADA" ? "financeiro.entrada" : "financeiro.saida",
      alvoTipo: "LancamentoFinanceiro",
      alvoId: lanc.id,
      detalhes: { valorCentavos: centavos.toString(), historico: dados.historico },
    });

    revalidatePath("/painel/financeiro");
    return { ok: true, mensagem: "Lançamento registrado." };
  } catch (erro) {
    return tratar(erro, "lancarMovimento");
  }
}

const schemaTransferencia = z.object({
  campusId: z.string().min(1),
  contaOrigemId: z.string().min(1),
  contaDestinoId: z.string().min(1),
  valor: z.string().min(1),
  historico: z.string().trim().min(2).max(300),
  dataCaixa: z.string().min(1),
  chave: z.string().min(8).max(80),
});

export async function transferirContas(
  _estado: ResultadoFinanceiro,
  formData: FormData,
): Promise<ResultadoFinanceiro> {
  try {
    const ctx = await exigirPermissao("financeiro.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };

    const dados = schemaTransferencia.parse(Object.fromEntries(formData));
    if (dados.contaOrigemId === dados.contaDestinoId) {
      return { ok: false, mensagem: "Origem e destino precisam ser contas diferentes." };
    }
    const centavos = reaisParaCentavos(dados.valor);
    const data = dataDe(dados.dataCaixa);

    const lanc = await transferir(ctx.tenant.id, {
      campusId: dados.campusId,
      contaOrigemId: dados.contaOrigemId,
      contaDestinoId: dados.contaDestinoId,
      valorCentavos: centavos,
      dataCompetencia: data,
      dataCaixa: data,
      historico: dados.historico,
      chaveIdempotencia: dados.chave,
      criadoPorId: ctx.sessao.userId,
      ip: await ipAtual(),
    });

    await auditar(ctx, {
      acao: "financeiro.transferencia",
      alvoTipo: "LancamentoFinanceiro",
      alvoId: lanc.id,
      detalhes: { valorCentavos: centavos.toString() },
    });

    revalidatePath("/painel/financeiro");
    return { ok: true, mensagem: "Transferência registrada." };
  } catch (erro) {
    return tratar(erro, "transferirContas");
  }
}

const schemaEstorno = z.object({
  lancamentoId: z.string().min(1),
  justificativa: z.string().trim().min(3).max(300),
});

export async function estornarLancamentoAcao(
  _estado: ResultadoFinanceiro,
  formData: FormData,
): Promise<ResultadoFinanceiro> {
  try {
    const ctx = await exigirPermissao("financeiro.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };

    const dados = schemaEstorno.parse(Object.fromEntries(formData));

    const estorno = await estornarLancamento(ctx.tenant.id, {
      lancamentoId: dados.lancamentoId,
      justificativa: dados.justificativa,
      criadoPorId: ctx.sessao.userId,
      ip: await ipAtual(),
    });

    await auditar(ctx, {
      acao: "financeiro.estorno",
      alvoTipo: "LancamentoFinanceiro",
      alvoId: estorno.id,
      detalhes: { estornoDe: dados.lancamentoId, justificativa: dados.justificativa },
    });

    revalidatePath("/painel/financeiro");
    return { ok: true, mensagem: "Lançamento estornado." };
  } catch (erro) {
    return tratar(erro, "estornarLancamento");
  }
}

function tratar(erro: unknown, acao: string): ResultadoFinanceiro {
  if (erro instanceof ErroFinanceiro) return { ok: false, mensagem: erro.message };
  if (erro instanceof z.ZodError) return { ok: false, mensagem: "Preencha os campos corretamente." };
  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") {
    return { ok: false, mensagem: "Você não tem permissão para esta operação." };
  }
  const ref = logger.erro("Falha em ação financeira", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
