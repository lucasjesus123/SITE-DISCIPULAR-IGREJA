"use server";

import { revalidatePath } from "next/cache";
import type { TipoRegistroSecretaria } from "@prisma/client";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import { formularioPorSlug, ehColuna } from "@/lib/secretaria/tipos";

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
}

/** "YYYY-MM-DD" → Date em meia-noite UTC (coerente com @db.Date). Vazio = null. */
function parseData(v: string | undefined): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Cria um registro da Secretaria (visitante, batismo, apresentação…).
 *
 * Os campos vêm da definição em `@/lib/secretaria/tipos` — colunas comuns vão
 * para colunas reais; o resto entra em `extra`. Registra QUEM cadastrou.
 */
export async function criarRegistroSecretaria(
  slug: string,
  valores: Record<string, string>,
): Promise<ResultadoAcao> {
  try {
    const def = formularioPorSlug(slug);
    if (!def) return { ok: false, mensagem: "Formulário desconhecido." };

    const ctx = await exigirPermissao("secretaria.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas ações seguidas. Aguarde um instante." };

    const colunas: Record<string, unknown> = {};
    const extra: Record<string, unknown> = {};

    for (const campo of def.campos) {
      const raw = (valores[campo.chave] ?? "").trim();
      let valor: unknown;
      if (campo.tipo === "data") valor = parseData(raw);
      else if (campo.tipo === "sim_nao") valor = raw === "sim" ? true : raw === "nao" ? false : null;
      else if (campo.tipo === "numero") {
        const n = Number.parseInt(raw, 10);
        valor = Number.isFinite(n) && n >= 0 ? n : null;
      } else valor = raw.length ? raw.slice(0, campo.tipo === "textarea" ? 2000 : 300) : null;

      if (ehColuna(campo.chave)) colunas[campo.chave] = valor;
      else if (valor !== null && valor !== "") extra[campo.chave] = valor;
    }

    const nome = String(colunas.nome ?? "").trim();
    if (!nome) return { ok: false, mensagem: "Informe o nome." };

    const registro = await ctx.db.registroSecretaria.create({
      data: {
        tenantId: ctx.tenant.id,
        tipo: def.tipo as TipoRegistroSecretaria,
        nome: nome.slice(0, 160),
        contato: (colunas.contato as string | null) ?? null,
        dataNascimento: (colunas.dataNascimento as Date | null) ?? null,
        comoConheceu: (colunas.comoConheceu as string | null) ?? null,
        endereco: (colunas.endereco as string | null) ?? null,
        dataInscricao: (colunas.dataInscricao as Date | null) ?? null,
        dataReferencia: (colunas.dataReferencia as Date | null) ?? null,
        observacao: (colunas.observacao as string | null) ?? null,
        extra: Object.keys(extra).length ? extra : undefined,
        criadoPorId: ctx.sessao.userId,
        criadoPorNome: ctx.sessao.nome,
      },
      select: { id: true },
    });

    await auditar(ctx, {
      acao: "secretaria.cadastrar",
      alvoTipo: "RegistroSecretaria",
      alvoId: registro.id,
      detalhes: { tipo: def.tipo },
    });

    revalidatePath(`/painel/secretaria/${slug}`);
    return { ok: true, mensagem: `${def.singular} cadastrado(a).` };
  } catch (e) {
    logger.erro("Falha ao criar registro da secretaria", e);
    return { ok: false, mensagem: "Não foi possível salvar. Tente novamente." };
  }
}

/** Quando disparar: presets práticos + personalizado (datetime-local). */
function calcularAgendamento(quando: string, dataHora: string | undefined): Date | null {
  const agora = Date.now();
  if (quando === "15min") return new Date(agora + 15 * 60_000);
  if (quando === "30min") return new Date(agora + 30 * 60_000);
  if (quando === "1h") return new Date(agora + 60 * 60_000);
  if (quando === "amanha") {
    const d = new Date(agora);
    d.setDate(d.getDate() + 1);
    d.setHours(11, 0, 0, 0); // amanhã às 11h (fuso do servidor: America/Sao_Paulo)
    return d;
  }
  if (quando === "custom" && dataHora) {
    const d = new Date(dataHora); // valor do <input type="datetime-local">
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Agenda uma mensagem de WhatsApp para o futuro. Um CRON envia quando vencer. */
export async function agendarDisparoSecretaria(input: {
  contato: string;
  nome?: string;
  mensagem: string;
  quando: string;
  dataHora?: string;
  registroId?: string;
}): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("secretaria.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas ações seguidas. Aguarde um instante." };

    const contato = (input.contato ?? "").replace(/\D/g, "");
    if (contato.length < 10) return { ok: false, mensagem: "Número de WhatsApp inválido." };

    const mensagem = (input.mensagem ?? "").trim();
    if (mensagem.length < 2) return { ok: false, mensagem: "Escreva a mensagem." };

    const agendadoPara = calcularAgendamento(input.quando, input.dataHora);
    if (!agendadoPara) return { ok: false, mensagem: "Escolha quando enviar." };
    if (agendadoPara.getTime() < Date.now() - 60_000) {
      return { ok: false, mensagem: "A data/hora escolhida já passou." };
    }

    await ctx.db.disparoAgendado.create({
      data: {
        tenantId: ctx.tenant.id,
        contato,
        nome: input.nome?.trim().slice(0, 160) || null,
        mensagem: mensagem.slice(0, 2000),
        agendadoPara,
        registroId: input.registroId ?? null,
        criadoPorId: ctx.sessao.userId,
        criadoPorNome: ctx.sessao.nome,
      },
      select: { id: true },
    });

    await auditar(ctx, {
      acao: "secretaria.agendar_disparo",
      alvoTipo: "DisparoAgendado",
      detalhes: { quando: input.quando, agendadoPara: agendadoPara.toISOString() },
    });

    revalidatePath("/painel/secretaria");
    return { ok: true, mensagem: `Mensagem agendada para ${agendadoPara.toLocaleString("pt-BR")}.` };
  } catch (e) {
    logger.erro("Falha ao agendar disparo", e);
    return { ok: false, mensagem: "Não foi possível agendar. Tente novamente." };
  }
}

/** Cancela um disparo ainda pendente. */
export async function cancelarDisparoSecretaria(id: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("secretaria.gerenciar");
    await ctx.db.disparoAgendado.updateMany({
      where: { id, status: "PENDENTE" },
      data: { status: "CANCELADO" },
    });
    revalidatePath("/painel/secretaria");
    return { ok: true, mensagem: "Agendamento cancelado." };
  } catch {
    return { ok: false, mensagem: "Não foi possível cancelar." };
  }
}
