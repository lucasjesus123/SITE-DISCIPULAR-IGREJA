import Link from "next/link";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { blocosSeguros } from "@/lib/validation/blocos";
import { FormularioNovaPagina } from "@/components/painel/EditorBlocos";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Páginas do site" };

/**
 * Páginas do site.
 *
 * O conteúdo de cada página é um ARRAY DE BLOCOS estruturados, não HTML. Aqui
 * a lista só conta quantos blocos existem — e usa `blocosSeguros()` para isso,
 * que revalida o JSON na leitura. Assim um registro corrompido (importação
 * antiga, correção manual em SQL) aparece com a contagem menor em vez de
 * quebrar a tela inteira.
 */

const schemaFiltros = z.object({
  situacao: z.enum(["TODAS", "PUBLICADAS", "RASCUNHOS"]).default("TODAS"),
});

export default async function PaginasDoSite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("site.editar");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.SitePaginaWhereInput = {
    ...(filtros.situacao === "PUBLICADAS" ? { publicada: true } : {}),
    ...(filtros.situacao === "RASCUNHOS" ? { publicada: false } : {}),
  };

  const paginas = await ctx.db.sitePagina.findMany({
    where,
    orderBy: [{ ordemMenu: "asc" }, { titulo: "asc" }],
    // Teto de segurança: a action limita a criação a 60 páginas por igreja.
    take: 80,
    select: {
      id: true, slug: true, titulo: true, publicada: true, mostrarMenu: true,
      ordemMenu: true, sistema: true, blocos: true, atualizadoEm: true,
    },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Páginas do site</h1>
          <p className="painel__sub">
            {paginas.length} {paginas.length === 1 ? "página" : "páginas"}. O conteúdo é montado com
            blocos prontos — sem edição de código, sem risco de colar algo perigoso.
          </p>
        </div>
      </div>

      <div className="barra-ferramentas">
        <a href="/painel/paginas" className="filtro-chip" aria-pressed={filtros.situacao === "TODAS"}>
          Todas
        </a>
        <a
          href="/painel/paginas?situacao=PUBLICADAS"
          className="filtro-chip"
          aria-pressed={filtros.situacao === "PUBLICADAS"}
        >
          Publicadas
        </a>
        <a
          href="/painel/paginas?situacao=RASCUNHOS"
          className="filtro-chip"
          aria-pressed={filtros.situacao === "RASCUNHOS"}
        >
          Rascunhos
        </a>
      </div>

      <details className="secao-painel">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Nova página</summary>
        <div style={{ marginTop: "1rem" }}>
          <FormularioNovaPagina />
        </div>
      </details>

      {paginas.length === 0 ? (
        <div className="vazio">Nenhuma página com esse filtro.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Página</th>
                <th>Endereço</th>
                <th>Blocos</th>
                <th>Menu</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {paginas.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/painel/paginas/${p.slug}`} style={{ fontWeight: 600 }}>
                      {p.titulo}
                    </Link>
                    {p.sistema && (
                      <span className="etiqueta" style={{ marginLeft: ".5rem" }}>
                        Do sistema
                      </span>
                    )}
                    <span
                      className="dim"
                      style={{ display: "block", fontSize: ".75rem", marginTop: ".2rem" }}
                    >
                      Atualizada em{" "}
                      {new Intl.DateTimeFormat("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      }).format(p.atualizadoEm)}
                    </span>
                  </td>
                  <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>/{p.slug}</td>
                  <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                    {blocosSeguros(p.blocos).length}
                  </td>
                  <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                    {p.mostrarMenu ? (p.ordemMenu === null ? "Sim" : `Sim (${p.ordemMenu})`) : "Não"}
                  </td>
                  <td>
                    <span className={`etiqueta etiqueta--${p.publicada ? "concluido" : "andamento"}`}>
                      {p.publicada ? "Publicada" : "Rascunho"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
