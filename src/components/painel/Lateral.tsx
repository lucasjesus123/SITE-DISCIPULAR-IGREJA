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
      { rotulo: "Acompanhamento", href: "/painel/acompanhamento", permissao: "pessoas.ler" },
      { rotulo: "Kids", href: "/painel/kids", permissao: "kids.gerenciar" },
      { rotulo: "Louvor", href: "/painel/louvor", permissao: "louvor.gerenciar" },
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
      { rotulo: "WhatsApp", href: "/painel/whatsapp", permissao: "whatsapp.gerenciar" },
      { rotulo: "Automações", href: "/painel/automacoes", permissao: "automacoes.gerenciar" },
      { rotulo: "Disparos", href: "/painel/disparos", permissao: "automacoes.gerenciar" },
      { rotulo: "Agenda", href: "/painel/agenda", permissao: "agenda.gerenciar" },
      { rotulo: "Escola", href: "/painel/cursos", permissao: "cursos.gerenciar" },
      { rotulo: "Inscrições", href: "/painel/inscricoes", permissao: "inscricoes.gerenciar" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Financeiro", href: "/painel/financeiro", permissao: "financeiro.gerenciar" },
      { rotulo: "Pagamentos (PIX)", href: "/painel/pagamentos", permissao: "config.gerenciar" },
      { rotulo: "App de Membros", href: "/painel/configuracoes-app", permissao: "config.gerenciar" },
      { rotulo: "Usuários e papéis", href: "/painel/usuarios", permissao: "usuarios.gerenciar" },
      { rotulo: "Configurações", href: "/painel/configuracoes", permissao: "config.gerenciar" },
      { rotulo: "Auditoria", href: "/painel/auditoria", permissao: "auditoria.ler" },
    ],
  },
];

export function LateralPainel({
  nomeIgreja,
  logoUrl,
  nomeUsuario,
  papel,
  contadores,
}: {
  nomeIgreja: string;
  logoUrl?: string | null;
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
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={logoUrl} alt={nomeIgreja} className="painel__logo" />
        ) : (
          <>
            <small>Painel</small>
            {nomeIgreja}
          </>
        )}
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
                    <span className="painel__link-in">
                      <Ico nome={item.href} />
                      <span>{item.rotulo}</span>
                    </span>
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

      <div className="painel__rodape">
        <p className="painel__rodape-nome">{nomeUsuario}</p>
        <p className="painel__rodape-papel">{rotulosPapel[papel]}</p>

        <div style={{ display: "grid", gap: ".2rem", marginTop: "0.9rem" }}>
          <Link href="/app" className="painel__link">
            <span className="painel__link-in"><Ico nome="/painel/configuracoes-app" /><span>Abrir o App da Igreja</span></span>
          </Link>
          <Link href="/" className="painel__link">
            <span className="painel__link-in"><Ico nome="ver-site" /><span>Ver o site</span></span>
          </Link>
          <Link href="/painel/minha-conta" className="painel__link">
            <span className="painel__link-in"><Ico nome="/painel/minha-conta" /><span>Minha conta</span></span>
          </Link>
          <button type="button" onClick={sair} className="painel__link" style={{ width: "100%", textAlign: "left" }}>
            <span className="painel__link-in"><Ico nome="sair" /><span>Sair</span></span>
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Ícone do item do menu (traço fino, herda a cor por currentColor). */
function Ico({ nome }: { nome: string }) {
  const d: Record<string, React.ReactNode> = {
    "/painel": <path d="M3 11.5 12 4l9 7.5M5 10v10h14V10" />,
    "/painel/caixa-entrada": <><path d="M3 12h5l2 3h4l2-3h5" /><path d="M4 6h16v12H4z" /></>,
    "/painel/pessoas": <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><path d="M16 15c2.5 0 5 1.5 5 5" /><circle cx="17" cy="8" r="2.3" /></>,
    "/painel/acompanhamento": <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="11" rx="1" /><rect x="17" y="4" width="4" height="7" rx="1" /></>,
    "/painel/kids": <><circle cx="12" cy="7" r="3" /><path d="M6 21v-2a6 6 0 0 1 12 0v2" /><path d="M9 12l-2 3M15 12l2 3" /></>,
    "/painel/louvor": <><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
    "/painel/oracao": <path d="M12 21s-7-4.5-9.2-9C1.3 8.6 3.3 5.5 6.6 5.5c1.9 0 3.5 1.1 4.4 2.6l1 1.6 1-1.6c.9-1.5 2.5-2.6 4.4-2.6 3.3 0 5.3 3.1 3.8 6.5C19 16.5 12 21 12 21z" />,
    "/painel/batismos": <path d="M12 3c3 4 6 7 6 10.5A6 6 0 1 1 6 13.5C6 10 9 7 12 3z" />,
    "/painel/celulas": <><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="12" cy="18" r="2.4" /><path d="M7.5 7.7 11 15.8M16.5 7.7 13 15.8M8.4 6h7.2" /></>,
    "/painel/site": <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.4 2.6 15.6 0 18M12 3c-2.6 2.4-2.6 15.6 0 18" /></>,
    "/painel/ao-vivo": <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    "/painel/mensagens": <path d="M4 5h16v11H8l-4 3z" />,
    "/painel/automacoes": <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" /><circle cx="12" cy="12" r="3.2" /></>,
    "/painel/disparos": <><path d="M4 4l16 8-16 8 3-8-3-8z" /><path d="M7 12h13" /></>,
    "/painel/whatsapp": <><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.7-1.2A9 9 0 1 0 12 3z" /><path d="M8.5 8.8c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.6l-.5.6c-.1.1-.2.3 0 .6.3.5.8 1.1 1.5 1.5.3.2.5.1.6 0l.5-.6c.2-.2.4-.2.6-.1l1.3.7c.3.2.4.3.4.5s0 .9-.4 1.3c-.4.4-1 .7-1.6.6-1.4-.2-3-1-4.2-2.4-1-1.2-1.6-2.5-1.6-3.6 0-.6.2-1 .5-1.3z" fill="currentColor" stroke="none" /></>,
    "/painel/agenda": <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9h17M8 3v4M16 3v4" /></>,
    "/painel/cursos": <><path d="M4 5.5A2 2 0 0 1 6 4h6v15H6a2 2 0 0 0-2 1.5z" /><path d="M20 5.5A2 2 0 0 0 18 4h-6v15h6a2 2 0 0 1 2 1.5z" /></>,
    "/painel/inscricoes": <><path d="M9 5h6a2 2 0 0 1 2 2v13l-5-3-5 3V7a2 2 0 0 1 2-2z" /><path d="M9.5 10.5l1.5 1.5 3-3.5" /></>,
    "/painel/financeiro": <><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3 9.5h18" /><circle cx="16.5" cy="14" r="1.4" /></>,
    "/painel/configuracoes-app": <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
    "/painel/pagamentos": <><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M2.5 10h19M6 14h4" /></>,
    "/painel/usuarios": <><circle cx="10" cy="8" r="3" /><path d="M4 20c0-3.3 2.7-5 6-5s6 1.7 6 5" /><circle cx="18.5" cy="17.5" r="2.5" /><path d="M18.5 13.5v1M18.5 20.5v1M22 17.5h-1M16 17.5h-1" /></>,
    "/painel/configuracoes": <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></>,
    "/painel/auditoria": <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    "/painel/minha-conta": <><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" /></>,
    "ver-site": <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></>,
    "sair": <><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  };
  return (
    <svg className="painel__ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d[nome] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}
