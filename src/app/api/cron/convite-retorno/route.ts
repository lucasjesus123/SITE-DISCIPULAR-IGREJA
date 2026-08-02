import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/http/cron";
import { rodarAutomacaoRelacionamento } from "@/lib/automacoes/relacionamento";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/convite-retorno
 * Rode 1x/dia. Convida de volta o visitante cadastrado há >=14 dias que ainda
 * não retornou/virou membro (janela até 60 dias). Idempotente.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  const resumo = await rodarAutomacaoRelacionamento("convite_retorno", Date.now());
  logger.info("CRON convite-retorno concluído", { ...resumo });
  return NextResponse.json({ ok: true, ...resumo });
}
