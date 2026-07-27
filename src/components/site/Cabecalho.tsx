"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SeloAoVivo, type EstadoLive } from "@/components/site/AoVivo";

export interface ItemMenu {
  rotulo: string;
  href: string;
}

export function Cabecalho({
  nomeIgreja,
  logoUrl,
  menu,
  estadoLive,
}: {
  nomeIgreja: string;
  logoUrl: string | null;
  menu: ItemMenu[];
  estadoLive: EstadoLive;
}) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Link href="/" className="brand" aria-label={`${nomeIgreja} — página inicial`}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- servida pela nossa rota autorizada, sem otimização remota
              <img src={logoUrl} alt={nomeIgreja} className="brand__logo" />
            ) : (
              <span className="brand__nome">{nomeIgreja}</span>
            )}
          </Link>

          <nav className="nav" aria-label="Menu principal">
            {menu.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav__link"
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.rotulo}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <SeloAoVivo inicial={estadoLive} href="/ao-vivo" />
            <Link href="/contato" className="btn btn--sm">
              Fale conosco
            </Link>
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={aberto}
              aria-controls="menu-mobile"
              aria-label={aberto ? "Fechar menu" : "Abrir menu"}
              onClick={() => setAberto((v) => !v)}
            >
              <span aria-hidden="true" style={barra(aberto, -5, 45)} />
              <span aria-hidden="true" style={barra(aberto, 0, 0, true)} />
              <span aria-hidden="true" style={barra(aberto, 5, -45)} />
            </button>
          </div>
        </div>
      </header>

      {aberto && (
        <div className="mobile-nav" id="menu-mobile">
          <button
            type="button"
            onClick={() => setAberto(false)}
            aria-label="Fechar menu"
            style={{ position: "absolute", top: 20, right: 24, fontSize: "2rem", color: "var(--bone)" }}
          >
            ×
          </button>
          {menu.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mobile-nav__link"
              onClick={() => setAberto(false)}
            >
              {item.rotulo}
            </Link>
          ))}
          <div style={{ marginTop: "2rem" }}>
            <SeloAoVivo inicial={estadoLive} href="/ao-vivo" />
          </div>
        </div>
      )}
    </>
  );
}

function barra(aberto: boolean, deslocamento: number, rotacao: number, some = false): React.CSSProperties {
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 18,
    height: 1.5,
    background: "currentColor",
    transition: "transform .4s var(--ease), opacity .3s",
    opacity: aberto && some ? 0 : 1,
    transform: aberto
      ? `translate(-50%, -50%) rotate(${rotacao}deg)`
      : `translate(-50%, ${deslocamento - 0.75}px)`,
  };
}
