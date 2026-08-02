import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/session";
import { opcoesDeAcesso, podeAlternar } from "@/lib/auth/roteador";
import "./escolher.css";

export const metadata: Metadata = {
  title: "Por onde entrar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Roteador de acesso (seção 2): quem tem papel de gestão escolhe entre o
 * Painel de Gestão e o App da Igreja — e volta aqui para alternar sem deslogar.
 * Membro puro nem chega nesta tela (vai direto pro app).
 */
export default async function PaginaEscolher() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  // Membro puro não tem o que escolher.
  if (!podeAlternar(sessao.papel)) redirect("/app");

  const opcoes = opcoesDeAcesso(sessao.papel);
  const primeiroNome = sessao.nome.trim().split(/\s+/)[0] ?? sessao.nome;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap" />

      <main className="escolher">
        <div className="escolher__caixa">
          <p className="escolher__kick">Bem-vindo, {primeiroNome}</p>
          <h1 className="escolher__titulo">Por onde você quer entrar?</h1>
          <p className="escolher__sub">Você pode alternar entre os dois a qualquer momento, sem sair da conta.</p>

          <div className="escolher__grid">
            {opcoes.map((o) => (
              <Link key={o.chave} href={o.href} className={`escolher__card escolher__card--${o.chave}`}>
                <span className="escolher__ico" aria-hidden="true">
                  {o.chave === "painel" ? <IcoPainel /> : <IcoApp />}
                </span>
                <span className="escolher__card-nome">{o.rotulo}</span>
                <span className="escolher__card-desc">{o.descricao}</span>
                <span className="escolher__seta" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>

          <p className="escolher__rodape">
            <Link href="/login">Sair da conta</Link>
          </p>
        </div>
      </main>
    </>
  );
}

function IcoPainel() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </svg>
  );
}
function IcoApp() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}
