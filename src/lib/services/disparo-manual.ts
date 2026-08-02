import "server-only";

import type { StatusPessoa } from "@prisma/client";
import { tenantDb } from "@/lib/db/tenant-client";
import { telefoneWhatsApp } from "@/lib/mensagens/aniversario-disparo";
import { renderizarTemplate } from "@/lib/mensagens/template";
import { enviarLote, tokenSeConectado, type AlvoDisparo } from "@/lib/whatsapp/disparo";

/**
 * Disparo manual pela secretaria: uma mensagem para um público escolhido
 * (todos, membros ou visitantes). O texto pode usar {nome} e {igreja} — a
 * mensagem é personalizada por pessoa. Degrada com elegância se não houver
 * número conectado.
 */

export type PublicoDisparo = "TODOS" | "MEMBROS" | "VISITANTES";

const STATUS_POR_PUBLICO: Record<PublicoDisparo, StatusPessoa[]> = {
  TODOS: ["MEMBRO", "VISITANTE", "EM_ACOMPANHAMENTO", "CONGREGANTE"],
  MEMBROS: ["MEMBRO", "CONGREGANTE"],
  VISITANTES: ["VISITANTE", "EM_ACOMPANHAMENTO"],
};

export type ResultadoDisparo =
  | { ok: false; motivo: "sem_numero" }
  | { ok: true; destinatarios: number; enviados: number; erros: number };

export async function dispararManual(
  tenantId: string,
  params: { publico: PublicoDisparo; texto: string; igreja: string },
): Promise<ResultadoDisparo> {
  const token = await tokenSeConectado(tenantId);
  if (!token) return { ok: false, motivo: "sem_numero" };

  const db = tenantDb(tenantId);
  const pessoas = await db.pessoa.findMany({
    where: { excluidoEm: null, status: { in: STATUS_POR_PUBLICO[params.publico] }, telefone: { not: null } },
    select: { id: true, nome: true, telefone: true },
  });

  const alvos: AlvoDisparo[] = [];
  for (const p of pessoas) {
    const numero = telefoneWhatsApp(p.telefone);
    if (!numero) continue;
    alvos.push({
      telefoneWhatsApp: numero,
      texto: renderizarTemplate(params.texto, { nome: p.nome.trim().split(/\s+/)[0] || p.nome, igreja: params.igreja }),
      ref: p.id,
    });
  }

  const r = await enviarLote(token, alvos, { tenantId });
  return { ok: true, destinatarios: alvos.length, enviados: r.enviados, erros: r.erros };
}
