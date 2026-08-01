"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { iniciais, primeiroNome } from "@/lib/painel/formato";

/**
 * Topo do painel: saudação de boas-vindas + ações (sino de avisos, tema
 * claro/escuro, editar meu cadastro, avatar).
 *
 * O tema é aplicado trocando o atributo data-tema no elemento .painel. O
 * layout (servidor) já injeta o tema inicial a partir de um cookie, então
 * NÃO há "flash" — aqui só cuidamos da troca em tempo real e da persistência.
 */

type Tema = "claro" | "escuro";

export function TopoPainel({
  nomeUsuario,
  temaInicial,
  novasMensagens,
}: {
  nomeUsuario: string;
  temaInicial: Tema;
  novasMensagens: number;
}) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  const alternar = useCallback(() => {
    const proximo: Tema = tema === "escuro" ? "claro" : "escuro";
    setTema(proximo);
    const painel = document.querySelector<HTMLElement>(".painel");
    if (painel) painel.dataset.tema = proximo;
    try {
      localStorage.setItem("discipular-tema-painel", proximo);
    } catch {
      /* modo privado pode bloquear — o cookie abaixo já cobre */
    }
    // Cookie para o servidor renderizar o tema certo já no próximo carregamento.
    document.cookie = `tema-painel=${proximo}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [tema]);

  return (
    <header className="painel__topo-bar">
      <div>
        <p className="painel__ola">
          Seja bem-vindo, <b>{primeiroNome(nomeUsuario)}</b>
        </p>
        <p className="painel__bencao">
          <span aria-hidden="true">🙏</span> Que Deus te abençoe hoje!
        </p>
      </div>

      <div className="painel__acoes-topo">
        {/* Sino de avisos → caixa de entrada */}
        <Link
          href="/painel/caixa-entrada"
          className="btn-tema"
          style={{ position: "relative" }}
          aria-label={
            novasMensagens > 0
              ? `${novasMensagens} novas mensagens`
              : "Sem novas mensagens"
          }
          title={novasMensagens > 0 ? `${novasMensagens} novas mensagens` : "Avisos"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {novasMensagens > 0 && (
            <span className="sino-ponto" aria-hidden="true">
              {novasMensagens > 9 ? "9+" : novasMensagens}
            </span>
          )}
        </Link>

        {/* Alternador de tema claro/escuro */}
        <button type="button" className="btn-tema" onClick={alternar} aria-label="Alternar tema claro e escuro" title="Tema claro / escuro">
          <svg className="ico-lua" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
          <svg className="ico-sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        </button>

        {/* Editar meu cadastro */}
        <Link href="/painel/minha-conta" className="chip-topo" title="Editar meu cadastro">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
          </svg>
          <span>Meu cadastro</span>
        </Link>

        <div className="avatar-usuario" aria-hidden="true">{iniciais(nomeUsuario)}</div>
      </div>
    </header>
  );
}
