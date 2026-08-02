"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ChaveRecurso } from "@/lib/app-membro/recursos";

/**
 * Barra de navegação inferior do PWA — identidade Institucional (grafite com
 * item ativo em menta).
 *
 * Fica embaixo porque o app é usado com uma mão, no celular, muitas vezes de
 * pé dentro da igreja. Os itens vêm prontos do layout, já filtrados pelos
 * toggles da igreja e pelos vínculos do membro (ver src/lib/app-membro).
 */

interface ItemBarra {
  chave: ChaveRecurso;
  href: string;
  rotulo: string;
}

export function BarraApp({
  itens,
  logado,
  aoVivo,
  nomeIgreja,
}: {
  itens: ItemBarra[];
  logado: boolean;
  aoVivo: boolean;
  nomeIgreja: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação do aplicativo"
      className="appbar-inst"
      style={{ gridTemplateColumns: `repeat(${itens.length}, 1fr)` }}
    >
      {itens.map((item) => {
        const ativo = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        const Icone = ICONES[item.chave];
        // Perfil exige conta: manda para o login quando anônimo.
        const destino = item.chave === "perfil" && !logado ? "/login" : item.href;
        const mostrarPontoLive = item.chave === "palavra" && aoVivo;

        return (
          <Link
            key={item.chave}
            href={destino}
            aria-current={ativo ? "page" : undefined}
            className={`appbar-inst__item${ativo ? " appbar-inst__item--on" : ""}`}
          >
            <span className="appbar-inst__ico">
              <Icone />
              {mostrarPontoLive && <span aria-hidden="true" className="appbar-inst__live" />}
            </span>
            {item.rotulo}
            {mostrarPontoLive && <span className="sr-only">— transmissão ao vivo agora</span>}
          </Link>
        );
      })}
      <span className="sr-only">{nomeIgreja}</span>
    </nav>
  );
}

const svg = {
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

const ICONES: Record<ChaveRecurso, () => React.ReactElement> = {
  inicio: () => (<svg {...svg}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>),
  palavra: () => (<svg {...svg}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 12 6-3.5v11L16 16z" /></svg>),
  contribuir: () => (<svg {...svg}><path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10z" /></svg>),
  agenda: () => (<svg {...svg}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>),
  celula: () => (<svg {...svg}><circle cx="6" cy="8" r="2.4" /><circle cx="18" cy="8" r="2.4" /><circle cx="12" cy="16" r="2.4" /><path d="M8 9.6l2.6 4.4M16 9.6l-2.6 4.4" /></svg>),
  perfil: () => (<svg {...svg}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></svg>),
};
