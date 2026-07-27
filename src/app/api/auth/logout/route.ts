import { NextResponse } from "next/server";
import { encerrarSessao, sessaoAtual } from "@/lib/auth/session";
import { exigirCsrf } from "@/lib/security/csrf";
import { auditarAutenticacao } from "@/lib/audit";
import { tratarErro } from "@/lib/http/erros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Logout.
 *
 * É POST, e não GET, de propósito. Com GET, uma tag `<img src="/api/auth/logout">`
 * num fórum qualquer deslogaria todo mundo que visitasse a página. É um CSRF
 * de baixo impacto, mas gratuito de evitar — e o token CSRF fecha o resto.
 */
export async function POST(request: Request) {
  try {
    await exigirCsrf(request);

    const sessao = await sessaoAtual();

    // Revoga no banco e limpa o cookie. Só limpar o cookie deixaria o token
    // válido para quem o tivesse copiado.
    await encerrarSessao();

    if (sessao) {
      await auditarAutenticacao({
        acao: "logout",
        email: sessao.email,
        userId: sessao.userId,
        tenantId: sessao.tenantId,
      });
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (erro) {
    return tratarErro(erro, { rota: "auth/logout" });
  }
}
