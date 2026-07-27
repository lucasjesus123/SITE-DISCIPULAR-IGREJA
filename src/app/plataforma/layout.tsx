import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { ehHostDaPlataforma } from "@/lib/tenant/resolve";
import { hostAtual } from "@/lib/http/contexto";
import "../globals.css";

export const metadata: Metadata = {
  title: { default: "Plataforma", template: "%s · Plataforma" },
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

/**
 * Área do super administrador (você, dono do SaaS).
 *
 * DUAS TRAVAS, NÃO UMA
 *
 *   1. O usuário precisa ter `plataformaAdmin = true`.
 *   2. O acesso precisa vir do DOMÍNIO RAIZ da plataforma.
 *
 * A segunda existe porque o domínio de um cliente pode ser comprometido (DNS
 * sequestrado, certificado emitido indevidamente). Se a área de super admin
 * respondesse em `igrejaqualquer.com.br/plataforma`, esse comprometimento
 * viraria um caminho para a administração de TODAS as igrejas. Amarrando ao
 * domínio raiz, o ataque precisaria comprometer o nosso domínio, não o do
 * cliente.
 */
export default async function LayoutPlataforma({ children }: { children: React.ReactNode }) {
  const host = await hostAtual();
  if (!ehHostDaPlataforma(host)) redirect("/");

  try {
    await exigirPlataformaAdmin();
  } catch {
    redirect("/login");
  }

  await obterTokenCsrf();

  return (
    <div className="painel">
      <aside className="painel__lateral">
        <div className="painel__marca">
          <small>Discipular</small>
          Plataforma
        </div>

        <nav className="painel__nav" aria-label="Menu da plataforma">
          <p className="painel__grupo">Operação</p>
          <Link href="/plataforma" className="painel__link">
            Visão geral
          </Link>
          <Link href="/plataforma/igrejas" className="painel__link">
            Igrejas
          </Link>
          <Link href="/plataforma/dominios" className="painel__link">
            Domínios
          </Link>

          <p className="painel__grupo">Segurança</p>
          <Link href="/plataforma/auditoria" className="painel__link">
            Auditoria
          </Link>
          <Link href="/plataforma/saude" className="painel__link">
            Saúde do sistema
          </Link>
        </nav>

        <div style={{ marginTop: "auto", paddingTop: "1.4rem", borderTop: "1px solid var(--line-on-dark)" }}>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="painel__link" style={{ width: "100%", textAlign: "left", padding: ".45rem .8rem" }}>
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="painel__conteudo">{children}</main>
    </div>
  );
}
