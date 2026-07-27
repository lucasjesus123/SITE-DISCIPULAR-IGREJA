import Link from "next/link";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { termoBusca } from "@/lib/validation/comum";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mensagens" };

/**
 * Biblioteca de mensagens / pregações.
 *
 * Todo parâmetro de URL passa por Zod com lista fechada e `safeParse` com
 * fallback: um valor estranho vira o filtro padrão em vez de exceção. E a
 * paginação tem teto — `?pagina=999999` não pode virar varredura de tabela.
 */

const schemaFiltros = z.object({
  q: termoBusca,
  situacao: z.enum(["TODAS", "PUBLICADAS", "RASCUNHOS"]).default("TODAS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 25;

export default async function PaginaMensagens({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("mensagens.gerenciar");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.MensagemWhereInput = {
    ...(filtros.situacao === "PUBLICADAS" ? { publicado: true } : {}),
    ...(filtros.situacao === "RASCUNHOS" ? { publicado: false } : {}),
    ...(filtros.q
      ? {
          // `contains` do Prisma é parametrizado: não existe injeção de SQL.
          // O teto de 80 caracteres do `termoBusca` é por desempenho.
          OR: [
            { titulo: { contains: filtros.q, mode: "insensitive" } },
            { preletor: { contains: filtros.q, mode: "insensitive" } },
            { serie: { contains: filtros.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [mensagens, total, publicadas] = await Promise.all([
    ctx.db.mensagem.findMany({
      where,
      orderBy: [{ destaque: "desc" }, { data: "desc" }, { criadoEm: "desc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, titulo: true, slug: true, preletor: true, serie: true,
        data: true, publicado: true, destaque: true, youtubeVideoId: true,
        duracaoSegundos: true,
      },
    }),
    ctx.db.mensagem.count({ where }),
    ctx.db.mensagem.count({ where: { publicado: true } }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Mensagens</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "mensagem" : "mensagens"} com os filtros
            atuais · {publicadas.toLocaleString("pt-BR")} publicadas no site.
          </p>
        </div>
        <Link href="/painel/mensagens/nova" className="btn btn--sm">
          Nova mensagem
        </Link>
      </div>

      <form method="get" className="barra-ferramentas">
        <input
          type="search"
          name="q"
          defaultValue={filtros.q ?? ""}
          placeholder="Buscar por título, preletor ou série"
          maxLength={80}
          aria-label="Buscar mensagens"
          style={{
            minWidth: 280,
            padding: ".55rem .9rem",
            border: "1px solid var(--line-on-light)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        />
        <select
          name="situacao"
          defaultValue={filtros.situacao}
          aria-label="Filtrar por situação"
          style={{
            padding: ".55rem .9rem",
            border: "1px solid var(--line-on-light)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        >
          <option value="TODAS">Todas</option>
          <option value="PUBLICADAS">Publicadas</option>
          <option value="RASCUNHOS">Rascunhos</option>
        </select>
        <button type="submit" className="btn btn--sm">
          Filtrar
        </button>
      </form>

      {mensagens.length === 0 ? (
        <div className="vazio">
          {filtros.q
            ? "Nenhuma mensagem encontrada com esse termo."
            : "Nenhuma mensagem cadastrada ainda."}
        </div>
      ) : (
        <>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Preletor</th>
                  <th>Série</th>
                  <th>Data</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {mensagens.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/painel/mensagens/${m.id}`} style={{ fontWeight: 600 }}>
                        {m.titulo}
                      </Link>
                      {m.destaque && (
                        <span className="etiqueta etiqueta--urgente" style={{ marginLeft: ".5rem" }}>
                          Destaque
                        </span>
                      )}
                      <span
                        className="dim"
                        style={{ display: "block", fontSize: ".75rem", marginTop: ".2rem" }}
                      >
                        /{m.slug}
                        {m.youtubeVideoId ? " · com vídeo" : " · sem vídeo"}
                        {m.duracaoSegundos ? ` · ${Math.round(m.duracaoSegundos / 60)} min` : ""}
                      </span>
                    </td>
                    <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                      {m.preletor ?? "—"}
                    </td>
                    <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                      {m.serie ?? "—"}
                    </td>
                    <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                      {m.data ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(m.data) : "—"}
                    </td>
                    <td>
                      <span
                        className={`etiqueta etiqueta--${m.publicado ? "concluido" : "andamento"}`}
                      >
                        {m.publicado ? "Publicada" : "Rascunho"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <nav className="paginacao" aria-label="Paginação">
              {filtros.pagina > 1 && (
                <Link href={montarUrl(filtros, filtros.pagina - 1)}>← Anterior</Link>
              )}
              <span aria-current="page">
                {filtros.pagina} de {totalPaginas}
              </span>
              {filtros.pagina < totalPaginas && (
                <Link href={montarUrl(filtros, filtros.pagina + 1)}>Próxima →</Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

function montarUrl(filtros: { q?: string; situacao: string }, pagina: number): string {
  const p = new URLSearchParams();
  if (filtros.q) p.set("q", filtros.q);
  if (filtros.situacao !== "TODAS") p.set("situacao", filtros.situacao);
  p.set("pagina", String(pagina));
  return `/painel/mensagens?${p.toString()}`;
}
