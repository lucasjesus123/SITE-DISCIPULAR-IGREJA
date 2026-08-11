import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { enviarTexto } from "@/lib/whatsapp/uazapi";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/disparos-agendados
 *
 * Roda de minuto em minuto (systemd timer). Envia as mensagens da Secretaria
 * cujo horário agendado já venceu, pelo WhatsApp de CADA igreja.
 *
 * Robustez:
 *  - autenticado por x-cron-secret;
 *  - pega no máximo 200 por tick (não estoura se acumular);
 *  - igreja sem número conectado: o disparo NÃO fica preso — vira FALHOU com
 *    motivo, para a secretaria ver e reagendar;
 *  - um erro de envio não derruba os outros.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function autorizado(req: Request): boolean {
  const segredo = env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = req.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!autorizado(request)) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const agora = new Date();
  const resumo = { devidos: 0, enviados: 0, semWhatsapp: 0, falhas: 0 };

  const devidos = await prisma.disparoAgendado.findMany({
    where: { status: "PENDENTE", agendadoPara: { lte: agora } },
    orderBy: { agendadoPara: "asc" },
    take: 200,
    select: { id: true, tenantId: true, contato: true, mensagem: true },
  });
  resumo.devidos = devidos.length;

  // Token do WhatsApp por igreja, resolvido uma vez só.
  const tokenCache = new Map<string, string | null>();
  async function tokenDoTenant(tenantId: string): Promise<string | null> {
    const cache = tokenCache.get(tenantId);
    if (cache !== undefined) return cache;
    const inst = await prisma.whatsappInstance.findUnique({
      where: { tenantId },
      select: { uazToken: true, status: true },
    });
    const token = inst && inst.status === "conectado" && inst.uazToken ? inst.uazToken : null;
    tokenCache.set(tenantId, token);
    return token;
  }

  for (let i = 0; i < devidos.length; i++) {
    const d = devidos[i]!;
    try {
      const token = await tokenDoTenant(d.tenantId);
      if (!token) {
        await prisma.disparoAgendado.update({
          where: { id: d.id },
          data: { status: "FALHOU", erro: "WhatsApp da igreja não está conectado." },
        });
        resumo.semWhatsapp += 1;
        continue;
      }
      await enviarTexto(token, d.contato, d.mensagem, i === 0 ? 0 : 1200);
      await prisma.disparoAgendado.update({
        where: { id: d.id },
        data: { status: "ENVIADO", enviadoEm: new Date() },
      });
      resumo.enviados += 1;
    } catch (erro) {
      resumo.falhas += 1;
      await prisma.disparoAgendado
        .update({ where: { id: d.id }, data: { status: "FALHOU", erro: String((erro as Error).message).slice(0, 300) } })
        .catch(() => {});
      logger.erro("Falha ao enviar disparo agendado", erro, { id: d.id, tenantId: d.tenantId });
    }
  }

  logger.info("CRON disparos-agendados concluído", resumo);
  return NextResponse.json({ ok: true, ...resumo });
}
