import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Quem Somos",
};

const PILARES = [
  {
    idx: "01",
    titulo: "Adoração",
    texto:
      "Uma vida rendida a Deus, que O exalta em espírito e em verdade — no culto e no cotidiano.",
  },
  {
    idx: "02",
    titulo: "Palavra",
    texto:
      "A Bíblia como fundamento. Cremos e ensinamos toda a Escritura como regra de fé e prática.",
  },
  {
    idx: "03",
    titulo: "Comunhão",
    texto:
      "Vivemos como família de Deus, cuidando uns dos outros em relacionamentos verdadeiros.",
  },
  {
    idx: "04",
    titulo: "Discipulado",
    texto:
      "Seguimos Jesus e ajudamos outros a segui-Lo — discípulos que fazem discípulos.",
  },
  {
    idx: "05",
    titulo: "Missão",
    texto:
      "Da cidade para as nações: levar o Evangelho a toda esfera de influência da sociedade.",
  },
  {
    idx: "06",
    titulo: "Avivamento",
    texto:
      "Esperamos e buscamos a ação do Espírito Santo: sinais, prodígios e vidas transformadas.",
  },
] as const;

export default function QuemSomos() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb">
            <Link href="/">Início</Link>
            <span>/</span>
            <span>Quem Somos</span>
          </nav>
          <p className="eyebrow">Quem Somos</p>
          <h1 className="page-hero__title">
            Uma casa de <span className="serif-italic accent">discípulos.</span>
          </h1>
          <p className="lead">
            Somos uma comunidade de discípulos de Jesus. Professamos a fé
            apostólica e vivemos como família de Deus.
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container split">
          <div className="split__media">
            <div className="frame frame--tall frame__mono">
              <div className="frame__grid" />
              <span className="frame__cap">família de Deus</span>
              <span className="frame__badge">Foto da comunidade aqui</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">Nossa essência</p>
            <h2>
              Pessoas comuns, <span className="serif-italic accent">chamadas</span> por
              um Deus extraordinário.
            </h2>
            <p className="lead">
              Cremos que a igreja não é um prédio, e sim uma família. Uma casa
              onde cada pessoa é acolhida, discipulada e enviada para viver o
              Evangelho no dia a dia.
            </p>
            <p>
              Exercemos nossa vocação da cidade para as nações, gerando vida e
              transformação. É esse o coração que nos move: ver pessoas
              encontrando Jesus e se tornando discípulos que fazem outros
              discípulos.
            </p>
          </div>
        </div>
      </section>

      <section className="section theme-dark">
        <div className="container container--narrow centro">
          <p className="eyebrow eyebrow--centered">Nossa Missão</p>
          <blockquote className="pullquote">
            Fazer <span className="accent">discípulos</span> de todas as nações. A
            partir da cidade, avançaremos na pregação do Evangelho e nos atos de
            justiça, seguidos dos sinais, prodígios e maravilhas.
          </blockquote>
          <p>
            Queremos, como igreja, ser relevantes na sociedade, expandindo o
            Reino de Deus a todas as esferas de influência — gerando, assim,
            transformação e avivamento.
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container">
          <p className="eyebrow">No que acreditamos</p>
          <h2>
            Os pilares que nos <span className="accent">sustentam.</span>
          </h2>
          <div className="grid cols-2">
            {PILARES.map((pilar) => (
              <div className="value" key={pilar.idx}>
                <p className="value__idx">{pilar.idx}</p>
                <h3 className="value__title">{pilar.titulo}</h3>
                <p className="value__text">{pilar.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section theme-dark scripture">
        <div className="container">
          <span className="scripture__mark" aria-hidden="true">
            &ldquo;
          </span>
          <p className="scripture__text">
            &ldquo;Nisto conhecerão todos que sois meus{" "}
            <span className="accent ital">discípulos</span>: se vos amardes uns
            aos outros.&rdquo;
          </p>
          <p className="scripture__ref">João 13.35</p>
        </div>
      </section>
    </>
  );
}
