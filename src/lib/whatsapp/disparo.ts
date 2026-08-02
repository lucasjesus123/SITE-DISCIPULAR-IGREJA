import "server-only";

import { prisma } from "@/lib/db/prisma";
import { enviarTexto } from "@/lib/whatsapp/uazapi";
import { logger } from "@/lib/logger";

/**
 * Envio de WhatsApp em lote, reaproveitado por todas as automações (CRON) e
 * pelos disparos manuais. Toda a resiliência mora aqui:
 *  - sem número conectado → devolve token nulo (o chamador PULA, não quebra);
 *  - envia em série com um respiro (não parece robô/spam);
 *  - um envio que falha não derruba o lote (conta e loga).
 */

/** Token da instância SÓ se o número estiver conectado; senão null. */
export async function tokenSeConectado(tenantId: string): Promise<string | null> {
  const inst = await prisma.whatsappInstance.findUnique({
    where: { tenantId },
    select: { uazToken: true, status: true },
  });
  if (!inst || inst.status !== "conectado" || !inst.uazToken) return null;
  return inst.uazToken;
}

export interface AlvoDisparo {
  telefoneWhatsApp: string;
  texto: string;
  ref?: string; // id da pessoa, para logar
}

export interface ResultadoLote {
  enviados: number;
  erros: number;
}

/** Envia a lista em série, com atraso entre mensagens. */
export async function enviarLote(
  token: string,
  alvos: AlvoDisparo[],
  opts: { tenantId: string; atrasoMs?: number } = { tenantId: "" },
): Promise<ResultadoLote> {
  const atraso = opts.atrasoMs ?? 1500;
  let enviados = 0;
  let erros = 0;
  for (let i = 0; i < alvos.length; i++) {
    const a = alvos[i]!;
    try {
      await enviarTexto(token, a.telefoneWhatsApp, a.texto, i === 0 ? 0 : atraso);
      enviados += 1;
    } catch (erro) {
      erros += 1;
      logger.erro("Falha em envio de WhatsApp (lote)", erro, { tenantId: opts.tenantId, ref: a.ref });
    }
  }
  return { enviados, erros };
}
