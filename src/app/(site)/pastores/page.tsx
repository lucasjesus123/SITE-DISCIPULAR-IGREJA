import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pastores",
};

export default function Pastores() {
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb">
            <Link href="/">Início</Link>
            <span>/</span>
            <span>Pastores</span>
          </nav>
          <p className="eyebrow">Nossos Pastores</p>
          <h1 className="page-hero__title">
            Tiago &amp; Cássia <span className="serif-italic accent">Facchi.</span>
          </h1>
          <p className="lead">
            Um chamado abraçado desde cedo e vivido como família — servindo a
            igreja com fé, dedicação e amor.
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container split">
          <div className="split__media">
            <div className="frame frame--tall frame__mono">
              <div className="frame__grid" />
              <span className="frame__cap">Pr. Tiago Facchi</span>
              <span className="frame__badge">Foto do Pr. Tiago aqui</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">Pastor</p>
            <h2>Tiago Facchi</h2>
            <p className="role">Pastor · Advogado · Empresário</p>
            <p className="lead">
              Natural de Lajeado, Tiago entrou no ministério aos 16 anos e nunca
              mais parou de servir.
            </p>
            <p>
              Formado em Direito pela Univates e em Teologia pela Corbã, une o
              preparo acadêmico ao chamado pastoral. Sua vida é testemunho de que
              é possível servir a Deus em todas as esferas — no púlpito, no
              trabalho e nos negócios — levando o Reino a cada ambiente por onde
              passa.
            </p>
          </div>
        </div>
      </section>

      <section className="section theme-dark">
        <div className="container split split--reverse">
          <div className="split__media">
            <div className="frame frame--tall frame__mono">
              <div className="frame__grid" />
              <span className="frame__cap">Pra. Cássia Facchi</span>
              <span className="frame__badge">Foto da Pra. Cássia aqui</span>
            </div>
          </div>
          <div>
            <p className="eyebrow">Pastora</p>
            <h2>Cássia Camila da Silva Facchi</h2>
            <p className="role">Pastora · Esposa · Mãe</p>
            <p className="lead">
              Natural de Santo Ângelo e filha de missionários, Cássia está
              envolvida no ministério desde a infância.
            </p>
            <p>
              Cresceu vendo de perto o que significa dedicar a vida ao Reino de
              Deus, e carrega esse chamado com graça e firmeza. Casada com Tiago,
              é mãe de Lorenzo e Valentina — vivendo, na própria casa, o
              discipulado que a igreja prega.
            </p>
          </div>
        </div>
      </section>

      <section className="section theme-cream">
        <div className="container container--narrow centro">
          <p className="eyebrow eyebrow--centered">Uma família no ministério</p>
          <blockquote className="pullquote">
            &ldquo;Eu e a minha casa serviremos ao{" "}
            <span className="accent">Senhor</span>.&rdquo;
          </blockquote>
          <p className="pullquote__by">
            Josué 24.15 · Tiago, Cássia, Lorenzo &amp; Valentina
          </p>
          <Link href="/contato" className="btn btn--lg">
            Venha nos conhecer
          </Link>
        </div>
      </section>
    </>
  );
}
