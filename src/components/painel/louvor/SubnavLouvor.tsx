"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Abas internas do módulo de Louvor. Escala é a principal. */
const ABAS = [
  { rotulo: "Escala", href: "/painel/louvor" },
  { rotulo: "Equipe", href: "/painel/louvor/equipe" },
  { rotulo: "Repertório", href: "/painel/louvor/repertorio" },
  { rotulo: "Conversa", href: "/painel/louvor/chat" },
];

export function SubnavLouvor() {
  const pathname = usePathname();
  return (
    <nav className="lvr-abas" aria-label="Seções do louvor">
      {ABAS.map((aba) => {
        const ativo =
          aba.href === "/painel/louvor"
            ? pathname === "/painel/louvor" || pathname.startsWith("/painel/louvor/escala")
            : pathname.startsWith(aba.href);
        return (
          <Link key={aba.href} href={aba.href} className={`lvr-aba${ativo ? " lvr-aba--ativa" : ""}`} aria-current={ativo ? "page" : undefined}>
            {aba.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
