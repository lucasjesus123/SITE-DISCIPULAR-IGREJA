import "server-only";

import type { TenantDb } from "@/lib/db/tenant-client";

/**
 * Serviços de leitura do Ministério de Louvor. Mantêm as páginas magras e
 * concentram as queries num lugar só (mais fácil de auditar o que sai do banco).
 *
 * Convenção: recebem o `db` já escopado por tenant (ctx.db), então nenhuma
 * query aqui precisa — nem pode — repetir o filtro de tenant.
 */

/**
 * Garante que existe um ministério de Louvor para a igreja e devolve o id.
 * A primeira vez cria o ministério com as funções padrão. Idempotente.
 */
export async function garantirMinisterioLouvor(db: TenantDb, tenantId: string): Promise<string> {
  const existente = await db.ministerio.findFirst({
    where: { tipo: "LOUVOR" },
    orderBy: { criadoEm: "asc" },
    select: { id: true },
  });
  if (existente) return existente.id;

  const ministerio = await db.ministerio.create({
    data: { tenantId, nome: "Ministério de Louvor", tipo: "LOUVOR" },
    select: { id: true },
  });

  const FUNCOES_PADRAO = [
    "Ministração", "Vocal", "Violão", "Guitarra", "Baixo", "Bateria",
    "Teclado", "Multimídia",
  ];
  await db.funcaoMinisterio.createMany({
    data: FUNCOES_PADRAO.map((nome, ordem) => ({ tenantId, ministerioId: ministerio.id, nome, ordem })),
  });

  return ministerio.id;
}

/** Escala de um mês/ano com eventos, escalados e músicas — para a tela da escala. */
export async function carregarEscalaDoMes(
  db: TenantDb,
  ministerioId: string,
  ano: number,
  mes: number,
) {
  return db.escalaMinisterio.findFirst({
    where: { ministerioId, ano, mes },
    include: {
      eventos: {
        orderBy: [{ data: "asc" }, { hora: "asc" }],
        include: {
          escalados: {
            include: {
              membro: { select: { id: true, nome: true } },
              funcao: { select: { id: true, nome: true } },
            },
          },
          musicas: {
            orderBy: { ordem: "asc" },
            include: { musica: { select: { id: true, titulo: true, artista: true, tomPadrao: true } } },
          },
        },
      },
    },
  });
}

/** Equipe do ministério com funções de cada integrante. */
export async function carregarEquipe(db: TenantDb, ministerioId: string) {
  return db.membroMinisterio.findMany({
    where: { ministerioId, ativo: true },
    orderBy: [{ ehLider: "desc" }, { nome: "asc" }],
    include: {
      funcoes: { include: { funcao: { select: { id: true, nome: true } } } },
    },
  });
}

/** Funções cadastradas no ministério (para montar seletores). */
export async function carregarFuncoes(db: TenantDb, ministerioId: string) {
  return db.funcaoMinisterio.findMany({
    where: { ministerioId },
    orderBy: { ordem: "asc" },
    select: { id: true, nome: true, ordem: true },
  });
}

/** Biblioteca de músicas do ministério. */
export async function carregarRepertorio(db: TenantDb, ministerioId: string) {
  return db.musicaMinisterio.findMany({
    where: { ministerioId },
    orderBy: { titulo: "asc" },
  });
}
