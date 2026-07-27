import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import {
  carregarDadosSite,
  carregarMensagens,
  formatarPreco,
  nomeDia,
} from "@/lib/services/site";
import { estadoAoVivo, urlMiniatura } from "@/lib/youtube/live";
import { PlayerAoVivo } from "@/components/site/AoVivo";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Home do site da igreja.
 *
 * Estrutura espelhada no HTML de referência: hero cinematográfico, essência,
 * próximos passos (Células / Escola / Contribua), pastores, agenda e
 * endereços, mensagens com bloco AO VIVO, e contribuição.
 *
 * Todo texto vem do banco com fallback. Nenhum `dangerouslySetInnerHTML` em
 * conteúdo de usuário — o React escapa tudo automaticamente, que é a defesa
 * contra XSS armazenado vinda de graça.
 */

export default async function Home() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados, mensagens, live] = await Promise.all([
    carregarDadosSite(tenant.id),
    carregarMensagens(tenant.id, 3),
    estadoAoVivo(tenant.id),
  ]);

  const { config, campi, agenda, cursos } = dados;
  const heroImagem = config.heroImagemId ? urlArquivoPublico(config.heroImagemId) : null;
  const ultima = mensagens[0];

  return (
    <>
      {/* ---------------------------------------------------------------- HERO */}
      <section className="hero">
        {heroImagem && (
          <div className="hero__media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImagem} alt="" aria-hidden="true" fetchPriority="high" />
          </div>
        )}
        <div className="hero__veu" aria-hidden="true" />

        <div className="hero__conteudo">
          <div className="container container--wide">
            {config.heroEyebrow && <p className="eyebrow">{config.heroEyebrow}</p>}

            <h1 className="hero__titulo" style={{ marginTop: "1.2rem" }}>
              {config.heroTitulo ?? config.nomeExibicao}
            </h1>

            {(config.heroSubtitulo ?? config.tagline) && (
              <p className="hero__sub">{config.heroSubtitulo ?? config.tagline}</p>
            )}

            <div className="hero__acoes">
              <Link href={config.heroCtaLink ?? "/quem-somos"} className="btn btn--lg">
                {config.heroCtaTexto ?? "Conheça mais"}
              </Link>
              <Link href="/visita" className="btn btn--lg btn--ghost">
                Quero visitar
              </Link>
            </div>

            <div className="hero__fatos">
              <div>
                <p className="hero__fato-k">Onde estamos</p>
                <p className="hero__fato-v">
                  {campi.length > 0
                    ? campi.map((c) => c.cidade).filter(Boolean).join(" · ")
                    : "Em breve"}
                </p>
              </div>
              <div>
                <p className="hero__fato-k">Rede de células</p>
                <p className="hero__fato-v">Pequenos grupos</p>
              </div>
              <div>
                <p className="hero__fato-k">Formação</p>
                <p className="hero__fato-v">Escola de discipulado</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ ESSÊNCIA */}
      <section className="section theme-light">
        <div className="container">
          <div className="grid cols-2" style={{ alignItems: "start" }}>
            <div>
              <p className="eyebrow">{config.nomeExibicao}</p>
              <h2 style={{ marginTop: "1.2rem" }}>
                Uma casa de <span className="serif-italic gold">discípulos</span>.
              </h2>
            </div>
            <div className="stack">
              <p className="lead">
                {config.tagline ??
                  "Somos uma comunidade de discípulos de Jesus. Professamos a fé apostólica e vivemos como família de Deus."}
              </p>
              <Link href="/quem-somos" className="link">
                Conheça mais <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ PRÓXIMOS PASSOS */}
      <section className="section theme-dark">
        <div className="container">
          <div className="centro" style={{ marginBottom: "clamp(2.5rem, 5vw, 4rem)" }}>
            <p className="eyebrow eyebrow--centered">Comece por aqui</p>
            <h2 style={{ marginTop: "1.2rem" }}>Dê o seu próximo passo conosco.</h2>
            <p className="lead measure" style={{ marginInline: "auto", marginTop: "1.2rem" }}>
              Seja qual for o seu momento de fé, há um caminho para você caminhar em comunidade.
            </p>
          </div>

          <div className="grid cols-3">
            <ProximoPasso
              indice="01"
              titulo="Células"
              texto="A igreja reunida em pequenos grupos, perto de você, para adorar, ouvir a Palavra e interceder."
              href="/celulas"
              cta="Encontre uma célula"
            />
            <ProximoPasso
              indice="02"
              titulo="Escola"
              texto="Fundamentos sólidos para uma fé que sustenta a vida — conhecer no que se crê e por quê."
              href="/escola"
              cta="Faça sua inscrição"
            />
            <ProximoPasso
              indice="03"
              titulo="Contribua"
              texto="Sua generosidade avança a proclamação do Evangelho. Juntos, construímos uma história com e para Jesus."
              href="/contribua"
              cta="Seja generoso"
            />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ AGENDA / CAMPI */}
      {(agenda.length > 0 || campi.length > 0) && (
        <section className="section theme-cream">
          <div className="container">
            <p className="eyebrow">Onde estamos</p>
            <h2 style={{ marginTop: "1.2rem" }}>Nossos encontros.</h2>
            <p className="lead measure" style={{ marginTop: "1.2rem" }}>
              Você é bem-vindo exatamente como está. Escolha o melhor dia para a sua primeira visita.
            </p>

            {agenda.length > 0 && (
              <div style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
                {agenda.slice(0, 8).map((item) => (
                  <div className="info-line" key={item.id}>
                    <div className="ic" aria-hidden="true">
                      <IconeRelogio />
                    </div>
                    <div>
                      <p className="k">
                        {item.dataHora
                          ? new Intl.DateTimeFormat("pt-BR", {
                              day: "2-digit",
                              month: "long",
                            }).format(item.dataHora)
                          : nomeDia(item.diaSemana)}
                      </p>
                      <p className="v">{item.titulo}</p>
                      {(item.horario || item.campusNome || item.descricao) && (
                        <p className="sub">
                          {[item.horario, item.campusNome, item.descricao]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {campi.length > 0 && (
              <div className="grid cols-2" style={{ marginTop: "clamp(2.5rem, 5vw, 4rem)" }}>
                {campi.map((campus, i) => (
                  <article className="card" key={campus.id}>
                    <p className="index-tag">{String(i + 1).padStart(2, "0")}</p>
                    <h3 className="card__titulo">{campus.nome}</h3>
                    <p className="card__texto">
                      {[campus.logradouro, campus.numero].filter(Boolean).join(", ")}
                      {campus.bairro && ` – ${campus.bairro}`}
                      {campus.cidade && `, ${campus.cidade}`}
                      {campus.uf && `/${campus.uf}`}
                    </p>
                    {campus.descricao && <p className="card__texto">{campus.descricao}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* -------------------------------------------------- MENSAGENS / AO VIVO */}
      <section className="section theme-dark" id="ao-vivo">
        <div className="container">
          <div className="grid cols-2" style={{ alignItems: "center" }}>
            <div className="stack">
              <p className="eyebrow">Mensagens</p>
              <h2>Palavra que transforma.</h2>
              <p className="lead">
                Acompanhe as pregações e assista à transmissão ao vivo dos nossos cultos.
              </p>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: ".6rem" }}>
                <Link href="/mensagens" className="btn btn--outline-gold">
                  Ver mensagens
                </Link>
                {config.youtube && (
                  <a
                    href={config.youtube}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--ghost"
                  >
                    Nosso canal
                  </a>
                )}
              </div>
            </div>

            <div>
              {/* O player decide sozinho entre a live e a última mensagem. */}
              {live.aoVivo ? (
                <PlayerAoVivo
                  inicial={{ aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo }}
                />
              ) : ultima?.youtubeVideoId ? (
                <div className="frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={urlMiniatura(ultima.youtubeVideoId) ?? ""}
                    alt={ultima.titulo}
                    loading="lazy"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              ) : (
                <div className="frame">
                  <div className="frame__placeholder">Em breve</div>
                </div>
              )}

              {ultima && !live.aoVivo && (
                <p className="dim" style={{ marginTop: "1rem", fontSize: ".9rem" }}>
                  Última mensagem: <strong style={{ color: "var(--bone)" }}>{ultima.titulo}</strong>
                  {ultima.preletor && ` — ${ultima.preletor}`}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- ESCOLA */}
      {cursos.length > 0 && (
        <section className="section theme-light">
          <div className="container">
            <p className="eyebrow">Formação</p>
            <h2 style={{ marginTop: "1.2rem" }}>Escola de discipulado.</h2>

            <div className="grid cols-2" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
              {cursos.slice(0, 4).map((curso) => (
                <article className="card" key={curso.id}>
                  {curso.diaSemana !== null && (
                    <p className="index-tag">{nomeDia(curso.diaSemana)}</p>
                  )}
                  <h3 className="card__titulo">{curso.nome}</h3>
                  {curso.resumo && <p className="card__texto">{curso.resumo}</p>}
                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "1.2rem",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="gold" style={{ fontWeight: 600, fontSize: ".9rem" }}>
                      {formatarPreco(curso.precoCentavos, curso.periodicidade) ?? "Gratuito"}
                    </span>
                    {curso.inscricoesAbertas && (
                      <Link href={`/escola#${curso.slug}`} className="btn btn--sm">
                        Inscrever-me
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------- CONTRIBUA */}
      {config.pixChave && (
        <section className="section theme-ink-800" style={{ color: "var(--bone)" }}>
          <div className="container container--narrow centro stack">
            <p className="eyebrow eyebrow--centered">Oferte &amp; Contribua</p>
            <h2>Seja generoso.</h2>
            <p className="lead" style={{ color: "var(--bone-dim)" }}>
              {config.pixDescricao ??
                "Queremos avançar na proclamação do Evangelho, e para isso a sua generosidade é fundamental."}
            </p>
            <Link href="/contribua" className="btn btn--lg" style={{ marginTop: "1rem" }}>
              Contribuir agora
            </Link>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ CONVITE */}
      <section className="section theme-dark">
        <div className="container container--narrow centro stack">
          <p className="pullquote">
            &ldquo;Ide, portanto, e fazei <span className="accent">discípulos</span> de todas as
            nações.&rdquo;
          </p>
          <p className="pullquote__by">Mateus 28.19</p>
          <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/visita" className="btn btn--lg">
              Quero visitar
            </Link>
            <Link href="/oracao" className="btn btn--lg btn--ghost">
              Pedido de oração
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function ProximoPasso({
  indice,
  titulo,
  texto,
  href,
  cta,
}: {
  indice: string;
  titulo: string;
  texto: string;
  href: string;
  cta: string;
}) {
  return (
    <article className="card">
      <p className="index-tag">{indice}</p>
      <h3 className="card__titulo">{titulo}</h3>
      <p className="card__texto">{texto}</p>
      <Link href={href} className="link" style={{ marginTop: "auto", paddingTop: "1.2rem" }}>
        {cta} <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

function IconeRelogio() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
