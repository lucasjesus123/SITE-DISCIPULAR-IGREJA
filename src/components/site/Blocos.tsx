import Link from "next/link";
import type { Bloco } from "@/lib/validation/blocos";
import type { AgendaPublica, CampusPublico } from "@/lib/services/site";
import { nomeDia } from "@/lib/services/site";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { PlayerAoVivo, type EstadoLive } from "@/components/site/AoVivo";
import { FormularioPorTipo } from "@/components/site/FormularioPorTipo";

/**
 * Renderizador dos blocos de conteúdo.
 *
 * TODO texto passa como children do JSX, então o React o escapa. Não há um
 * único `dangerouslySetInnerHTML` neste arquivo — e não deve haver.
 *
 * Links internos também são checados: `linkSeguro()` recusa qualquer coisa
 * que não seja caminho relativo ou http(s), fechando a porta para
 * `javascript:` num campo de link do editor.
 */

function linkSeguro(href: string | undefined): string | null {
  if (!href) return null;
  const v = href.trim();
  // Caminho interno.
  if (v.startsWith("/") && !v.startsWith("//")) return v;
  // Âncora.
  if (v.startsWith("#")) return v;
  try {
    const u = new URL(v);
    if (u.protocol === "https:" || u.protocol === "http:") return u.toString();
  } catch {
    /* ignora */
  }
  return null;
}

function classeTema(tema: string | undefined): string {
  if (tema === "escuro") return "theme-dark";
  if (tema === "creme") return "theme-cream";
  return "theme-light";
}

/** Converte texto puro em parágrafos. NÃO interpreta HTML. */
function Paragrafos({ texto }: { texto: string }) {
  return (
    <>
      {texto
        .split(/\n{2,}/)
        .filter((p) => p.trim().length > 0)
        .map((paragrafo, i) => (
          <p key={i} style={{ marginBottom: "1.1em" }}>
            {/* Quebras simples viram <br />, ainda sem HTML do usuário. */}
            {paragrafo.split("\n").map((linha, j, arr) => (
              <span key={j}>
                {linha}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        ))}
    </>
  );
}

export interface ContextoBlocos {
  agenda: AgendaPublica[];
  campi: CampusPublico[];
  estadoLive: EstadoLive;
}

export function RenderizarBlocos({
  blocos,
  contexto,
}: {
  blocos: Bloco[];
  contexto: ContextoBlocos;
}) {
  return (
    <>
      {blocos.map((bloco, indice) => (
        <RenderizarBloco key={indice} bloco={bloco} contexto={contexto} />
      ))}
    </>
  );
}

function RenderizarBloco({ bloco, contexto }: { bloco: Bloco; contexto: ContextoBlocos }) {
  switch (bloco.tipo) {
    case "hero": {
      const imagem = bloco.imagemId ? urlArquivoPublico(bloco.imagemId) : null;
      const cta = linkSeguro(bloco.ctaLink);
      return (
        <section className="hero">
          {imagem && (
            <div className="hero__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagem} alt="" aria-hidden="true" />
            </div>
          )}
          <div className="hero__veu" aria-hidden="true" />
          <div className="hero__conteudo">
            <div className="container container--wide">
              {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
              <h1 className="hero__titulo" style={{ marginTop: "1.2rem" }}>
                {bloco.titulo}
              </h1>
              {bloco.subtitulo && <p className="hero__sub">{bloco.subtitulo}</p>}
              {cta && bloco.ctaTexto && (
                <div className="hero__acoes">
                  <Link href={cta} className="btn btn--lg">
                    {bloco.ctaTexto}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </section>
      );
    }

    case "texto":
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container container--narrow">
            {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
            {bloco.titulo && (
              <h2 style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>{bloco.titulo}</h2>
            )}
            <div className="measure dim">
              <Paragrafos texto={bloco.corpo} />
            </div>
          </div>
        </section>
      );

    case "citacao":
      return (
        <section className={`section section--tight ${classeTema(bloco.tema)}`}>
          <div className="container container--narrow centro">
            <p className="pullquote">
              <span className="accent">&ldquo;</span>
              {bloco.texto}
              <span className="accent">&rdquo;</span>
            </p>
            {bloco.autor && <p className="pullquote__by">{bloco.autor}</p>}
          </div>
        </section>
      );

    case "cards":
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container">
            {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
            {bloco.titulo && (
              <h2 style={{ marginTop: "1.2rem", marginBottom: "2.5rem" }}>{bloco.titulo}</h2>
            )}
            <div className={`grid cols-${bloco.colunas}`}>
              {bloco.itens.map((item, i) => {
                const href = linkSeguro(item.link);
                const imagem = item.imagemId ? urlArquivoPublico(item.imagemId) : null;
                return (
                  <article className="card" key={i}>
                    {imagem && (
                      <div className="frame" style={{ marginBottom: ".8rem" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={imagem}
                          alt=""
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </div>
                    )}
                    <p className="index-tag">{String(i + 1).padStart(2, "0")}</p>
                    <h3 className="card__titulo">{item.titulo}</h3>
                    {item.texto && <p className="card__texto">{item.texto}</p>}
                    {href && (
                      <Link href={href} className="link" style={{ marginTop: "auto", paddingTop: "1.2rem" }}>
                        {item.linkTexto ?? "Saiba mais"} <span aria-hidden="true">→</span>
                      </Link>
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      );

    case "lista":
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container container--narrow">
            {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
            {bloco.titulo && (
              <h2 style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>{bloco.titulo}</h2>
            )}
            {bloco.itens.map((item, i) => (
              <div className="value" key={i}>
                <span className="value__idx">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="value__title">{item.titulo}</p>
                  {item.texto && <p className="value__text">{item.texto}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      );

    case "imagem": {
      const url = urlArquivoPublico(bloco.imagemId);
      if (!url) return null;
      return (
        <section className={`section section--tight ${classeTema(bloco.tema)}`}>
          <div className="container">
            <div className="frame" style={{ aspectRatio: bloco.proporcao }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={bloco.legenda ?? ""}
                loading="lazy"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            {bloco.legenda && (
              <p className="dim centro" style={{ marginTop: ".9rem", fontSize: ".85rem" }}>
                {bloco.legenda}
              </p>
            )}
          </div>
        </section>
      );
    }

    case "video":
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container container--narrow">
            {bloco.titulo && <h2 style={{ marginBottom: "2rem" }}>{bloco.titulo}</h2>}
            <div className="frame">
              <iframe
                // URL montada a partir do ID já validado por regex. Nunca de
                // uma URL vinda do banco.
                src={`https://www.youtube-nocookie.com/embed/${bloco.youtubeVideoId}?rel=0&modestbranding=1`}
                title={bloco.titulo ?? "Vídeo"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>
        </section>
      );

    case "formulario":
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container container--narrow">
            {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
            {bloco.titulo && (
              <h2 style={{ marginTop: "1.2rem", marginBottom: "1rem" }}>{bloco.titulo}</h2>
            )}
            {bloco.descricao && (
              <p className="lead" style={{ marginBottom: "2.5rem" }}>
                {bloco.descricao}
              </p>
            )}
            <FormularioPorTipo tipo={bloco.formulario} />
          </div>
        </section>
      );

    case "cta": {
      const href = linkSeguro(bloco.botaoLink);
      return (
        <section
          className={`section section--tight ${classeTema(bloco.tema)}`}
          // corFundo passou por `corHex` na validação: só aceita #RGB/#RRGGBB.
          style={bloco.corFundo ? { background: bloco.corFundo } : undefined}
        >
          <div className="container container--narrow centro stack">
            <h2>{bloco.titulo}</h2>
            {bloco.texto && <p className="lead">{bloco.texto}</p>}
            {href && (
              <div style={{ marginTop: "1rem" }}>
                <Link href={href} className="btn btn--lg">
                  {bloco.botaoTexto}
                </Link>
              </div>
            )}
          </div>
        </section>
      );
    }

    case "agenda":
      if (contexto.agenda.length === 0) return null;
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container">
            {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
            {bloco.titulo && (
              <h2 style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>{bloco.titulo}</h2>
            )}
            {contexto.agenda.map((item) => (
              <div className="info-line" key={item.id}>
                <div className="ic" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="k">{nomeDia(item.diaSemana)}</p>
                  <p className="v">{item.titulo}</p>
                  <p className="sub">{[item.horario, item.campusNome].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      );

    case "campi":
      if (contexto.campi.length === 0) return null;
      return (
        <section className={`section ${classeTema(bloco.tema)}`}>
          <div className="container">
            {bloco.eyebrow && <p className="eyebrow">{bloco.eyebrow}</p>}
            {bloco.titulo && (
              <h2 style={{ marginTop: "1.2rem", marginBottom: "2.5rem" }}>{bloco.titulo}</h2>
            )}
            <div className="grid cols-2">
              {contexto.campi.map((campus, i) => (
                <article className="card" key={campus.id}>
                  <p className="index-tag">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="card__titulo">{campus.nome}</h3>
                  <p className="card__texto">
                    {[campus.logradouro, campus.numero].filter(Boolean).join(", ")}
                    {campus.bairro && ` – ${campus.bairro}`}
                    {campus.cidade && `, ${campus.cidade}`}
                    {campus.uf && `/${campus.uf}`}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      );

    case "aoVivo":
      return (
        <section className={`section ${classeTema(bloco.tema)}`} id="ao-vivo">
          <div className="container container--narrow">
            {bloco.titulo && <h2 style={{ marginBottom: "1rem" }}>{bloco.titulo}</h2>}
            {bloco.descricao && (
              <p className="lead" style={{ marginBottom: "2rem" }}>
                {bloco.descricao}
              </p>
            )}
            <PlayerAoVivo inicial={contexto.estadoLive} />
          </div>
        </section>
      );

    default:
      // Bloco de tipo desconhecido (versão futura do editor lida por uma
      // versão antiga do app): não renderiza nada, não quebra a página.
      return null;
  }
}
