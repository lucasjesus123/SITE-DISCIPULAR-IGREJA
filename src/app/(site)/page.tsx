import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, carregarMensagens } from "@/lib/services/site";
import { estadoAoVivo, urlMiniatura } from "@/lib/youtube/live";
import { PlayerAoVivo } from "@/components/site/AoVivo";
import { CopiarChave } from "@/components/site/CopiarChave";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Home do site da igreja.
 *
 * Estrutura espelhada na prévia oficial da Discipular (tema Preto & Branco):
 * hero, sobre, faixa, versículo (A Grande Comissão), comece por aqui,
 * pastores, células, escola, endereços, mensagens (com AO VIVO) e contribua.
 *
 * Texto dinâmico vem do banco; o editorial fixo (que é conteúdo da igreja) fica
 * no componente. Nenhum `dangerouslySetInnerHTML` — o React escapa tudo, que é
 * a defesa contra XSS armazenado vinda de graça.
 */

const MARQUEE = ["Adoração", "Palavra", "Comunhão", "Discipulado", "Missão", "Avivamento"];

function formatarCnpj(valor: string | null): string | null {
  if (!valor) return null;
  const d = valor.replace(/\D/g, "");
  if (d.length !== 14) return valor;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default async function Home() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados, mensagens, live] = await Promise.all([
    carregarDadosSite(tenant.id),
    carregarMensagens(tenant.id, 1),
    estadoAoVivo(tenant.id),
  ]);

  const { config, campi } = dados;
  const heroImagem = config.heroImagemId ? urlArquivoPublico(config.heroImagemId) : null;
  const ultima = mensagens[0];
  const cidades = campi.map((c) => c.cidade).filter(Boolean).join(" · ");
  const pixDisplay = formatarCnpj(config.pixChave);
  const mapaCelulas = "https://sites.google.com/view/casasdediscipulos/home";

  return (
    <>
      {/* --------------------------------------------------------------- HERO */}
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
                {config.heroCtaTexto ?? "Conheça mais"} <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className="hero__fatos">
              <div>
                <p className="hero__fato-k">Onde estamos</p>
                <p className="hero__fato-v">{cidades || "Lajeado · Vera Cruz — RS"}</p>
              </div>
              <div>
                <p className="hero__fato-k">Rede de células</p>
                <p className="hero__fato-v">Discipular Células</p>
              </div>
              <div>
                <p className="hero__fato-k">Formação</p>
                <p className="hero__fato-v">Escola Discipular</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- SOBRE */}
      <section className="section theme-light">
        <div className="container split">
          <div className="split__media">
            <div className="frame frame--wide frame__mono">
              <div className="frame__grid" aria-hidden="true" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/mark-dark.png" alt="" aria-hidden="true" />
            </div>
          </div>
          <div className="stack">
            <p className="eyebrow">{config.nomeExibicao}</p>
            <h2>
              Uma casa de <span className="serif-italic accent">discípulos</span>.
            </h2>
            <p className="lead">
              {config.tagline
                ? "Somos uma comunidade de discípulos de Jesus. Professamos a fé apostólica e vivemos como família de Deus. Exercemos nossa vocação da cidade para as nações, gerando vida e transformação."
                : "Somos uma comunidade de discípulos de Jesus."}
            </p>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
              <Link href="/quem-somos" className="btn">
                Conheça mais <span aria-hidden="true">→</span>
              </Link>
              <Link href="/pastores" className="link">
                Pastores <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ MARQUEE */}
      <section className="theme-light marquee" aria-hidden="true">
        <div className="marquee__track">
          {[...MARQUEE, ...MARQUEE].map((palavra, i) => (
            <span key={i} className={`marquee__item${i % 2 === 1 ? " ital" : ""}`}>
              {palavra}
            </span>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- VERSÍCULO */}
      <section className="section theme-dark scripture">
        <div className="container">
          <span className="scripture__mark" aria-hidden="true">
            &ldquo;
          </span>
          <p className="eyebrow eyebrow--centered">A Grande Comissão</p>
          <p className="scripture__text">
            &ldquo;Ide, portanto, e fazei <span className="accent ital">discípulos</span> de todas as
            nações.&rdquo;
          </p>
          <p className="scripture__ref">Mateus 28.19</p>
        </div>
      </section>

      {/* -------------------------------------------------- COMECE POR AQUI */}
      <section className="section theme-light">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Comece por aqui</p>
            <h2>
              Dê o seu próximo passo <span className="serif-italic accent">conosco.</span>
            </h2>
            <p className="lead">
              Seja qual for o seu momento de fé, há um caminho para você caminhar em comunidade.
            </p>
          </div>
          <div className="grid cols-3" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            <ProximoPasso indice="01" titulo="Células" href="/celulas" cta="Encontre uma célula"
              texto="A igreja reunida em pequenos grupos, perto de você, para adorar, ouvir a Palavra e interceder." />
            <ProximoPasso indice="02" titulo="Escola Discipular" href="/escola" cta="Faça sua inscrição"
              texto="Teologia Discipular e Trilha Discipular: fundamentos sólidos para uma fé que sustenta a vida." />
            <ProximoPasso indice="03" titulo="Contribua" href="/contribua" cta="Seja generoso"
              texto="Sua generosidade avança a proclamação do Evangelho. Juntos, construímos uma história com e para Jesus." />
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- PASTORES */}
      <section className="section theme-dark">
        <div className="container split split--reverse">
          <div className="split__media" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <FrameRetrato legenda="Pr. Tiago" />
            <FrameRetrato legenda="Pra. Cássia" />
          </div>
          <div className="stack">
            <p className="eyebrow">Nossos Pastores</p>
            <h2>
              Tiago &amp; Cássia <span className="serif-italic accent">Facchi</span>
            </h2>
            <p className="lead">
              Um chamado abraçado desde cedo e vivido como família. Pastores que creem que o Reino de
              Deus se expande em todas as esferas de influência.
            </p>
            <p>
              Tiago entrou no ministério aos 16 anos e serve como pastor, advogado e empresário.
              Cássia, filha de missionários, está no ministério desde a infância. Juntos, são pais de
              Lorenzo e Valentina.
            </p>
            <div>
              <Link href="/pastores" className="btn btn--outline-gold">
                Conheça os pastores <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ CÉLULAS */}
      <section className="section theme-light">
        <div className="container split">
          <div className="stack">
            <p className="eyebrow">Discipular Células</p>
            <h2>
              A igreja em <span className="serif-italic accent">pequenos grupos.</span>
            </h2>
            <p className="lead">
              A rede celular Discipular Células é a igreja, em comunhão, reunida em pequenos grupos —
              com o propósito de adorar, proclamar a Palavra e interceder.
            </p>
            <ul className="ticks">
              <li>
                <span className="ic"><Check /></span>
                <span><strong>Comunhão real</strong> — relacionamentos que sustentam a fé no dia a dia.</span>
              </li>
              <li>
                <span className="ic"><Check /></span>
                <span><strong>Palavra viva</strong> — a Bíblia aplicada à sua semana, na sua casa.</span>
              </li>
              <li>
                <span className="ic"><Check /></span>
                <span><strong>Intercessão</strong> — um lugar para orar e ser cuidado.</span>
              </li>
            </ul>
            <div>
              <a href={mapaCelulas} target="_blank" rel="noopener noreferrer" className="btn">
                Encontre uma célula <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
          <div className="split__media">
            <div className="frame frame--wide frame__mono">
              <div className="frame__grid" aria-hidden="true" />
              <span className="frame__cap">Discipular Células</span>
              <div className="floating-tag">
                <p className="k">Casas de Discípulos</p>
                <p className="v">Pela cidade toda</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- ESCOLA */}
      <section className="section theme-dark">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Formação</p>
            <h2>
              Escola <span className="serif-italic accent">Discipular.</span>
            </h2>
            <p className="lead">
              Cursos que aprofundam o conhecimento da Palavra e formam discípulos maduros, prontos
              para servir e ensinar.
            </p>
          </div>
          <div className="grid cols-2" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            <CursoCard dia="Segundas-feira · 20h00" nome="Teologia Discipular"
              texto="Um mergulho consistente nas doutrinas da fé cristã, das Escrituras à vida prática — para você conhecer no que crê e por quê." />
            <CursoCard dia="Sextas-feira · 20h00" nome="Trilha Discipular"
              texto="O caminho do discipulado passo a passo: uma trilha de estudo para crescer em intimidade com Deus e maturidade cristã." />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- ENDEREÇOS */}
      <section className="section theme-light">
        <div className="container split split--text-first">
          <div className="stack">
            <p className="eyebrow">Onde estamos</p>
            <h2>
              Nossos <span className="serif-italic accent">endereços.</span>
            </h2>
            <p className="lead">
              Você é bem-vindo exatamente como está. Confira nossos encontros e escolha o melhor dia
              para a sua primeira visita.
            </p>
            <div style={{ marginTop: "1rem" }}>
              <Horario dia="Domingo" titulo="Culto de Celebração" hora="18h30" />
              <Horario dia="Segunda" titulo="Teologia Discipular · Escola" hora="20h00" />
              <Horario dia="Sexta" titulo="Trilha Discipular · Escola" hora="20h00" />
              <Horario dia="Durante a semana" titulo="Células nos lares" hora="Vários horários" />
            </div>
          </div>
          <div className="split__media grid" style={{ gap: "1.2rem" }}>
            {(campi.length > 0
              ? campi
              : [
                  { id: "a", nome: "Sede Lajeado", logradouro: "RSC-453", numero: "1186", bairro: "Floresta", cidade: "Lajeado", uf: "RS", descricao: "Nossa casa principal" },
                  { id: "b", nome: "Campus Vera Cruz", logradouro: "R. Jacob Schneider", numero: "111", bairro: "Centro", cidade: "Vera Cruz", uf: "RS", descricao: "Uma igreja, dois lugares" },
                ]
            ).map((campus, i) => (
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
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
              <Link href="/contato" className="btn">Fale conosco</Link>
              <Link href="/contato" className="link">Ver no mapa <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- MENSAGENS / AO VIVO */}
      <section className="section theme-dark" id="ao-vivo">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Mensagens</p>
            <h2>
              Palavra que <span className="serif-italic accent">transforma.</span>
            </h2>
            <p className="lead">
              A última mensagem, sempre aqui — e a transmissão ao vivo dos nossos cultos.
            </p>
          </div>
          <div style={{ maxWidth: "900px", margin: "clamp(2.5rem, 5vw, 3.5rem) auto 0" }}>
            {live.aoVivo ? (
              <PlayerAoVivo inicial={{ aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo }} />
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
            <div style={{ textAlign: "center", marginTop: "1.6rem" }}>
              {config.youtube && (
                <a href={config.youtube} target="_blank" rel="noopener noreferrer" className="btn btn--outline-gold">
                  Assista mais mensagens
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- CONTRIBUA */}
      <section className="section theme-dark">
        <div className="container split">
          <div className="stack">
            <p className="eyebrow">Oferte &amp; Contribua</p>
            <h2>
              Seja <span className="serif-italic accent">generoso.</span>
            </h2>
            <p className="lead">
              {config.pixDescricao ??
                "Queremos muito avançar na proclamação do Evangelho e, para isso, a sua generosidade é fundamental. Estamos, juntos, construindo uma história com e para Jesus."}
            </p>
            <div>
              <Link href="/contribua" className="btn btn--lg">
                Seja generoso <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
          {config.pixChave && (
            <div className="split__media">
              <div className="pix-card">
                <div className="pix-card__head">
                  <span className="pix-badge">PIX</span>
                  <span className="pix-card__owner">{config.pixTitular ?? config.nomeExibicao}</span>
                </div>
                <h3>Oferte com PIX em segundos.</h3>
                <p className="pix-card__note">Use a chave abaixo no app do seu banco.</p>
                <div className="pix-key">
                  <div>
                    <p className="pix-key__label">Chave PIX{pixDisplay?.includes("/") ? " · CNPJ" : ""}</p>
                    <p className="pix-key__val">{pixDisplay ?? config.pixChave}</p>
                  </div>
                  <CopiarChave chave={config.pixChave} />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function ProximoPasso({ indice, titulo, texto, href, cta }: { indice: string; titulo: string; texto: string; href: string; cta: string }) {
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

function CursoCard({ dia, nome, texto }: { dia: string; nome: string; texto: string }) {
  return (
    <article className="card">
      <p className="course__meta">{dia}</p>
      <h3 className="card__titulo">{nome}</h3>
      <p className="card__texto">{texto}</p>
      <p className="course__price" style={{ marginTop: "auto", paddingTop: "1rem" }}>
        R$ 49,90 <span>/ por mês</span>
      </p>
      <Link href="/escola" className="btn btn--sm">Inscrever-me</Link>
    </article>
  );
}

function FrameRetrato({ legenda }: { legenda: string }) {
  return (
    <div className="frame frame--tall frame__mono">
      <div className="frame__grid" aria-hidden="true" />
      <span className="frame__cap">{legenda}</span>
    </div>
  );
}

function Horario({ dia, titulo, hora }: { dia: string; titulo: string; hora: string }) {
  return (
    <div className="info-line">
      <div className="ic" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", width: "100%", flexWrap: "wrap" }}>
        <div>
          <p className="v">{dia}</p>
          <p className="sub">{titulo}</p>
        </div>
        <p className="k" style={{ alignSelf: "center" }}>{hora}</p>
      </div>
    </div>
  );
}

function Check() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
