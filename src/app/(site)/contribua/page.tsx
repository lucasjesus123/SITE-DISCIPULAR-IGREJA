import type { Metadata } from "next";
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
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const { config } = await carregarDadosSite(tenant.id);
  const chave = config.pixChave?.trim() || null;

  return (
    <>
      {/* ------------------------------------------------------------- ABERTURA */}
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Oferte &amp; Contribua</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            Seja <span className="serif-italic gold">generoso</span>.
          </h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            {config.pixDescricao ??
              `Cada oferta entregue à ${config.nomeExibicao} vira Evangelho pregado, criança ` +
                `discipulada, família visitada e porta aberta durante a semana. Contribuir não é ` +
                `pagar uma conta da igreja: é participar do que Deus está fazendo por meio dela.`}
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------- O VERSÍCULO */}
      <section className="section section--tight theme-cream">
        <div className="container container--narrow centro stack">
          <p className="pullquote">
            &ldquo;Cada um contribua segundo tiver proposto no coração, não com tristeza ou por
            necessidade; porque Deus ama a quem dá com{" "}
            <span className="accent">alegria</span>.&rdquo;
          </p>
          <p className="pullquote__by">2 Coríntios 9.7</p>
        </div>
      </section>

      {/* --------------------------------------------------------------- O PIX */}
      <section className="section theme-light" id="pix">
        <div className="container container--narrow">
          {chave ? (
            <>
              <p className="eyebrow">PIX</p>
              <h2 style={{ marginTop: "1.2rem" }}>Contribua em segundos.</h2>
              <p className="lead" style={{ marginTop: "1.2rem" }}>
                Abra o aplicativo do seu banco, escolha PIX e use a chave abaixo. A transferência
                cai direto na conta da igreja.
              </p>

              <div className="card" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
                <p className="index-tag">Chave PIX</p>

                {/*
                  A chave fica visível e selecionável de propósito. O botão de
                  copiar depende de contexto seguro e de permissão do navegador;
                  quando ele falha, o caminho manual continua existindo.
                */}
                <p
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "clamp(1rem, 2.6vw, 1.3rem)",
                    wordBreak: "break-all",
                    userSelect: "all",
                    lineHeight: 1.5,
                  }}
                >
                  {chave}
                </p>

                {config.pixTitular && (
                  <p className="card__texto">
                    Titular: <strong>{config.pixTitular}</strong>
                  </p>
                )}

                <div style={{ marginTop: "1.2rem" }}>
                  <CopiarChave chave={chave} />
                </div>
              </div>

              <div className="alerta alerta--aviso" style={{ marginTop: "2rem" }} role="note">
                <strong>Confira sempre o titular.</strong> Antes de confirmar, verifique se o nome
                que aparece no seu aplicativo é o mesmo mostrado acima. A {config.nomeExibicao}{" "}
                nunca pede contribuição por mensagem privada e nunca envia outra chave por
                WhatsApp.
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">Contribuição</p>
              <h2 style={{ marginTop: "1.2rem" }}>Fale com a secretaria.</h2>
              <p className="lead" style={{ marginTop: "1.2rem" }}>
                Os dados para contribuição ainda não foram publicados aqui. Entre em contato e a
                equipe da {config.nomeExibicao} orienta você com segurança.
              </p>
              <div style={{ marginTop: "2rem" }}>
                <Link href="/contato" className="btn btn--lg">
                  Falar com a igreja
                </Link>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------- PARA ONDE VAI */}
      <section className="section theme-cream">
        <div className="container container--narrow">
          <p className="eyebrow">Transparência</p>
          <h2 style={{ marginTop: "1.2rem", marginBottom: "2rem" }}>Para onde vai a sua oferta.</h2>

          <div className="value">
            <span className="value__idx">01</span>
            <div>
              <p className="value__title">Proclamação</p>
              <p className="value__text">
                Cultos, transmissão ao vivo, materiais da Escola e o envio de quem prega onde ainda
                não se ouviu falar de Jesus.
              </p>
            </div>
          </div>

          <div className="value">
            <span className="value__idx">02</span>
            <div>
              <p className="value__title">Cuidado com pessoas</p>
              <p className="value__text">
                Assistência a famílias da igreja e do bairro, visitas, aconselhamento e as células
                espalhadas pela cidade.
              </p>
            </div>
          </div>

          <div className="value">
            <span className="value__idx">03</span>
            <div>
              <p className="value__title">A casa</p>
              <p className="value__text">
                Aluguel, energia, som, segurança e a manutenção do lugar onde a igreja se reúne
                toda semana.
              </p>
            </div>
          </div>

          <p className="dim" style={{ marginTop: "2.5rem", fontSize: ".92rem" }}>
            Quer entender melhor a prestação de contas?{" "}
            <Link href="/contato" className="gold">
              Peça à secretaria
            </Link>
            . Prestamos contas a quem contribui — é o mínimo.
          </p>
        </div>
      </section>

      {/* -------------------------------------------------------------- CONVITE */}
      <section className="section section--tight theme-dark">
        <div className="container container--narrow centro stack">
          <h2 style={{ fontSize: "var(--step-3)" }}>Obrigado por caminhar conosco.</h2>
          <p className="lead">
            Se você contribui com a {config.nomeExibicao}, você faz parte de cada história que
            acontece aqui.
          </p>
          <div
            style={{
              marginTop: "1.4rem",
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/oracao" className="btn btn--ghost">
              Pedido de oração
            </Link>
            <Link href="/visita" className="btn">
              Quero visitar
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
