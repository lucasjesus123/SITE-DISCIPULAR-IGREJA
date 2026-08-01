"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { garantirMinisterioLouvor } from "@/lib/services/louvor";

export type ResultadoLouvor = { ok: boolean; mensagem: string } | null;

function ehErroAuth(erro: unknown): boolean {
  const nome = erro instanceof Error ? erro.name : "";
  return nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError";
}

// --------------------------------------------------------------------------
// EQUIPE
// --------------------------------------------------------------------------

const schemaMembro = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(160),
  whatsapp: z.string().trim().max(20).optional(),
  ehLider: z.string().optional(),
  funcoes: z.array(z.string()).optional(),
});

export async function adicionarMembro(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const dados = schemaMembro.parse({
      nome: formData.get("nome"),
      whatsapp: formData.get("whatsapp") ?? undefined,
      ehLider: formData.get("ehLider") ?? undefined,
      funcoes: formData.getAll("funcoes").map(String),
    });

    const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

    const membro = await ctx.db.membroMinisterio.create({
      data: {
        tenantId: ctx.tenant.id,
        ministerioId,
        nome: dados.nome,
        whatsapp: dados.whatsapp || null,
        ehLider: dados.ehLider === "on",
      },
      select: { id: true },
    });

    const funcaoIds = (dados.funcoes ?? []).filter(Boolean);
    if (funcaoIds.length > 0) {
      await ctx.db.membroFuncao.createMany({
        data: funcaoIds.map((funcaoId) => ({ tenantId: ctx.tenant.id, membroId: membro.id, funcaoId })),
      });
    }

    await auditar(ctx, { acao: "louvor.membro.criar", alvoTipo: "MembroMinisterio", alvoId: membro.id, detalhes: { nome: dados.nome } });
    revalidatePath("/painel/louvor/equipe");
    return { ok: true, mensagem: "Integrante adicionado." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao adicionar integrante", erro, { acao: "adicionarMembro" });
    return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
  }
}

export async function removerMembro(membroId: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    await ctx.db.membroMinisterio.update({ where: { id: membroId }, data: { ativo: false } });
    await auditar(ctx, { acao: "louvor.membro.desativar", alvoTipo: "MembroMinisterio", alvoId: membroId });
    revalidatePath("/painel/louvor/equipe");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// --------------------------------------------------------------------------
// ESCALA
// --------------------------------------------------------------------------

const schemaEscala = z.object({
  mes: z.coerce.number().int().min(1).max(12),
  ano: z.coerce.number().int().min(2020).max(2100),
});

export async function criarEscala(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  let destino: string | null = null;
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const dados = schemaEscala.parse({ mes: formData.get("mes"), ano: formData.get("ano") });
    const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

    const jaExiste = await ctx.db.escalaMinisterio.findFirst({
      where: { ministerioId, ano: dados.ano, mes: dados.mes },
      select: { id: true },
    });
    if (jaExiste) {
      destino = `/painel/louvor/escala/${jaExiste.id}`;
    } else {
      const escala = await ctx.db.escalaMinisterio.create({
        data: { tenantId: ctx.tenant.id, ministerioId, ano: dados.ano, mes: dados.mes },
        select: { id: true },
      });
      await auditar(ctx, { acao: "louvor.escala.criar", alvoTipo: "EscalaMinisterio", alvoId: escala.id, detalhes: { mes: dados.mes, ano: dados.ano } });
      destino = `/painel/louvor/escala/${escala.id}`;
    }
    revalidatePath("/painel/louvor");
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao criar escala", erro, { acao: "criarEscala" });
    return { ok: false, mensagem: `Não foi possível criar. Referência: ${ref}` };
  }
  redirect(destino);
}

const schemaEvento = z.object({
  escalaId: z.string().min(1),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida."),
  tipo: z.enum(["CULTO", "ENSAIO", "EVENTO"]),
  titulo: z.string().trim().min(2, "Dê um título.").max(120),
  dressCodeTexto: z.string().trim().max(200).optional(),
  observacoes: z.string().trim().max(1000).optional(),
});

export async function adicionarEvento(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const dados = schemaEvento.parse({
      escalaId: formData.get("escalaId"),
      data: formData.get("data"),
      hora: formData.get("hora"),
      tipo: formData.get("tipo"),
      titulo: formData.get("titulo"),
      dressCodeTexto: formData.get("dressCodeTexto") ?? undefined,
      observacoes: formData.get("observacoes") ?? undefined,
    });

    // Confirma que a escala é desta igreja (o escopo de tenant já garante isso,
    // mas falha cedo com mensagem clara).
    const escala = await ctx.db.escalaMinisterio.findFirst({ where: { id: dados.escalaId }, select: { id: true } });
    if (!escala) return { ok: false, mensagem: "Escala não encontrada." };

    const evento = await ctx.db.eventoEscala.create({
      data: {
        tenantId: ctx.tenant.id,
        escalaId: dados.escalaId,
        data: new Date(`${dados.data}T00:00:00.000Z`),
        hora: dados.hora,
        tipo: dados.tipo,
        titulo: dados.titulo,
        dressCodeTexto: dados.dressCodeTexto || null,
        observacoes: dados.observacoes || null,
      },
      select: { id: true },
    });

    await auditar(ctx, { acao: "louvor.evento.criar", alvoTipo: "EventoEscala", alvoId: evento.id });
    revalidatePath(`/painel/louvor/escala/${dados.escalaId}`);
    return { ok: true, mensagem: "Evento adicionado à escala." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao adicionar evento", erro, { acao: "adicionarEvento" });
    return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
  }
}

const schemaEscalar = z.object({
  eventoId: z.string().min(1),
  membroId: z.string().min(1),
  funcaoId: z.string().optional(),
  papel: z.enum(["MINISTRANTE", "INSTRUMENTISTA", "VOCAL", "MULTIMIDIA"]),
});

export async function escalarMembro(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const dados = schemaEscalar.parse({
      eventoId: formData.get("eventoId"),
      membroId: formData.get("membroId"),
      funcaoId: formData.get("funcaoId") ?? undefined,
      papel: formData.get("papel"),
    });

    const evento = await ctx.db.eventoEscala.findFirst({ where: { id: dados.eventoId }, select: { id: true, escalaId: true } });
    if (!evento) return { ok: false, mensagem: "Evento não encontrado." };

    await ctx.db.escaladoEvento.create({
      data: {
        tenantId: ctx.tenant.id,
        eventoId: dados.eventoId,
        membroId: dados.membroId,
        funcaoId: dados.funcaoId || null,
        papel: dados.papel,
      },
    });

    await auditar(ctx, { acao: "louvor.escalar", alvoTipo: "EventoEscala", alvoId: dados.eventoId, detalhes: { membroId: dados.membroId } });
    revalidatePath(`/painel/louvor/escala/${evento.escalaId}`);
    return { ok: true, mensagem: "Integrante escalado." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao escalar", erro, { acao: "escalarMembro" });
    return { ok: false, mensagem: `Não foi possível escalar. Referência: ${ref}` };
  }
}

export async function removerEscalado(escaladoId: string, escalaId: string): Promise<{ ok: boolean }> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    await ctx.db.escaladoEvento.delete({ where: { id: escaladoId } });
    revalidatePath(`/painel/louvor/escala/${escalaId}`);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Publica a escala. As convocações de WhatsApp saem daqui QUANDO a integração
 * estiver ativa (o número conectado). Enquanto não estiver, publicamos e
 * registramos — nada de disparo silencioso ou quebra.
 */
export async function publicarEscala(escalaId: string): Promise<{ ok: boolean; mensagem?: string }> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    await ctx.db.escalaMinisterio.update({
      where: { id: escalaId },
      data: { status: "PUBLICADA", publicadaEm: new Date() },
    });
    await auditar(ctx, { acao: "louvor.escala.publicar", alvoTipo: "EscalaMinisterio", alvoId: escalaId });
    revalidatePath(`/painel/louvor/escala/${escalaId}`);
    revalidatePath("/painel/louvor");
    return { ok: true, mensagem: "Escala publicada. As convocações no WhatsApp saem assim que o número estiver conectado." };
  } catch {
    return { ok: false, mensagem: "Não foi possível publicar." };
  }
}

// --------------------------------------------------------------------------
// REPERTÓRIO
// --------------------------------------------------------------------------

const schemaMusica = z.object({
  titulo: z.string().trim().min(2, "Informe o título.").max(160),
  artista: z.string().trim().max(120).optional(),
  tomPadrao: z.string().trim().max(8).optional(),
  linkCifra: z.string().trim().max(500).optional(),
  linkVideo: z.string().trim().max(500).optional(),
});

export async function adicionarMusica(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const dados = schemaMusica.parse({
      titulo: formData.get("titulo"),
      artista: formData.get("artista") ?? undefined,
      tomPadrao: formData.get("tomPadrao") ?? undefined,
      linkCifra: formData.get("linkCifra") ?? undefined,
      linkVideo: formData.get("linkVideo") ?? undefined,
    });
    const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

    const musica = await ctx.db.musicaMinisterio.create({
      data: {
        tenantId: ctx.tenant.id,
        ministerioId,
        titulo: dados.titulo,
        artista: dados.artista || null,
        tomPadrao: dados.tomPadrao || null,
        linkCifra: dados.linkCifra || null,
        linkVideo: dados.linkVideo || null,
      },
      select: { id: true },
    });
    await auditar(ctx, { acao: "louvor.musica.criar", alvoTipo: "MusicaMinisterio", alvoId: musica.id });
    revalidatePath("/painel/louvor/repertorio");
    return { ok: true, mensagem: "Música adicionada ao repertório." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    const ref = logger.erro("Falha ao adicionar música", erro, { acao: "adicionarMusica" });
    return { ok: false, mensagem: `Não foi possível salvar. Referência: ${ref}` };
  }
}

const schemaEventoMusica = z.object({
  eventoId: z.string().min(1),
  musicaId: z.string().min(1),
  tomDoDia: z.string().trim().max(8).optional(),
});

export async function adicionarMusicaAoEvento(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const dados = schemaEventoMusica.parse({
      eventoId: formData.get("eventoId"),
      musicaId: formData.get("musicaId"),
      tomDoDia: formData.get("tomDoDia") ?? undefined,
    });
    const evento = await ctx.db.eventoEscala.findFirst({ where: { id: dados.eventoId }, select: { escalaId: true } });
    if (!evento) return { ok: false, mensagem: "Evento não encontrado." };

    const ultima = await ctx.db.eventoMusica.findFirst({
      where: { eventoId: dados.eventoId },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });

    await ctx.db.eventoMusica.create({
      data: {
        tenantId: ctx.tenant.id,
        eventoId: dados.eventoId,
        musicaId: dados.musicaId,
        tomDoDia: dados.tomDoDia || null,
        ordem: (ultima?.ordem ?? -1) + 1,
      },
    });
    revalidatePath(`/painel/louvor/escala/${evento.escalaId}`);
    return { ok: true, mensagem: "Música adicionada ao culto." };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Dados inválidos." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    return { ok: false, mensagem: "Não foi possível adicionar a música." };
  }
}

// --------------------------------------------------------------------------
// CHAT
// --------------------------------------------------------------------------

const schemaChat = z.object({ texto: z.string().trim().min(1, "Escreva algo.").max(2000) });

export async function postarNoChat(_estado: ResultadoLouvor, formData: FormData): Promise<ResultadoLouvor> {
  try {
    const ctx = await exigirPermissao("louvor.gerenciar");
    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return { ok: false, mensagem: "Devagar — muitas mensagens seguidas." };

    const dados = schemaChat.parse({ texto: formData.get("texto") });
    const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

    await ctx.db.chatMinisterio.create({
      data: {
        tenantId: ctx.tenant.id,
        ministerioId,
        autorUserId: ctx.sessao.userId,
        autorNome: ctx.sessao.nome,
        texto: dados.texto,
      },
    });
    revalidatePath("/painel/louvor/chat");
    return { ok: true, mensagem: "" };
  } catch (erro) {
    if (erro instanceof z.ZodError) return { ok: false, mensagem: erro.issues[0]?.message ?? "Mensagem inválida." };
    if (ehErroAuth(erro)) return { ok: false, mensagem: "Sem permissão." };
    return { ok: false, mensagem: "Não foi possível enviar." };
  }
}
