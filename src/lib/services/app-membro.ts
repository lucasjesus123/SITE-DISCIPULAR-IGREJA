import "server-only";

import type { TenantDb } from "@/lib/db/tenant-client";
import { TOGGLES_PADRAO, type ContextoMembro, type TogglesApp } from "@/lib/app-membro/recursos";

/**
 * Leitura da configuração do App de Membros e dos vínculos do membro logado.
 * Recebe o `db` já escopado por tenant (ctx.db) — nenhuma query repete o filtro.
 */

/** Toggles da igreja; devolve os padrões quando ainda não há linha salva. */
export async function carregarTogglesApp(db: TenantDb): Promise<TogglesApp> {
  const cfg = await db.configuracaoAppMembro.findFirst({
    select: { inicio: true, palavra: true, contribuir: true, agenda: true, celula: true, perfil: true, notificacoes: true },
  });
  return cfg ?? TOGGLES_PADRAO;
}

/**
 * Monta o contexto de vínculos que libera itens condicionais. Só consulta o
 * banco quando há um usuário logado — visitante anônimo vê o mínimo.
 */
export async function carregarContextoMembro(
  db: TenantDb,
  opts: { pixConfigurado: boolean; userId: string | null },
): Promise<ContextoMembro> {
  if (!opts.userId) {
    return { pixConfigurado: opts.pixConfigurado, temFilhoKids: false, serveMinisterio: false, emCelula: false };
  }

  const [filhos, ministerio, pessoa] = await Promise.all([
    db.criancaResponsavel.count({ where: { responsavelUserId: opts.userId } }),
    db.membroMinisterio.count({ where: { userId: opts.userId, ativo: true } }),
    db.pessoa.findFirst({ where: { userId: opts.userId }, select: { celulaId: true } }),
  ]);

  return {
    pixConfigurado: opts.pixConfigurado,
    temFilhoKids: filhos > 0,
    serveMinisterio: ministerio > 0,
    emCelula: Boolean(pessoa?.celulaId),
  };
}
