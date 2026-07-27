import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { slug as slugSchema } from "@/lib/validation/comum";
import { blocosSeguros } from "@/lib/validation/blocos";
import { EditorBlocos } from "@/components/painel/EditorBlocos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar página" };

/**
 * Editor de uma página do site.
 *
 * DUAS VALIDAÇÕES ACONTECEM ANTES DE QUALQUER COISA APARECER NA TELA:
 *
 *   1. O `slug` da URL passa por Zod. Ele é dado do cliente e vai virar filtro
 *      de consulta; um valor fora do formato vira 404 em vez de exceção do
 *      Prisma com nome de coluna na tela de erro.
 *
 *   2. Os blocos gravados passam por `blocosSeguros()` na LEITURA. O banco
 *      guarda JSON, e JSON no banco não é garantia de nada: pode ter vindo de
 *      uma importação, de um seed antigo ou de um UPDATE manual. Revalidar
 *      antes de editar impede que um bloco inválido entre no editor, seja
 *      salvo de novo e vire conteúdo permanente.
 */
export default async function EditarPaginaDoSite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const ctx = await exigirPermissao("site.editar");
  const { slug: slugBruto } = await params;

  const parse = slugSchema.safeParse(slugBruto);
  if (!parse.success) notFound();

  const pagina = await ctx.db.sitePagina.findFirst({
    where: { slug: parse.data },
    select: {
      id: true, slug: true, titulo: true, seoTitulo: true, seoDescricao: true,
      blocos: true, publicada: true, mostrarMenu: true, ordemMenu: true,
      sistema: true,
    },
  });

  // A consulta já veio escopada ao tenant pelo `ctx.db`: a página de outra
  // igreja não existe aqui, e a resposta é 404 — a mesma de um slug inventado.
  if (!pagina) notFound();

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/paginas" className="link" style={{ fontSize: ".72rem" }}>
              ← Páginas do site
            </Link>
          </p>
          <h1 className="painel__titulo">{pagina.titulo}</h1>
          <p className="painel__sub">
            /{pagina.slug} · {pagina.publicada ? "publicada" : "rascunho"}
            {pagina.sistema && " · página da estrutura do site"}
          </p>
        </div>
      </div>

      <EditorBlocos
        paginaId={pagina.id}
        slug={pagina.slug}
        podePublicar={ctx.pode("site.publicar")}
        // Páginas de sistema não podem ser excluídas — a Server Action recusa
        // de qualquer forma; esconder o botão só evita a frustração do clique.
        podeExcluir={!pagina.sistema}
        inicial={{
          titulo: pagina.titulo,
          seoTitulo: pagina.seoTitulo ?? "",
          seoDescricao: pagina.seoDescricao ?? "",
          publicada: pagina.publicada,
          mostrarMenu: pagina.mostrarMenu,
          ordemMenu: pagina.ordemMenu === null ? "" : String(pagina.ordemMenu),
          blocos: blocosSeguros(pagina.blocos),
        }}
      />
    </>
  );
}
