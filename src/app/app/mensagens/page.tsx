import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { tenantDb } from "@/lib/db/tenant-client";
import { urlMiniatura } from "@/lib/youtube/live";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mensagens" };

/**
 * Biblioteca de pregações.
 *
 * TELA PÚBLICA: a pregação é o conteúdo que a igreja já publica no YouTube.
 * Colocar login na frente dela não protegeria nada e afastaria quem chegou
 * agora — que é justamente quem mais assiste.
 *
 * Só entram mensagens com `publicado: true`. O rascunho que o pastor está
 * preparando fica invisível mesmo para quem adivinhar a URL, porque o filtro
 * está na CONSULTA e não na renderização.
 */

/** 12 por página: três telas de rolagem no celular, e teto bem abaixo do
 *  máximo de 100 exigido pela regra de paginação. */
const POR_PAGINA = 12;

const schemaFiltros = z.object({
  serie: z.string().trim().max(120).optional(),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});

export default async function AppMensagens({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const params = await searchParams;
  const filtros =
    schemaFiltros.safeParse({
      serie: primeiro(params.serie),
      pagina: primeiro(params.pagina),
    }).data ?? schemaFiltros.parse({});

  const db = tenantDb(tenant.id);

  /**
   * As séries existentes viram a lista fechada de valores aceitos no filtro.
   * O termo da URL só é usado se bater com uma delas — assim o `where` nunca
   * recebe texto arbitrário, mesmo o Prisma já parametrizando a consulta.
   */
  const seriesBrutas = await db.mensagem.findMany({
    where: { publicado: true, serie: { not: null } },
    select: { serie: true },
    distinct: ["serie"],
    orderBy: { serie: "asc" },
    take: 30,
  });
  const series = seriesBrutas
    .map((s) => s.serie)
    .filter((s): s is string => typeof s === "string" && s.length > 0);

  const serie = filtros.serie && series.includes(filtros.serie) ? filtros.serie : null;

  const where: Prisma.MensagemWhereInput = {
    publicado: true,
    ...(serie ? { serie } : {}),
  };

  const total = await db.mensagem.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(filtros.pagina, totalPaginas);

  const mensagens = await db.mensagem.findMany({
    where,
    orderBy: [{ destaque: "desc" }, { data: "desc" }, { criadoEm: "desc" }],
    skip: (pagina - 1) * POR_PAGINA,
    take: POR_PAGINA,
    // `select` explícito: um campo interno adicionado ao modelo amanhã não
    // vaza sozinho para uma tela pública.
    select: {
      id: true,
      titulo: true,
      slug: true,
      preletor: true,
      serie: true,
      youtubeVideoId: true,
      data: true,
      duracaoSegundos: true,
    },
  });

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Palavra</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Mensagens</h1>
        <p style={{ fontSize: ".88rem", color: "var(--bone-dim)", marginTop: ".7rem" }}>
          Assista de novo, ou pela primeira vez. Tudo que foi pregado, no seu tempo.
        </p>
      </header>

      {series.length > 0 && (
        <section style={{ padding: "0 1.25rem 1.25rem" }}>
          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
            <ChipSerie href="/app/mensagens" ativo={serie === null}>
              Todas
            </ChipSerie>
            {series.map((s) => (
              <ChipSerie
                key={s}
                href={`/app/mensagens?serie=${encodeURIComponent(s)}`}
                ativo={serie === s}
              >
                {s}
              </ChipSerie>
            ))}
          </div>
        </section>
      )}

      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        {mensagens.length === 0 ? (
          <div
            style={{
              padding: "1.5rem",
              background: "var(--ink-700)",
              border: "1px solid var(--line-on-dark)",
              borderRadius: "var(--radius-lg)",
              color: "var(--bone-dim)",
              fontSize: ".9rem",
            }}
          >
            Nenhuma mensagem publicada ainda.
          </div>
        ) : (
          <div style={{ display: "grid", gap: ".9rem" }}>
            {mensagens.map((m) => (
              <Link
                key={m.id}
                href={`/app/mensagens/${m.slug}`}
                style={{
                  display: "block",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  border: "1px solid var(--line-on-dark)",
                  background: "var(--ink-700)",
                }}
              >
                {m.youtubeVideoId && (
                  <div style={{ aspectRatio: "16/9", background: "var(--ink-900)" }}>
                    {/*
                      A miniatura vem de `urlMiniatura`, que só devolve URL se o
                      id passar na regex de 11 caracteres. Nenhum endereço do
                      banco é usado direto como `src`.
                    */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlMiniatura(m.youtubeVideoId) ?? ""}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ padding: "1rem" }}>
                  {m.serie && (
                    <p
                      style={{
                        fontSize: ".64rem",
                        letterSpacing: ".14em",
                        textTransform: "uppercase",
                        color: "var(--gold)",
                        fontWeight: 600,
                        marginBottom: ".4rem",
                      }}
                    >
                      {m.serie}
                    </p>
                  )}
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem", lineHeight: 1.3 }}>
                    {m.titulo}
                  </p>
                  <p style={{ fontSize: ".78rem", color: "var(--bone-faint)", marginTop: ".3rem" }}>
                    {[m.preletor, formatarData(m.data), formatarDuracao(m.duracaoSegundos)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalPaginas > 1 && (
          <nav className="paginacao" aria-label="Paginação">
            {pagina > 1 && <a href={linkPagina(serie, pagina - 1)}>← Anterior</a>}
            <span aria-current="page">
              {pagina} de {totalPaginas}
            </span>
            {pagina < totalPaginas && <a href={linkPagina(serie, pagina + 1)}>Próxima →</a>}
          </nav>
        )}
      </section>
    </>
  );
}

function ChipSerie({
  href,
  ativo,
  children,
}: {
  href: string;
  ativo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-pressed={ativo}
      style={{
        minHeight: 40,
        display: "inline-flex",
        alignItems: "center",
        padding: ".5rem .9rem",
        borderRadius: 999,
        fontSize: ".78rem",
        fontWeight: ativo ? 600 : 400,
        border: "1px solid",
        borderColor: ativo ? "var(--gold)" : "var(--line-on-dark)",
        background: ativo ? "rgb(var(--gold-rgb) / .14)" : "transparent",
        color: ativo ? "var(--gold)" : "var(--bone-dim)",
      }}
    >
      {children}
    </Link>
  );
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/**
 * `Mensagem.data` é `@db.Date` — uma data sem hora, gravada como meia-noite
 * UTC. Formatar sem `timeZone: "UTC"` no servidor faria o Node aplicar o fuso
 * local e exibir o dia ANTERIOR em qualquer fuso negativo, que é o caso do
 * Brasil inteiro.
 */
function formatarData(data: Date | null): string | null {
  if (!data) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(data);
}

function formatarDuracao(segundos: number | null): string | null {
  if (!segundos || segundos <= 0) return null;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

function linkPagina(serie: string | null, pagina: number): string {
  const params = new URLSearchParams();
  if (serie) params.set("serie", serie);
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query ? `/app/mensagens?${query}` : "/app/mensagens";
}
