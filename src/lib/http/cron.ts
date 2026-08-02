import "server-only";

import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Autenticação das rotas de CRON. O agendador (systemd timer / cron) manda o
 * segredo no header `x-cron-secret`. Comparação de tempo constante para não
 * vazar o segredo por timing. Sem CRON_SECRET configurado, nada é autorizado.
 */
export function cronAutorizado(request: Request): boolean {
  const segredo = env.CRON_SECRET;
  if (!segredo) return false;
  const recebido = request.headers.get("x-cron-secret") ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}
