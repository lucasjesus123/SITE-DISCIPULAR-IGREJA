import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { Campo, CampoMarcacao, CampoTexto, Formulario } from "@/components/site/Formulario";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a gente. Responderemos assim que possível.",
};

export const dynamic = "force-dynamic";

/**
 * O `src` do mapa é validado antes de virar iframe.
 * Só aceitamos o domínio de embed do Google Maps: um `mapaEmbedUrl` arbitrário
 * salvo no painel poderia embutir uma página hostil dentro do site da igreja.
 */
function mapaSeguro(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "www.google.com" && u.hostname !== "maps.google.com") return null;
    if (!u.pathname.startsWith("/maps/embed")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export default async function PaginaContato() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const { config, campi } = dados;

  return (
    <>
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Contato</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            Vamos nos <span className="serif-italic gold">conhecer</span>.
          </h1>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container">
          <div className="grid cols-2" style={{ alignItems: "start", gap: "clamp(2.5rem, 5vw, 5rem)" }}>
            <div>
              <p className="eyebrow">Como falar com a gente</p>
              <h2 style={{ marginTop: "1rem", marginBottom: "2rem" }}>Estamos por perto.</h2>

              {config.telefoneContato && (
                <div className="info-line">
                  <div className="ic" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="k">Telefone</p>
                    <p className="v">
                      <a href={`tel:${config.telefoneContato.replace(/\D/g, "")}`}>{config.telefoneContato}</a>
                    </p>
                  </div>
                </div>
              )}

              {config.emailContato && (
                <div className="info-line">
                  <div className="ic" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="m3 7 9 6 9-6" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <p className="k">E-mail</p>
                    <p className="v">
                      <a href={`mailto:${config.emailContato}`}>{config.emailContato}</a>
                    </p>
                  </div>
                </div>
              )}

              {campi.map((campus) => (
                <div className="info-line" key={campus.id}>
                  <div className="ic" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" strokeLinejoin="round" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </div>
                  <div>
                    <p className="k">{campus.nome}</p>
                    <p className="v" style={{ fontSize: "var(--step-0)" }}>
                      {[campus.logradouro, campus.numero].filter(Boolean).join(", ")}
                    </p>
                    <p className="sub">
                      {[campus.bairro, campus.cidade, campus.uf].filter(Boolean).join(", ")}
                    </p>
                  </div>
                </div>
              ))}

              {campi[0] && mapaSeguro(campi[0].mapaEmbedUrl) && (
                <div className="frame" style={{ marginTop: "2.5rem" }}>
                  <iframe
                    src={mapaSeguro(campi[0].mapaEmbedUrl)!}
                    title={`Mapa — ${campi[0].nome}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    sandbox="allow-scripts allow-same-origin allow-popups"
                  />
                </div>
              )}
            </div>

            <div>
              <p className="eyebrow">Envie uma mensagem</p>
              <h2 style={{ marginTop: "1rem", marginBottom: "2rem" }}>Fale conosco.</h2>

              <Formulario tipo="contato" textoBotao="Enviar mensagem">
                <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />
                <Campo nome="email" rotulo="E-mail" tipo="email" obrigatorio autoComplete="email" maxLength={254} />
                <Campo nome="telefone" rotulo="Telefone" tipo="tel" autoComplete="tel" maxLength={20} />
                <Campo nome="assunto" rotulo="Assunto" obrigatorio maxLength={160} />
                <CampoTexto nome="mensagem" rotulo="Mensagem" obrigatorio linhas={6} maxLength={3000} />
                <CampoMarcacao
                  nome="consentimentoLgpd"
                  obrigatorio
                  rotulo="Autorizo o tratamento dos meus dados para responder este contato."
                />
              </Formulario>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
