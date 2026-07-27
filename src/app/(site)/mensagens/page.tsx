import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { tenantDb } from "@/lib/db/tenant-client";
import { urlMiniatura } from "@/lib/youtube/live";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Arquivo de pregações.
 *
 * ESCOPO DE DADOS
 * Não existe sessão aqui — é o site público. O escopo de tenant vem do
 * HOSTNAME (`tenantDaRequisicao`) e as leituras passam por `tenantDb`, o mesmo
 * cliente escopado usado em src/lib/services/site.ts. `prisma` cru não aparece
 * neste arquivo, e não deve aparecer: só ele conseguiria enxergar mensagens de
 * outra igreja.
 *
 * FILTROS
 * `pagina` e `serie` chegam pela query string, logo são entrada hostil. Ambos
 * passam por Zod com `safeParse` e fallback, e a série ainda é confrontada com
 * a lista de séries que realmente existem no banco desta igreja — uma lista
 * fechada montada a partir dos dados, não do visitante.
 */

export const dynamic = "force-dynamic";

/** Teto de itens por página. Muito abaixo do limite de 100 exigido pelo padrão:
 *  cada cartão carrega uma miniatura, e 12 já enche uma tela grande. */
const POR_PAGINA = 12;

/** Teto de páginas: impede `?pagina=999999` virar um OFFSET absurdo no Postgres. */
const MAXIMO_PAGINAS = 500;

const esquemaFiltros = z.object({
  pagina: z.coerce.number().int().min(1).max(MAXIMO_PAGINAS).default(1),
  serie: z.string().trim().max(120).default(""),
});

const FILTROS_PADRAO = { pagina: 1, serie: "" };

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Mensagens",
    description:
      config.descricaoSeo ??
      `Pregações e estudos da ${config.nomeExibicao}. Assista às mensagens e cresça na Palavra.`,
    alternates: { canonical: "/mensagens" },
    openGraph: {
      title: `Mensagens · ${config.nomeExibicao}`,
      description: `Pregações e estudos da ${config.nomeExibicao}.`,
    },
  };
}

export default async function PaginaMensagens({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const analise = esquemaFiltros.safeParse(await searchParams);
  const filtros = analise.success ? analise.data : FILTROS_PADRAO;

  const db = tenantDb(tenant.id);
  const { config } = await carregarDadosSite(tenant.id);

  // Séries existentes. Consulta separada e anterior de propósito: é ela que
  // define a lista fechada contra a qual o filtro do visitante é validado.
  const seriesBrutas = await db.mensagem.findMany({
    where: { publicado: true, serie: { not: null } },
    select: { serie: true },
    distinct: ["serie"],
    orderBy: { serie: "asc" },
    take: 40,
  });
  const series = seriesBrutas
    .map((s) => s.serie)
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  const serieSelecionada = series.includes(filtros.serie) ? filtros.serie : "";
  const filtro = {
    publicado: true,
    ...(serieSelecionada ? { serie: serieSelecionada } : {}),
  };

  const total = await db.mensagem.count({ where: filtro });
  const totalPaginas = Math.max(1, Math.min(Math.ceil(total / POR_PAGINA), MAXIMO_PAGINAS));
  // Página fora do intervalo é grampeada, não 404: um link antigo compartilhado
  // no grupo da igreja continua levando a algum lugar útil.
  const pagina = Math.min(filtros.pagina, totalPaginas);

  const mensagens = await db.mensagem.findMany({
    where: filtro,
    // `destaque` primeiro (a igreja fixa a mensagem que quer no topo), depois a
    // data. `nulls: "last"` evita que uma mensagem sem data cadastrada roube o
    // lugar da pregação de domingo.
    orderBy: [
      { destaque: "desc" },
      { data: { sort: "desc", nulls: "last" } },
      { criadoEm: "desc" },
    ],
    select: {
      id: true,
      titulo: true,
      slug: true,
      descricao: true,
      preletor: true,
      serie: true,
      youtubeVideoId: true,
      capaArquivoId: true,
      data: true,
      destaque: true,
    },
    skip: (pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
  });

  // A "última" só ganha o tratamento de capa na primeira página sem filtro.
  // Dentro de uma série ou na página 3, destacar o primeiro item seria mentira
  // visual: ele não é o mais recente de nada.
  const destacada = pagina === 1 && !serieSelecionada ? mensagens[0] : undefined;
  const restantes = destacada ? mensagens.slice(1) : mensagens;

  return (
    <>
      {/* ------------------------------------------------------------- ABERTURA */}
      <section className="section theme-dark">
        <div className="container">
          <p className="eyebrow">Mensagens</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            Palavra que <span className="serif-italic gold">transforma</span>.
          </h1>
          <p className="lead measure" style={{ marginTop: "1.4rem" }}>
            As pregações da {config.nomeExibicao}, reunidas em um só lugar. Ouça no caminho do
            trabalho, revise na célula, compartilhe com quem precisa.
          </p>

          {config.youtube && (
            <div style={{ marginTop: "2.2rem" }}>
              <a
                href={config.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--outline-gold"
              >
                Inscreva-se no canal
              </a>
            </div>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------------- ACERVO */}
      <section className="section theme-light">
        <div className="container">
          {series.length > 0 && (
            <nav
              className="barra-ferramentas"
              aria-label="Filtrar mensagens por série"
              style={{ marginBottom: "2.5rem" }}
            >
              <Link
                href="/mensagens"
                className="filtro-chip"
                aria-pressed={serieSelecionada === ""}
              >
                Todas
              </Link>
              {series.map((serie) => (
                <Link
                  key={serie}
                  // `serie` veio do banco desta igreja e é codificada aqui:
                  // um título com "&" ou espaço não pode quebrar a query string.
                  href={`/mensagens?serie=${encodeURIComponent(serie)}`}
                  className="filtro-chip"
                  aria-pressed={serieSelecionada === serie}
                >
                  {serie}
                </Link>
              ))}
            </nav>
          )}

          {total === 0 ? (
            <div className="vazio">
              <p>
                {serieSelecionada
                  ? "Nenhuma mensagem publicada nesta série ainda."
                  : "As mensagens estão sendo preparadas. Volte em breve."}
              </p>
            </div>
          ) : (
            <>
              {destacada && (
                <article style={{ marginBottom: "clamp(3rem, 6vw, 4.5rem)" }}>
                  <div className="grid cols-2" style={{ alignItems: "center" }}>
                    <Link
                      href={`/mensagens/${destacada.slug}`}
                      className="frame"
                      aria-label={`Assistir: ${destacada.titulo}`}
                      style={{ display: "block" }}
                    >
                      <Capa
                        videoId={destacada.youtubeVideoId}
                        capaArquivoId={destacada.capaArquivoId}
                        titulo={destacada.titulo}
                        prioridade
                      />
                    </Link>

                    <div className="stack">
                      <p className="eyebrow">
                        {destacada.destaque ? "Em destaque" : "Última mensagem"}
                      </p>
                      <h2 style={{ fontSize: "var(--step-3)" }}>
                        <Link href={`/mensagens/${destacada.slug}`}>{destacada.titulo}</Link>
                      </h2>
                      <p className="dim" style={{ fontSize: ".92rem" }}>
                        {linhaDeApoio(destacada.preletor, destacada.serie, destacada.data)}
                      </p>
                      {destacada.descricao && (
                        <p className="lead">{resumir(destacada.descricao, 220)}</p>
                      )}
                      <div style={{ marginTop: ".6rem" }}>
                        <Link href={`/mensagens/${destacada.slug}`} className="btn">
                          Assistir agora
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              )}

              {restantes.length > 0 && (
                <div className="grid cols-3">
                  {restantes.map((mensagem) => (
                    <article className="card" key={mensagem.id} style={{ padding: 0 }}>
                      <Link
                        href={`/mensagens/${mensagem.slug}`}
                        className="frame"
                        style={{ display: "block", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0" }}
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <Capa
                          videoId={mensagem.youtubeVideoId}
                          capaArquivoId={mensagem.capaArquivoId}
                          titulo={mensagem.titulo}
                        />
                      </Link>

                      <div
                        style={{
                          padding: "clamp(1.2rem, 2.4vw, 1.7rem)",
                          display: "flex",
                          flexDirection: "column",
                          gap: ".7rem",
                          flex: 1,
                        }}
                      >
                        {mensagem.serie && <p className="index-tag">{mensagem.serie}</p>}
                        <h3 className="card__titulo" style={{ fontSize: "var(--step-1)" }}>
                          {/* O link do título é o único focável do cartão — a
                              imagem acima é decorativa e sai da ordem de
                              tabulação para não duplicar o mesmo destino. */}
                          <Link href={`/mensagens/${mensagem.slug}`}>{mensagem.titulo}</Link>
                        </h3>
                        <p className="card__texto" style={{ marginTop: "auto" }}>
                          {linhaDeApoio(mensagem.preletor, null, mensagem.data)}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {totalPaginas > 1 && (
                <Paginacao
                  pagina={pagina}
                  totalPaginas={totalPaginas}
                  serie={serieSelecionada}
                />
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------
// Peças da página
// -----------------------------------------------------------------------------

/**
 * Capa do cartão.
 *
 * Preferimos a imagem enviada pela igreja; na falta dela, a miniatura do
 * YouTube — montada por `urlMiniatura`, que revalida o formato do ID antes de
 * compor a URL. Nenhuma URL vinda do banco é usada crua como `src`.
 */
function Capa({
  videoId,
  capaArquivoId,
  titulo,
  prioridade = false,
}: {
  videoId: string | null;
  capaArquivoId: string | null;
  titulo: string;
  prioridade?: boolean;
}) {
  const url = capaArquivoId
    ? urlArquivoPublico(capaArquivoId)
    : videoId
      ? urlMiniatura(videoId)
      : null;

  if (!url) {
    return <div className="frame__placeholder">Sem imagem</div>;
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      aria-hidden="true"
      loading={prioridade ? "eager" : "lazy"}
      fetchPriority={prioridade ? "high" : "auto"}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function Paginacao({
  pagina,
  totalPaginas,
  serie,
}: {
  pagina: number;
  totalPaginas: number;
  serie: string;
}) {
  const base = serie ? `/mensagens?serie=${encodeURIComponent(serie)}&` : "/mensagens?";

  return (
    <nav className="paginacao" aria-label="Navegação entre páginas de mensagens">
      {pagina > 1 ? (
        <Link href={`${base}pagina=${pagina - 1}`} rel="prev">
          Anterior
        </Link>
      ) : (
        <span aria-hidden="true" style={{ opacity: 0.45 }}>
          Anterior
        </span>
      )}

      <span aria-current="page">
        Página {pagina} de {totalPaginas}
      </span>

      {pagina < totalPaginas ? (
        <Link href={`${base}pagina=${pagina + 1}`} rel="next">
          Próxima
        </Link>
      ) : (
        <span aria-hidden="true" style={{ opacity: 0.45 }}>
          Próxima
        </span>
      )}
    </nav>
  );
}

// -----------------------------------------------------------------------------
// Formatação
// -----------------------------------------------------------------------------

/**
 * `data` é uma coluna DATE: o Prisma a devolve como meia-noite UTC. Formatar no
 * fuso do servidor faria "05/10" virar "04/10" em qualquer host a oeste de
 * Greenwich — por isso o `timeZone: "UTC"` explícito.
 */
function formatarData(data: Date | null): string | null {
  if (!data) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
}

function linhaDeApoio(
  preletor: string | null,
  serie: string | null,
  data: Date | null,
): string {
  return [preletor, serie, formatarData(data)].filter(Boolean).join(" · ");
}

/** Corta no espaço mais próximo para não terminar no meio de uma palavra. */
function resumir(texto: string, maximo: number): string {
  const limpo = texto.trim();
  if (limpo.length <= maximo) return limpo;
  const corte = limpo.slice(0, maximo);
  const ultimoEspaco = corte.lastIndexOf(" ");
  return `${(ultimoEspaco > maximo * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trimEnd()}…`;
}
