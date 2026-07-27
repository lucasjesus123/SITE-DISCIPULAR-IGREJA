"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Papel } from "@prisma/client";
import { papelTem, type Permissao } from "@/lib/auth/permissoes";

/**
 * Menu lateral do painel.
 *
 * IMPORTANTE: esconder um item do menu NÃO é controle de acesso.
 *
 * O `papelTem()` daqui existe para não mostrar ao usuário portas que ele não
 * pode abrir — é usabilidade. A autorização de verdade acontece no servidor,
 * em cada página e cada Server Action. Se alguém digitar /painel/usuarios na
 * barra de endereços sem permissão, quem barra é o `exigirPermissao()` do
 * servidor, não este componente.
 */

interface ItemNav {
  rotulo: string;
  href: string;
  permissao?: Permissao;
  contador?: "caixaEntrada" | "oracoes" | "batismos";
  alerta?: boolean;
}

interface GrupoNav {
  titulo: string;
  itens: ItemNav[];
}

const NAVEGACAO: GrupoNav[] = [
  {
    titulo: "Visão geral",
    itens: [{ rotulo: "Início", href: "/painel" }],
  },
  {
    titulo: "Pessoas",
    itens: [
      { rotulo: "Caixa de entrada", href: "/painel/caixa-entrada", permissao: "submissoes.ler", contador: "caixaEntrada", alerta: true },
      { rotulo: "Pessoas", href: "/painel/pessoas", permissao: "pessoas.ler" },
      { rotulo: "Pedidos de oração", href: "/painel/oracao", permissao: "oracao.ler", contador: "oracoes" },
      { rotulo: "Batismos", href: "/painel/batismos", permissao: "batismos.ler", contador: "batismos" },
      { rotulo: "Células", href: "/painel/celulas", permissao: "celulas.ler" },
    ],
  },
  {
    titulo: "Conteúdo",
    itens: [
      { rotulo: "Site da igreja", href: "/painel/site", permissao: "site.editar" },
      { rotulo: "Transmissão ao vivo", href: "/painel/ao-vivo", permissao: "site.editar" },
      { rotulo: "Mensagens", href: "/painel/mensagens", permissao: "mensagens.gerenciar" },
      { rotulo: "Agenda", href: "/painel/agenda", permissao: "agenda.gerenciar" },
      { rotulo: "Escola", href: "/painel/cursos", permissao: "cursos.gerenciar" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Usuários e papéis", href: "/painel/usuarios", permissao: "usuarios.gerenciar" },
      { rotulo: "Configurações", href: "/painel/configuracoes", permissao: "config.gerenciar" },
      { rotulo: "Auditoria", href: "/painel/auditoria", permissao: "auditoria.ler" },
    ],
  },
];

export function LateralPainel({
  nomeIgreja,
  nomeUsuario,
  papel,
  contadores,
}: {
  nomeIgreja: string;
  nomeUsuario: string;
  papel: Papel;
  contadores: { caixaEntrada: number; oracoes: number; batismos: number };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "x-csrf-token": lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "",
      },
    });
    router.replace("/login");
    router.refresh();
  }

  const rotulosPapel: Record<Papel, string> = {
    ADMIN: "Administrador",
    PASTOR: "Pastor",
    SECRETARIA: "Secretaria",
    LIDER_CELULA: "Líder de célula",
    MEMBRO: "Membro",
  };

  return (
    <aside className="painel__lateral">
      <div className="painel__marca">
        <small>Painel</small>
        {nomeIgreja}
      </div>

      <nav className="painel__nav" aria-label="Menu do painel">
        {NAVEGACAO.map((grupo) => {
          const visiveis = grupo.itens.filter(
            (item) => !item.permissao || papelTem(papel, item.permissao),
          );
          if (visiveis.length === 0) return null;

          return (
            <div key={grupo.titulo}>
              <p className="painel__grupo">{grupo.titulo}</p>
              {visiveis.map((item) => {
                const ativo =
                  item.href === "/painel"
                    ? pathname === "/painel"
                    : pathname.startsWith(item.href);
                const valor = item.contador ? contadores[item.contador] : 0;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="painel__link"
                    aria-current={ativo ? "page" : undefined}
                  >
                    <span>{item.rotulo}</span>
                    {valor > 0 && (
                      <span className={`painel__badge${item.alerta ? " painel__badge--alerta" : ""}`}>
                        {valor > 99 ? "99+" : valor}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", paddingTop: "1.4rem", borderTop: "1px solid var(--line-on-dark)" }}>
        <p style={{ fontSize: ".85rem", fontWeight: 600 }}>{nomeUsuario}</p>
        <p style={{ fontSize: ".7rem", color: "var(--bone-faint)", letterSpacing: ".1em", textTransform: "uppercase", marginTop: ".15rem" }}>
          {rotulosPapel[papel]}
        </p>

        <div style={{ display: "grid", gap: ".4rem", marginTop: "1rem" }}>
          <Link href="/" className="painel__link" style={{ padding: ".45rem .8rem" }}>
            Ver o site
          </Link>
          <Link href="/painel/minha-conta" className="painel__link" style={{ padding: ".45rem .8rem" }}>
            Minha conta
          </Link>
          <button
            type="button"
            onClick={sair}
            className="painel__link"
            style={{ padding: ".45rem .8rem", width: "100%", textAlign: "left" }}
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}
