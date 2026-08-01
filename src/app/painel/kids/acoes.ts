"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { ErroKids, fazerCheckin, fazerCheckout } from "@/lib/kids/checkin";

export type ResultadoKids = { ok: boolean; mensagem: string } | null;

async function guard() {
  const ctx = await exigirPermissao("kids.gerenciar");
  const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
  if (!limite.permitido) throw new ErroKids("Muitas operações seguidas. Aguarde.");
  return ctx;
}

function tratar(erro: unknown, acao: string): ResultadoKids {
  if (erro instanceof ErroKids) return { ok: false, mensagem: erro.message };
  if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") return { ok: false, mensagem: "Sem permissão." };
  const ref = logger.erro("Falha em ação KIDS", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}

// ---- Sala -------------------------------------------------------------------
const schemaSala = z.object({
  nome: z.string().trim().min(2).max(80),
  faixaEtaria: z.string().trim().max(40).optional(),
  capacidade: z.coerce.number().int().min(1).max(500).optional(),
});
export async function criarSala(_e: ResultadoKids, formData: FormData): Promise<ResultadoKids> {
  try {
    const ctx = await guard();
    const d = schemaSala.parse(Object.fromEntries(formData));
    const sala = await ctx.db.salaKids.create({
      data: { tenantId: ctx.tenant.id, nome: d.nome, faixaEtaria: d.faixaEtaria || null, capacidade: d.capacidade ?? null },
      select: { id: true },
    });
    await auditar(ctx, { acao: "kids.sala.criar", alvoTipo: "SalaKids", alvoId: sala.id });
    revalidatePath("/painel/kids");
    return { ok: true, mensagem: "Sala criada." };
  } catch (erro) {
    return tratar(erro, "criarSala");
  }
}

// ---- Cadastro de criança ----------------------------------------------------
const schemaCrianca = z.object({
  nome: z.string().trim().min(2).max(160),
  apelido: z.string().trim().max(60).optional(),
  dataNascimento: z.string().min(1),
  salaPadraoId: z.string().optional(),
  alergias: z.string().trim().max(500).optional(),
  restricoes: z.string().trim().max(500).optional(),
  necessidadesEspeciais: z.string().trim().max(500).optional(),
  consentimentoLgpd: z.string().optional(),
  consentimentoFoto: z.string().optional(),
  responsavelUserId: z.string().optional(),
  responsavelNome: z.string().trim().max(160).optional(),
  parentesco: z.string().trim().max(40).optional(),
});
export async function cadastrarCrianca(_e: ResultadoKids, formData: FormData): Promise<ResultadoKids> {
  try {
    const ctx = await guard();
    const d = schemaCrianca.parse(Object.fromEntries(formData));
    if (d.consentimentoLgpd !== "on") {
      return { ok: false, mensagem: "É obrigatório o consentimento LGPD do responsável para cadastrar a criança." };
    }
    const nascimento = new Date(`${d.dataNascimento}T00:00:00.000Z`);
    if (Number.isNaN(nascimento.getTime())) return { ok: false, mensagem: "Data de nascimento inválida." };

    const crianca = await ctx.db.crianca.create({
      data: {
        tenantId: ctx.tenant.id,
        nome: d.nome,
        apelido: d.apelido || null,
        dataNascimento: nascimento,
        salaPadraoId: d.salaPadraoId || null,
        alergias: d.alergias || null,
        restricoes: d.restricoes || null,
        necessidadesEspeciais: d.necessidadesEspeciais || null,
        consentimentoLgpd: true,
        consentimentoFoto: d.consentimentoFoto === "on",
      },
      select: { id: true },
    });

    // Vínculo com um responsável (conta), se informado.
    if (d.responsavelUserId) {
      await ctx.db.criancaResponsavel.create({
        data: {
          tenantId: ctx.tenant.id,
          criancaId: crianca.id,
          responsavelUserId: d.responsavelUserId,
          nome: d.responsavelNome || "Responsável",
          parentesco: d.parentesco || null,
          autorizadoRetirar: true,
          principal: true,
        },
      });
    }

    await auditar(ctx, { acao: "kids.crianca.cadastrar", alvoTipo: "Crianca", alvoId: crianca.id });
    revalidatePath("/painel/kids/criancas");
    return { ok: true, mensagem: "Criança cadastrada." };
  } catch (erro) {
    return tratar(erro, "cadastrarCrianca");
  }
}

// ---- Check-in ---------------------------------------------------------------
export async function checkinCrianca(
  criancaId: string,
  salaId: string,
): Promise<{ ok: boolean; codigo?: string; sessaoId?: string; mensagem?: string }> {
  try {
    const ctx = await guard();
    const hoje = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T00:00:00.000Z`);
    const r = await fazerCheckin(ctx.tenant.id, { criancaId, salaId, cultoData: hoje, checkinPorUserId: ctx.sessao.userId });
    await auditar(ctx, { acao: "kids.checkin", alvoTipo: "Crianca", alvoId: criancaId, detalhes: { sessaoId: r.sessaoId } });
    revalidatePath("/painel/kids");
    return { ok: true, codigo: r.codigo, sessaoId: r.sessaoId };
  } catch (erro) {
    const m = erro instanceof ErroKids ? erro.message : "Não foi possível fazer o check-in.";
    return { ok: false, mensagem: m };
  }
}

// ---- Passaporte Kids: evolução & conquistas ---------------------------------
const schemaEvolucao = z.object({
  criancaId: z.string().min(1),
  tipo: z.enum(["PRESENCA", "LICAO", "MARCO", "CONQUISTA"]),
  titulo: z.string().trim().min(2).max(160),
  descricao: z.string().trim().max(1000).optional(),
  data: z.string().min(1),
});
export async function registrarEvolucao(_e: ResultadoKids, formData: FormData): Promise<ResultadoKids> {
  try {
    const ctx = await guard();
    const d = schemaEvolucao.parse(Object.fromEntries(formData));
    const data = new Date(`${d.data}T00:00:00.000Z`);
    if (Number.isNaN(data.getTime())) return { ok: false, mensagem: "Data inválida." };
    await ctx.db.evolucaoKids.create({
      data: { tenantId: ctx.tenant.id, criancaId: d.criancaId, tipo: d.tipo, titulo: d.titulo, descricao: d.descricao || null, data },
    });
    await auditar(ctx, { acao: "kids.evolucao", alvoTipo: "Crianca", alvoId: d.criancaId });
    revalidatePath(`/painel/kids/crianca/${d.criancaId}`);
    return { ok: true, mensagem: "Registro adicionado à linha do tempo." };
  } catch (erro) {
    return tratar(erro, "registrarEvolucao");
  }
}

/** Concede uma medalha (conquista) e a registra também na linha do tempo. */
export async function darConquista(criancaId: string, nome: string, icone: string): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const ctx = await guard();
    await ctx.db.conquistaKids.create({ data: { tenantId: ctx.tenant.id, criancaId, nome, icone } });
    await ctx.db.evolucaoKids.create({
      data: { tenantId: ctx.tenant.id, criancaId, tipo: "CONQUISTA", titulo: `Conquista: ${nome}`, data: new Date() },
    });
    await auditar(ctx, { acao: "kids.conquista", alvoTipo: "Crianca", alvoId: criancaId, detalhes: { nome } });
    revalidatePath(`/painel/kids/crianca/${criancaId}`);
    return { ok: true };
  } catch (erro) {
    const m = erro instanceof ErroKids ? erro.message : "Não foi possível conceder a medalha.";
    return { ok: false, mensagem: m };
  }
}

// ---- Check-out --------------------------------------------------------------
export async function checkoutCrianca(
  sessaoId: string,
  codigo: string,
  retiradoPorUserId: string,
): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const ctx = await guard();
    await fazerCheckout(ctx.tenant.id, { sessaoId, codigo, retiradoPorUserId, checkoutPorUserId: ctx.sessao.userId });
    await auditar(ctx, { acao: "kids.checkout", alvoTipo: "SessaoSalaKids", alvoId: sessaoId, detalhes: { retiradoPorUserId } });
    revalidatePath("/painel/kids");
    return { ok: true };
  } catch (erro) {
    const m = erro instanceof ErroKids ? erro.message : "Não foi possível fazer o check-out.";
    return { ok: false, mensagem: m };
  }
}
