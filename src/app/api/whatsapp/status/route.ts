import { NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/auth/rbac";
import { tratarErro } from "@/lib/http/erros";
import { statusInstancia, whatsappConfigurado } from "@/lib/whatsapp/uazapi";

/**
 * GET /api/whatsapp/status
 *
 * Estado atual da conexão da igreja (para o polling do QR e para a tela).
 * Método seguro (GET) — não precisa de CSRF. A instância é sempre a do tenant
 * do host.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ctx = await exigirPermissao("whatsapp.gerenciar");

    const instancia = await ctx.db.whatsappInstance.findUnique({
      where: { tenantId: ctx.tenant.id },
    });

    if (!instancia || !whatsappConfigurado()) {
      return NextResponse.json(
        { conectado: false, status: "desconectado", numero: null, perfilNome: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const st = await statusInstancia(instancia.uazToken);
    const conectado = st.conectado && st.logado;
    const novoStatus = conectado
      ? "conectado"
      : st.textoStatus === "connecting"
        ? "conectando"
        : "desconectado";

    await ctx.db.whatsappInstance.update({
      where: { tenantId: ctx.tenant.id },
      data: {
        status: novoStatus,
        numero: st.numero ?? instancia.numero,
        perfilNome: st.perfilNome ?? instancia.perfilNome,
        conectadoEm: conectado && !instancia.conectadoEm ? new Date() : instancia.conectadoEm,
      },
    });

    return NextResponse.json(
      {
        conectado,
        status: novoStatus,
        numero: st.numero ?? instancia.numero,
        perfilNome: st.perfilNome ?? instancia.perfilNome,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "whatsapp/status" });
  }
}
