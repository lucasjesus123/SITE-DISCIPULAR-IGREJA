import Link from "next/link";
import { CreditoConexao } from "@/components/CreditoConexao";
import type { ItemMenu, RodapeColuna } from "@/lib/site/conteudo-home";

/**
 * Nav + rodapé Institucional para as páginas INTERNAS do site (mensagens,
 * células, escola, contato…). Dá a mesma cara da home sem tocar no corpo antigo
 * de cada página (classes .ins-hd/.ins-ft são exclusivas — sem vazar estilo).
 *
 * Os links do menu apontam para a HOME com âncora (/#secao), então funcionam de
 * qualquer página interna.
 */

interface Props {
  nome: string;
  logo: string | null;
  aoVivo: boolean;
  socials: { instagram: string | null; youtube: string | null; whatsapp: string | null };
  /** Mesmo menu editável da home. Âncora (#x) vira /#x para funcionar da interna. */
  menu?: ItemMenu[];
  /** Colunas de links do rodapé (mesmo conteúdo editável da home). */
  rodape?: RodapeColuna[];
  children: React.ReactNode;
}

/** Âncora de seção da home (#novo) vira /#novo; link normal fica igual. */
function destino(href: string): string {
  return href.startsWith("#") ? `/${href}` : href;
}

export function ChromeInstitucional({ nome, logo, aoVivo, socials, menu, rodape, children }: Props) {
  const itens = menu && menu.length > 0 ? menu : null;
  const colunas = rodape && rodape.length > 0 ? rodape : null;
  return (
    <>
      <header className="ins-hd">
        <div className="ins-hd__in">
          <Link href="/" className="ins-hd__brand">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="ins-hd__logo" />
            ) : (
              <>
                <span className="ins-hd__mark">{nome.charAt(0)}</span>
                <span className="ins-hd__nome">{nome}</span>
              </>
            )}
          </Link>
          <ul className="ins-hd__menu">
            {itens ? (
              itens.map((m, i) => (<li key={i}><Link href={destino(m.href)}>{m.label}</Link></li>))
            ) : (
              <>
                <li><Link href="/#novo">Novo por aqui</Link></li>
                <li><Link href="/mensagens">Mensagens</Link></li>
                <li><Link href="/#minis">Ministérios</Link></li>
                <li><Link href="/app">App</Link></li>
                <li><Link href="/#passos">Próximos Passos</Link></li>
                <li><Link href="/contribua">Contribua</Link></li>
                <li><Link href="/agenda">Agenda</Link></li>
              </>
            )}
          </ul>
          <div className="ins-hd__cta">
            {aoVivo && <Link href="/#mensagem" className="ins-hd__live"><span className="dot" />AO VIVO</Link>}
          </div>
        </div>
      </header>

      <main id="conteudo">{children}</main>

      <footer className="ins-ft">
        <div className="ins-ft__in">
          <div className="ins-ft__top">
            <Link href="/" className="ins-ft__brand">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={nome} />
              ) : (
                <b>{nome}</b>
              )}
            </Link>
            <div className="ins-ft__cols">
              {colunas ? (
                colunas.map((col, i) => (
                  <div key={i}>
                    <h4>{col.titulo}</h4>
                    {col.links.map((l, j) => (<Link key={j} href={destino(l.href)}>{l.label}</Link>))}
                  </div>
                ))
              ) : (
                <>
                  <div>
                    <h4>Igreja</h4>
                    <Link href="/#novo">Novo por aqui</Link>
                    <Link href="/#minis">Ministérios</Link>
                    <Link href="/agenda">Agenda</Link>
                  </div>
                  <div>
                    <h4>Participe</h4>
                    <Link href="/mensagens">Mensagens</Link>
                    <Link href="/contribua">Contribua</Link>
                    <Link href="/app">Área do membro</Link>
                  </div>
                </>
              )}
              <div>
                <h4>Redes</h4>
                {socials.instagram && <a href={socials.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
                {socials.youtube && <a href={socials.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>}
                {socials.whatsapp && <a href={`https://wa.me/${socials.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              </div>
            </div>
          </div>
          <div className="ins-ft__copy">© {nome}. Todos os direitos reservados. · <CreditoConexao /></div>
        </div>
      </footer>
    </>
  );
}
