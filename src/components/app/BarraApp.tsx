"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Barra de navegação inferior do PWA.
 *
 * Fica embaixo porque o app é usado com uma mão, no celular, muitas vezes de
 * pé dentro da igreja. Cinco destinos no máximo — acima disso os alvos de
 * toque ficam menores que os 44px recomendados para acessibilidade.
 */

const ITENS = [
  { href: "/app", rotulo: "Início", icone: IconeCasa },
  { href: "/app/ao-vivo", rotulo: "Ao vivo", icone: IconeAoVivo },
  { href: "/app/agenda", rotulo: "Agenda", icone: IconeAgenda },
  { href: "/app/oracao", rotulo: "Oração", icone: IconeOracao },
  { href: "/app/perfil", rotulo: "Perfil", icone: IconePerfil },
];

export function BarraApp({
  logado,
  aoVivo,
  nomeIgreja,
}: {
  logado: boolean;
  aoVivo: boolean;
  nomeIgreja: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação do aplicativo"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        display: "grid",
        gridTemplateColumns: `repeat(${ITENS.length}, 1fr)`,
        background: "rgb(var(--ink-rgb) / .94)",
        backdropFilter: "blur(16px)",
        borderTop: "1px solid var(--line-on-dark)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {ITENS.map((item) => {
        const ativo = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        const Icone = item.icone;
        const destino = item.href === "/app/perfil" && !logado ? "/login" : item.href;

        return (
          <Link
            key={item.href}
            href={destino}
            aria-current={ativo ? "page" : undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: ".25rem",
              // 56px: acima do mínimo de 44px recomendado pelo WCAG para
              // alvos de toque.
              minHeight: 56,
              padding: ".55rem .3rem",
              color: ativo ? "var(--gold)" : "var(--bone-faint)",
              fontSize: ".64rem",
              letterSpacing: ".04em",
              position: "relative",
            }}
          >
            <span style={{ position: "relative", display: "block" }}>
              <Icone />
              {item.href === "/app/ao-vivo" && aoVivo && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -4,
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#E5484D",
                    boxShadow: "0 0 0 2px rgb(var(--ink-rgb))",
                  }}
                />
              )}
            </span>
            {item.rotulo}
            {item.href === "/app/ao-vivo" && aoVivo && (
              <span className="sr-only">— transmissão ao vivo agora</span>
            )}
          </Link>
        );
      })}
      <span className="sr-only">{nomeIgreja}</span>
    </nav>
  );
}

const props = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconeCasa() {
  return (
    <svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </svg>
  );
}

function IconeAoVivo() {
  return (
    <svg {...props}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 12 6-3.5v11L16 16z" />
    </svg>
  );
}

function IconeAgenda() {
  return (
    <svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function IconeOracao() {
  return (
    <svg {...props}>
      <path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10z" />
    </svg>
  );
}

function IconePerfil() {
  return (
    <svg {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </svg>
  );
}
