import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { tenantDb } from "@/lib/db/tenant-client";
import { urlEmbed, urlMiniatura } from "@/lib/youtube/live";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Página de uma pregação.
 *
 * DUAS DEFESAS QUE VALEM SER LIDAS COM CALMA
 *
 * 1. O `slug` vem da URL, então é entrada hostil. Ele é validado por formato
 *    ANTES de tocar o banco. Não é sobre injeção (o Prisma parametriza tudo):
 *    é sobre não gastar uma ida ao banco com lixo e não deixar um valor de
 *    2 KB entrar em índice de busca de string.
 *
 * 2. O player nunca recebe uma URL pronta. `urlEmbed` remonta o endereço a
 *    partir do `youtubeVideoId` revalidado por regex. Se um dia um campo do
 *    painel deixar passar uma URL inteira, ela morre aqui em vez de virar
 *    `src` de iframe.
 *
 * Rascunho (`publicado: false`) e mensagem inexistente devolvem exatamente o
 * mesmo 404. Diferenciar contaria ao visitante que a igreja está preparando
 * algo naquele endereço.
 */

export const dynamic = "force-dynamic";

const FORMATO_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * `cache()` do React: `generateMetadata` e o componente da página precisam da
 * mesma mensagem. Sem isto, toda página de pregação faria a consulta duas
 * vezes — e são as páginas mais compartilhadas no WhatsApp da igreja.
 */
const carregarMensagem = cache(async (tenantId: string, slug: string) => {
  const db = tenantDb(tenantId);
  return db.mensagem.findFirst({
    where: { slug, publicado: true },
    select: {
      id: true,
      titulo: true,
      slug: true,
      descricao: true,
      preletor: true,
      serie: true,
      youtubeVideoId: true,
      capaArquivoId: true,
      duracaoSegundos: true,
      data: true,
    },
  });
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!FORMATO_SLUG.test(slug) || slug.length > 120) return {};

  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const [mensagem, dados] = await Promise.all([
    carregarMensagem(tenant.id, slug),
    carregarDadosSite(tenant.id),
  ]);
  if (!mensagem) return {};

  const descricao = mensagem.descricao
    ? resumir(mensagem.descricao, 180)
    : [mensagem.preletor, mensagem.serie].filter(Boolean).join(" · ") ||
      `Mensagem da ${dados.config.nomeExibicao}.`;

  // Imagem social: a capa cadastrada tem prioridade; na falta dela, a
  // miniatura do YouTube, sempre montada a partir do ID validado.
  const imagem = mensagem.capaArquivoId
    ? urlArquivoPublico(mensagem.capaArquivoId)
    : mensagem.youtubeVideoId
      ? urlMiniatura(mensagem.youtubeVideoId)
      : null;

  return {
    title: mensagem.titulo,
    description: descricao,
    alternates: { canonical: `/mensagens/${mensagem.slug}` },
    openGraph: {
      type: "article",
      title: mensagem.titulo,
      description: descricao,
      url: `/mensagens/${mensagem.slug}`,
      ...(imagem ? { images: [{ url: imagem }] } : {}),
    },
  };
}

export default async function PaginaMensagem({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!FORMATO_SLUG.test(slug) || slug.length > 120) notFound();

  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const mensagem = await carregarMensagem(tenant.id, slug);
  if (!mensagem) notFound();

  const db = tenantDb(tenant.id);

  // Outras mensagens da mesma série; sem série, as mais recentes. Serve para
  // quem chegou por um link compartilhado e não conhece o resto do acervo.
  const relacionadas = await db.mensagem.findMany({
    where: {
      publicado: true,
      id: { not: mensagem.id },
      ...(mensagem.serie ? { serie: mensagem.serie } : {}),
    },
    orderBy: [{ data: { sort: "desc", nulls: "last" } }, { criadoEm: "desc" }],
    select: {
      id: true,
      titulo: true,
      slug: true,
      preletor: true,
      data: true,
    },
    take: 3,
  });

  const embed = mensagem.youtubeVideoId ? urlEmbed(mensagem.youtubeVideoId) : null;
  const capa = mensagem.capaArquivoId ? urlArquivoPublico(mensagem.capaArquivoId) : null;

  return (
    <>
      {/* --------------------------------------------------------------- PLAYER */}
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">{mensagem.serie ?? "Mensagem"}</p>

          <h1 style={{ marginTop: "1.2rem", fontSize: "var(--step-4)" }}>{mensagem.titulo}</h1>

          <p className="dim" style={{ marginTop: "1.2rem", fontSize: ".95rem" }}>
            {[
              mensagem.preletor,
              formatarData(mensagem.data),
              formatarDuracao(mensagem.duracaoSegundos),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <div style={{ marginTop: "clamp(2rem, 4vw, 3rem)" }}>
            {embed ? (
              <div className="frame">
                <iframe
                  src={embed}
                  title={mensagem.titulo}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                  // O sandbox continua valendo mesmo sendo o YouTube: sem
                  // allow-top-navigation, um embed comprometido não redireciona
                  // a página inteira de quem está assistindo.
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            ) : capa ? (
              <div className="frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={capa}
                  alt=""
                  aria-hidden="true"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            ) : (
              <div className="frame">
                <div className="frame__placeholder">Vídeo indisponível</div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- CONTEÚDO */}
      {mensagem.descricao && (
        <section className="section theme-light">
          <div className="container container--narrow">
            <p className="eyebrow">Sobre esta mensagem</p>
            <div className="measure dim" style={{ marginTop: "1.8rem" }}>
              {/* Texto puro convertido em parágrafos pelo React, que escapa
                  tudo. Nada de dangerouslySetInnerHTML com conteúdo do painel. */}
              <Paragrafos texto={mensagem.descricao} />
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- RELACIONADAS */}
      <section className="section theme-cream">
        <div className="container">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: "1.5rem",
              flexWrap: "wrap",
              marginBottom: "clamp(2rem, 4vw, 3rem)",
            }}
          >
            <div>
              <p className="eyebrow">{mensagem.serie ? "Nesta série" : "Continue ouvindo"}</p>
              <h2 style={{ marginTop: "1rem", fontSize: "var(--step-3)" }}>
                Mais para o seu caminho.
              </h2>
            </div>
            <Link href="/mensagens" className="link">
              Ver todas <span aria-hidden="true">→</span>
            </Link>
          </div>

          {relacionadas.length === 0 ? (
            <p className="dim">Esta é a única mensagem publicada por enquanto.</p>
          ) : (
            <div className="grid cols-3">
              {relacionadas.map((outra) => (
                <article className="card" key={outra.id}>
                  <h3 className="card__titulo" style={{ fontSize: "var(--step-1)" }}>
                    <Link href={`/mensagens/${outra.slug}`}>{outra.titulo}</Link>
                  </h3>
                  <p className="card__texto" style={{ marginTop: "auto" }}>
                    {[outra.preletor, formatarData(outra.data)].filter(Boolean).join(" · ")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- CONVITE */}
      <section className="section section--tight theme-dark">
        <div className="container container--narrow centro stack">
          <p className="pullquote">
            &ldquo;A fé vem pelo <span className="accent">ouvir</span>, e o ouvir pela palavra de
            Cristo.&rdquo;
          </p>
          <p className="pullquote__by">Romanos 10.17</p>
          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/visita" className="btn">
              Quero visitar
            </Link>
            <Link href="/celulas" className="btn btn--ghost">
              Encontrar uma célula
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/** Converte texto puro em parágrafos. NÃO interpreta HTML. */
function Paragrafos({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <>
      {paragrafos.map((paragrafo, i) => (
        <p key={i} style={{ marginBottom: "1.1em" }}>
          {paragrafo.split("\n").map((linha, j, todas) => (
            <span key={j}>
              {linha}
              {j < todas.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

/** Coluna DATE do Postgres: formatar fora de UTC adiantaria/atrasaria um dia. */
function formatarData(data: Date | null): string | null {
  if (!data) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
}

function formatarDuracao(segundos: number | null): string | null {
  if (!segundos || segundos <= 0) return null;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function resumir(texto: string, maximo: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= maximo) return limpo;
  const corte = limpo.slice(0, maximo);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${(ultimoEspaco > maximo * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trimEnd()}…`;
}
