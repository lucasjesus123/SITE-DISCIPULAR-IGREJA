import type { Metadata } from "next";
import { carregarOverridePagina } from "@/components/site/OverridePagina";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { CopiarChave } from "@/components/site/CopiarChave";

/**
 * Página de contribuição.
 *
 * O QUE APARECE AQUI É SÓ O PIX
 * O `SiteConfig` também guarda dados bancários, mas eles ficam criptografados
 * em repouso (AES-256-GCM) e não são carregados por `carregarDadosSite` — logo,
 * não têm como escorregar para esta página. Conta e agência publicadas na
 * internet são o insumo preferido do golpe do boleto falso, e o PIX resolve o
 * mesmo problema com uma chave que a igreja pode trocar em cinco minutos se
 * algo der errado.
 *
 * A chave é renderizada como texto pelo React, que a escapa. Não há
 * `dangerouslySetInnerHTML` nesta página — nem deve haver: `pixChave` e
 * `pixDescricao` são conteúdo editável pelo cliente no painel.
 *
 * NOTA DE ROTEAMENTO
 * Esta rota tem prioridade sobre a página `/contribua` do editor whitelabel,
 * porque a chave PIX precisa vir da configuração da igreja e não de um texto
 * digitado num bloco (que ninguém lembra de atualizar quando a chave muda).
 */

export const dynamic = "force-dynamic";

/**
 * Descreve uma chave PIX para exibição, sem heurística arriscada: reconhece
 * e-mail (tem "@") e CNPJ (14 dígitos, formatado); qualquer outra coisa é
 * mostrada como o cliente digitou, rotulada genericamente. `copiavel` é o que
 * vai para a área de transferência (CNPJ só dígitos; o resto, texto cru).
 */
function descreverPix(chave: string): { tipo: string; exibicao: string; copiavel: string } {
  if (chave.includes("@")) return { tipo: "E-mail", exibicao: chave, copiavel: chave };
  const d = chave.replace(/\D/g, "");
  if (d.length === 14 && !/\s/.test(chave)) {
    return {
      tipo: "CNPJ",
      exibicao: `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`,
      copiavel: d,
    };
  }
  return { tipo: "Chave PIX", exibicao: chave, copiavel: chave };
}

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Contribua",
    description:
      `Contribua com a ${config.nomeExibicao}. Sua generosidade sustenta a proclamação do ` +
      `Evangelho, o cuidado com pessoas e a manutenção da casa.`,
    alternates: { canonical: "/contribua" },
    openGraph: {
      title: `Contribua · ${config.nomeExibicao}`,
      description: "Deus ama a quem dá com alegria.",
    },
  };
}

export default async function PaginaContribua() {
  const override = await carregarOverridePagina("contribua");
  if (override) return override;

  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const { config } = await carregarDadosSite(tenant.id);

  // PIX vem 100% da configuração desta igreja. Sem chave configurada, o cartão
  // mostra um estado "em breve" — nunca cai na chave da igreja-âncora.
  const pixChave = config.pixChave?.trim() || null;
  const pix = pixChave ? descreverPix(pixChave) : null;
  const titular = config.pixTitular?.trim() || config.nomeExibicao;
  const telefoneContato =
    config.whatsapp?.trim() || config.telefoneContato?.trim() || null;

  return (
    <>
      {/* ------------------------------------------------------------ PAGE-HERO */}
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb">
            <Link href="/">Início</Link>
            <span>/</span>
            <span>Contribua</span>
          </nav>
          <p className="eyebrow">Oferte &amp; Contribua</p>
          <h1 className="page-hero__title">
            Generosidade que <span className="serif-italic accent">avança.</span>
          </h1>
          <p className="lead">
            Sua generosidade é fundamental para avançarmos na proclamação do
            Evangelho. Juntos, construímos uma história com e para Jesus.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------- POR QUE CONTRIBUIR */}
      <section className="section theme-light">
        <div className="container split">
          <div>
            <p className="eyebrow">Por que contribuir</p>
            <h2>
              Cada oferta se torna <span className="serif-italic accent">Reino.</span>
            </h2>
            <p className="lead">
              Queremos muito avançar na proclamação do Evangelho e, para isso, a
              sua generosidade é fundamental. Estamos, juntos, construindo uma
              história com e para Jesus.
            </p>

            <ul className="ticks">
              <li>
                <strong>Missões e evangelismo</strong> — da cidade para as nações.
              </li>
              <li>
                <strong>Discipulado e ensino</strong> — formando vidas na Palavra.
              </li>
              <li>
                <strong>Atos de justiça</strong> — servindo a nossa comunidade.
              </li>
            </ul>

            <blockquote className="pullquote">
              &ldquo;Cada um contribua segundo propôs no seu{" "}
              <span className="accent">coração</span>; não com tristeza, ou por
              necessidade; porque Deus ama ao que dá com alegria.&rdquo;
              <p className="pullquote__by">2 Coríntios 9.7</p>
            </blockquote>
          </div>

          <div className="split__media">
            <div className="pix-card">
              <div className="pix-card__head">
                <span className="pix-badge">PIX</span>
                <span className="pix-card__owner">{titular}</span>
              </div>
              <h3>Oferte com PIX em segundos.</h3>
              {pix ? (
                <>
                  <p className="pix-card__note">
                    Copie a chave abaixo e faça sua oferta pelo app do seu banco,
                    quando e de onde quiser.
                  </p>
                  <div className="pix-key">
                    <div>
                      <p className="pix-key__label">Chave PIX · {pix.tipo}</p>
                      <p className="pix-key__val">{pix.exibicao}</p>
                    </div>
                    <CopiarChave chave={pix.copiavel} />
                  </div>
                  <div className="pix-facts">
                    <div className="pix-fact">
                      <p className="k">Favorecido</p>
                      <p className="v">{titular}</p>
                    </div>
                    <div className="pix-fact">
                      <p className="k">Tipo de chave</p>
                      <p className="v">{pix.tipo}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="pix-card__note">
                  A chave PIX será disponibilizada em breve. Enquanto isso, fale
                  com a secretaria da igreja para contribuir.
                </p>
              )}
              {telefoneContato && (
                <p className="pix-card__note">
                  Recibo ou dúvidas sobre contribuições? Fale conosco:{" "}
                  {telefoneContato}.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- O VERSÍCULO */}
      <section className="section theme-dark scripture">
        <div className="container">
          <span className="scripture__mark" aria-hidden="true">
            &ldquo;
          </span>
          <p className="scripture__text">
            &ldquo;Há maior felicidade em <span className="accent ital">dar</span>{" "}
            do que em receber.&rdquo;
          </p>
          <p className="scripture__ref">Atos 20.35</p>
          <div style={{ textAlign: "center", marginTop: "2.5rem" }}>
            <Link href="/" className="btn btn--lg">
              Voltar para o início
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
