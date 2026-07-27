import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, carregarPagina } from "@/lib/services/site";
import { blocosSeguros } from "@/lib/validation/blocos";
import { estadoAoVivo } from "@/lib/youtube/live";
import { RenderizarBlocos } from "@/components/site/Blocos";
import { obterTokenCsrf } from "@/lib/security/csrf";

/**
 * Página dinâmica montada pelo cliente no editor whitelabel.
 *
 * Atende /quem-somos, /pastores, /celulas, /escola, /contribua e qualquer
 * página nova que a igreja criar.
 *
 * NOTA SOBRE A ROTA
 * Este `[slug]` é um catch-all de UM nível, deliberadamente. Um `[...slug]`
 * captaria também caminhos como /painel/pessoas caso alguma rota específica
 * deixasse de existir, e serviria conteúdo público onde deveria haver
 * autenticação. Rotas específicas (/oracao, /contato, /painel, /app) têm
 * prioridade sobre esta no roteador do Next.
 */

export const dynamic = "force-dynamic";

/** Slugs que pertencem ao sistema e nunca podem ser criados como página. */
const RESERVADOS = new Set([
  "api", "painel", "plataforma", "app", "login", "sair", "manifest.webmanifest",
  "sw.js", "_next", "oracao", "visita", "batismo", "contato", "privacidade",
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tenant = await tenantDaRequisicao();
  if (!tenant || RESERVADOS.has(slug)) return {};

  const pagina = await carregarPagina(tenant.id, slug);
  if (!pagina) return {};

  return {
    title: pagina.seoTitulo ?? pagina.titulo,
    description: pagina.seoDescricao ?? undefined,
    alternates: { canonical: `/${slug}` },
    openGraph: {
      title: pagina.seoTitulo ?? pagina.titulo,
      description: pagina.seoDescricao ?? undefined,
    },
  };
}

export default async function PaginaDinamica({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Formato do slug validado antes de tocar o banco.
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) notFound();
  if (RESERVADOS.has(slug)) notFound();

  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [pagina, dados, live] = await Promise.all([
    carregarPagina(tenant.id, slug),
    carregarDadosSite(tenant.id),
    estadoAoVivo(tenant.id),
    obterTokenCsrf(),
  ]);

  // Página inexistente ou não publicada -> 404 idêntico. Um status diferente
  // para "existe mas está em rascunho" contaria ao visitante que a igreja
  // está preparando algo naquele endereço.
  if (!pagina) notFound();

  // Revalidação na leitura: blocos corrompidos ou de versão futura são
  // descartados em vez de derrubarem a página.
  const blocos = blocosSeguros(pagina.blocos);

  if (blocos.length === 0) {
    return (
      <section className="section theme-light">
        <div className="container container--narrow">
          <h1>{pagina.titulo}</h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            Esta página está sendo preparada.
          </p>
        </div>
      </section>
    );
  }

  return (
    <RenderizarBlocos
      blocos={blocos}
      contexto={{
        agenda: dados.agenda,
        campi: dados.campi,
        estadoLive: { aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo },
      }}
    />
  );
}
