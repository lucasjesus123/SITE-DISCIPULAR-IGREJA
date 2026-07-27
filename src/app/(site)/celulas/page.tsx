import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";

/**
 * "A igreja, perto de você" — a rede Discipular Células.
 *
 * Esta página é conteúdo institucional estático, espelhando o design de
 * referência: apresenta o que é uma célula, os três propósitos, como começar e
 * as dúvidas mais comuns. A busca pela célula mais próxima acontece no mapa
 * externo (Casas de Discípulos, no Google Sites), então aqui não expomos
 * endereços de lares nem dados de líderes.
 */

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Células",
    description:
      `Encontre uma célula da ${config.nomeExibicao} perto de você. Pequenos grupos para ` +
      `adorar, proclamar a Palavra e interceder — no seu bairro, durante a semana.`,
    alternates: { canonical: "/celulas" },
    openGraph: {
      title: `Células · ${config.nomeExibicao}`,
      description: `A igreja reunida em pequenos grupos, perto de você.`,
    },
  };
}

// Link único do mapa de células (Casas de Discípulos).
const LINK_MAPA = "https://sites.google.com/view/casasdediscipulos/home";

const svgCheck = (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export default async function PaginaCelulas() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  return (
    <>
      {/* --------------------------------------------------------- PAGE HERO */}
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb">
            <Link href="/">Início</Link>
            <span>/</span>
            <span>Células</span>
          </nav>
          <p className="eyebrow">Discipular Células</p>
          <h1 className="page-hero__title">
            A igreja, perto <span className="serif-italic accent">de você.</span>
          </h1>
          <p className="lead">
            Pequenos grupos reunidos nos lares para adorar, proclamar a Palavra e interceder — a
            Casa de Discípulos em movimento.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- O QUE É */}
      <section className="section theme-light">
        <div className="container split">
          <div>
            <p className="eyebrow">O que é uma célula</p>
            <h2 style={{ marginTop: "1.2rem" }}>
              Fé que se vive <span className="serif-italic accent">em comunidade.</span>
            </h2>
            <p className="lead" style={{ marginTop: "1.4rem" }}>
              A rede celular Discipular Células é a igreja, em comunhão, reunida em pequenos grupos —
              com o propósito de adorar, proclamar a Palavra e interceder.
            </p>
            <p style={{ marginTop: "1.2rem" }}>
              É onde a fé sai das quatro paredes e ganha a vida real: na sua rua, no seu bairro, com
              pessoas que caminham ao seu lado. Um lugar para pertencer, crescer e cuidar uns dos
              outros.
            </p>
            <a
              href={LINK_MAPA}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--lg"
              style={{ marginTop: "2rem" }}
            >
              Encontre uma célula
            </a>
          </div>

          <div className="split__media">
            <div className="frame frame--wide frame__mono">
              <div className="frame__grid" />
              <span className="frame__cap">Discipular Células</span>
              <div className="floating-tag">
                <div className="k">Casas de Discípulos</div>
                <div className="v">Pela cidade toda</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------- POR QUE PARTICIPAR */}
      <section className="section theme-dark">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Por que participar</p>
            <h2 style={{ marginTop: "1.2rem" }}>
              Três propósitos, <span className="serif-italic accent">um coração.</span>
            </h2>
          </div>

          <div className="grid cols-3">
            <article className="card">
              <h3 className="card__titulo">Adorar</h3>
              <p className="card__texto">
                Juntos, exaltamos a Deus e cultivamos Sua presença no meio do grupo.
              </p>
            </article>
            <article className="card">
              <h3 className="card__titulo">Proclamar a Palavra</h3>
              <p className="card__texto">
                Estudamos e aplicamos a Bíblia à vida real, crescendo em maturidade.
              </p>
            </article>
            <article className="card">
              <h3 className="card__titulo">Interceder</h3>
              <p className="card__texto">
                Oramos uns pelos outros e cuidamos de cada pessoa do grupo.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- COMO FUNCIONA */}
      <section className="section theme-light">
        <div className="container split split--text-first">
          <div>
            <p className="eyebrow">Como funciona</p>
            <h2 style={{ marginTop: "1.2rem" }}>
              Simples de <span className="serif-italic accent">começar.</span>
            </h2>
            <ul className="ticks" style={{ marginTop: "2rem" }}>
              <li>
                <span className="ic">{svgCheck}</span>
                <span>
                  <strong>Encontre um grupo perto de você</strong> — pelo nosso mapa de células.
                </span>
              </li>
              <li>
                <span className="ic">{svgCheck}</span>
                <span>
                  <strong>Vá sem compromisso</strong> — você será recebido como parte da família.
                </span>
              </li>
              <li>
                <span className="ic">{svgCheck}</span>
                <span>
                  <strong>Participe toda semana</strong> — e cresça em fé e amizade.
                </span>
              </li>
              <li>
                <span className="ic">{svgCheck}</span>
                <span>
                  <strong>Seja discipulado</strong> — e, um dia, ajude a discipular outros.
                </span>
              </li>
            </ul>
          </div>

          <div className="split__media">
            <div className="stat-grid">
              <div className="stat">
                <div className="stat__num">2</div>
                <div className="stat__label">Campi · Lajeado e Vera Cruz</div>
              </div>
              <div className="stat">
                <div className="stat__num">7d</div>
                <div className="stat__label">Grupos ao longo da semana</div>
              </div>
              <div className="stat">
                <div className="stat__num">∞</div>
                <div className="stat__label">Espaço para você pertencer</div>
              </div>
              <div className="stat">
                <div className="stat__num">1</div>
                <div className="stat__label">Só propósito: fazer discípulos</div>
              </div>
            </div>
            <a
              href={LINK_MAPA}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{ marginTop: "2rem" }}
            >
              Ver mapa de células
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ FAQ */}
      <section className="section theme-dark">
        <div className="container container--narrow">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Perguntas frequentes</p>
            <h2 style={{ marginTop: "1.2rem" }}>
              Antes da <span className="serif-italic accent">primeira vez.</span>
            </h2>
          </div>

          <div className="faq">
            <details>
              <summary>
                Preciso ser membro para participar?
                <span className="faq__sign" />
              </summary>
              <div className="faq__a">
                Não. As células são abertas a todos. Você pode chegar exatamente como está —
                visitantes são sempre bem-vindos.
              </div>
            </details>
            <details>
              <summary>
                Onde acontecem os encontros?
                <span className="faq__sign" />
              </summary>
              <div className="faq__a">
                Nos lares, ao longo da semana, em vários pontos de Lajeado e Vera Cruz. Use o mapa de
                células para achar o grupo mais próximo de você.
              </div>
            </details>
            <details>
              <summary>
                Quanto tempo dura?
                <span className="faq__sign" />
              </summary>
              <div className="faq__a">
                Em média cerca de uma hora e meia, entre louvor, Palavra, oração e um tempo de
                comunhão.
              </div>
            </details>
            <details>
              <summary>
                Posso levar minha família?
                <span className="faq__sign" />
              </summary>
              <div className="faq__a">
                Com certeza. As células são um ambiente familiar — traga quem você ama para
                conhecer.
              </div>
            </details>
          </div>
        </div>
      </section>
    </>
  );
}
