import { NextResponse } from "next/server";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { exigirCsrf } from "@/lib/security/csrf";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import {
  conectarInstancia,
  criarInstancia,
  whatsappConfigurado,
} from "@/lib/whatsapp/uazapi";

/**
 * POST /api/whatsapp/connect
 *
 * Cria a instância da igreja (se ainda não existir) e devolve o QR Code para
 * o usuário parear o número. O token da instância é resolvido no servidor a
 * partir do tenant do host — nenhum id de instância vem do cliente, então uma
 * igreja não consegue conectar/usar o WhatsApp de outra.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const ctx = await exigirPermissao("whatsapp.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) return respostaLimiteExcedido(limite.tentarEmSegundos);

    await exigirCsrf(request);

    if (!whatsappConfigurado()) {
      return NextResponse.json(
        { erro: "O WhatsApp ainda não foi configurado pelo administrador da plataforma." },
        { status: 503 },
      );
    }

    let instancia = await ctx.db.whatsappInstance.findUnique({
      where: { tenantId: ctx.tenant.id },
    });

    if (!instancia) {
      const criada = await criarInstancia(`igreja_${ctx.tenant.id}`, ctx.sessao.userId);
      instancia = await ctx.db.whatsappInstance.create({
        data: {
          tenantId: ctx.tenant.id,
          uazInstanceId: criada.id,
          uazToken: criada.token,
          status: "conectando",
        },
      });
    }

    const conexao = await conectarInstancia(instancia.uazToken);

    await ctx.db.whatsappInstance.update({
      where: { tenantId: ctx.tenant.id },
      data: { status: "conectando" },
    });

    await auditar(ctx, { acao: "whatsapp.conectar", alvoTipo: "WhatsappInstance", alvoId: ctx.tenant.id });

    return NextResponse.json(
      { qrcode: conexao.qrcode, paircode: conexao.paircode },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "whatsapp/connect" });
  }
}
