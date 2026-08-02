import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { tenantDb } from "@/lib/db/tenant-client";
import { env } from "@/lib/env";
import { calcularAniversariantes } from "@/lib/painel/aniversariantes";
import { comporDisparosAniversario } from "@/lib/mensagens/aniversario-disparo";
import { TEMPLATES_PADRAO } from "@/lib/mensagens/template";
import { enviarTexto } from "@/lib/whatsapp/uazapi";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/aniversarios
 *
 * Roda uma vez por dia (systemd timer / cron) e envia a felicitação de
 * aniversário (de vida e de batismo) pelo WhatsApp de CADA igreja que tiver o
 * número conectado. Assinatura da própria igreja (vem do template).
 *
 * Segurança e robustez:
 *  - autenticado por x-cron-secret (segredo só no servidor);
 *  - multi-tenant: percorre as igrejas ativas, isolando cada uma no seu escopo;
 *  - degrada com elegância: igreja sem número conectado é PULADA, não quebra;
 *  - não falha o job inteiro por causa de um envio: erros são contados e logados.
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

  const hojeIso = new Date().toISOString().slice(0, 10);
  const resumo = { igrejas: 0, enviados: 0, pulados: 0, erros: 0 };

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["ATIVO", "TRIAL"] }, excluidoEm: null },
    select: { id: true, nome: true },
  });

  for (const tenant of tenants) {
    resumo.igrejas += 1;
    try {
      const instancia = await prisma.whatsappInstance.findUnique({
        where: { tenantId: tenant.id },
        select: { uazToken: true, status: true },
      });
      // Sem número conectado: nada a fazer nesta igreja.
      if (!instancia || instancia.status !== "conectado" || !instancia.uazToken) {
        resumo.pulados += 1;
        continue;
      }

      const db = tenantDb(tenant.id);
      const [pessoas, templates, config] = await Promise.all([
        db.pessoa.findMany({
          where: { excluidoEm: null, status: { in: ["MEMBRO", "VISITANTE", "EM_ACOMPANHAMENTO", "CONGREGANTE"] } },
          select: { id: true, nome: true, telefone: true, dataNascimento: true, dataBatismo: true },
        }),
        db.mensagemTemplate.findMany({
          where: { chave: { in: ["aniversario_vida", "aniversario_batismo"] }, ativo: true },
          select: { chave: true, corpo: true },
        }),
        db.siteConfig.findFirst({ select: { nomeExibicao: true } }),
      ]);

      const corpoVida =
        templates.find((t) => t.chave === "aniversario_vida")?.corpo ??
        TEMPLATES_PADRAO.find((t) => t.chave === "aniversario_vida")!.corpo;
      const corpoBatismo =
        templates.find((t) => t.chave === "aniversario_batismo")?.corpo ??
        TEMPLATES_PADRAO.find((t) => t.chave === "aniversario_batismo")!.corpo;

      const { hoje } = calcularAniversariantes(pessoas, hojeIso);
      const disparos = comporDisparosAniversario(hoje, { vida: corpoVida, batismo: corpoBatismo }, config?.nomeExibicao ?? tenant.nome);

      // Envia em série com um respiro entre mensagens (não parece robô/spam).
      for (let i = 0; i < disparos.length; i++) {
        const d = disparos[i]!;
        try {
          await enviarTexto(instancia.uazToken, d.telefoneWhatsApp, d.texto, i === 0 ? 0 : 1500);
          resumo.enviados += 1;
        } catch (erro) {
          resumo.erros += 1;
          logger.erro("Falha ao enviar aniversário", erro, { tenantId: tenant.id, pessoaId: d.pessoaId });
        }
      }
    } catch (erro) {
      resumo.erros += 1;
      logger.erro("Falha no CRON de aniversários (igreja)", erro, { tenantId: tenant.id });
    }
  }

  logger.info("CRON aniversários concluído", resumo);
  return NextResponse.json({ ok: true, ...resumo, data: hojeIso });
}
