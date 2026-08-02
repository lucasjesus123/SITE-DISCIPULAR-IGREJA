import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/http/cron";
import { rodarAutomacaoRelacionamento } from "@/lib/automacoes/relacionamento";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/boas-vindas
 * Rode a cada ~5 min. Envia a mensagem de boas-vindas para visitantes
 * cadastrados há ~15 min (janela com teto de 24h). Idempotente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const resumo = await rodarAutomacaoRelacionamento("boas_vindas", Date.now());
  logger.info("CRON boas-vindas concluído", { ...resumo });
  return NextResponse.json({ ok: true, ...resumo });
}
