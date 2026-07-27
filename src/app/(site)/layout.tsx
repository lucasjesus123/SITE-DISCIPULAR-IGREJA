import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema, urlGoogleFonts, temaMonocromatico } from "@/lib/site/theme";
import { estadoAoVivo } from "@/lib/youtube/live";
import { Cabecalho } from "@/components/site/Cabecalho";
import { Rodape } from "@/components/site/Rodape";
import { BannerAoVivo } from "@/components/site/AoVivo";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Layout do site público de uma igreja.
 *
 * Tudo que aparece aqui — nome, logo, cores, fontes, menu, endereços — vem do
 * banco, escopado pelo tenant que o HOSTNAME resolveu. É isto que faz o
 * whitelabel: o mesmo código, servindo 30 sites visualmente distintos.
 */

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return { title: "Igreja não encontrada" };

  const { config } = await carregarDadosSite(tenant.id);
  const canonica = `https://${tenant.hostCanonico}`;

  return {
    title: {
      default: config.nomeExibicao,
      template: `%s · ${config.nomeExibicao}`,
    },
    description: config.descricaoSeo ?? config.tagline ?? undefined,
    metadataBase: new URL(canonica),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      siteName: config.nomeExibicao,
      title: config.nomeExibicao,
      description: config.descricaoSeo ?? config.tagline ?? undefined,
      locale: "pt_BR",
      url: canonica,
    },
    // O site público DEVE ser indexado — é o oposto do painel.
    robots: { index: true, follow: true },
    icons: config.faviconId
      ? { icon: urlArquivoPublico(config.faviconId) }
      : tenant.slug === "discipular"
        ? { icon: "/marca/favicon.ico", apple: "/marca/apple-touch-icon.png" }
        : undefined,
  };
}

/**
 * Logo do cabeçalho. Prioridade: (1) logo que o cliente enviou no painel;
 * (2) marca oficial da Discipular servida de /public (fallback só para o
 * tenant-âncora); (3) nada → o cabeçalho mostra o nome em texto.
 */
function logoDoCabecalho(logoClaroId: string | null, slug: string): string | null {
  if (logoClaroId) return urlArquivoPublico(logoClaroId);
  if (slug === "discipular") return "/marca/logo-white.png";
  return null;
}

export default async function LayoutSite({ children }: { children: React.ReactNode }) {
  const tenant = await tenantDaRequisicao();

  // Sem tenant para este host: 404, e não uma página de erro que revele que
  // a plataforma existe e quais igrejas estão nela.
  if (!tenant) notFound();

  // Igreja suspensa ou cancelada: página institucional neutra, sem expor o
  // motivo (que é comercial e não interessa ao visitante).
  if (tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
    return (
      <main className="theme-dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
        <div className="centro stack">
          <h1 className="h3">Site temporariamente indisponível</h1>
          <p className="dim">Estamos em manutenção. Volte em breve.</p>
        </div>
      </main>
    );
  }

  const [dados, live] = await Promise.all([
    carregarDadosSite(tenant.id),
    estadoAoVivo(tenant.id),
  ]);

  const menu = [
    { rotulo: "Quem Somos", href: "/quem-somos" },
    { rotulo: "Pastores", href: "/pastores" },
    { rotulo: "Células", href: "/celulas" },
    { rotulo: "Escola", href: "/escola" },
    { rotulo: "Mensagens", href: "/mensagens" },
    { rotulo: "Contribua", href: "/contribua" },
    { rotulo: "Contato", href: "/contato" },
    // Páginas extras criadas pelo cliente no painel.
    ...dados.paginas
      .filter((p) => !["home", "quem-somos", "pastores", "celulas", "escola", "contribua", "contato", "mensagens"].includes(p.slug))
      .map((p) => ({ rotulo: p.titulo, href: `/${p.slug}` })),
  ];

  const estadoLive = { aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo };

  // Acento neutro (cinza/preto) → ativa o tratamento "Preto & Branco Moderno":
  // acento branco nas seções escuras, hero em caixa-alta pesada. Ver globals.css.
  const classeModo = temaMonocromatico(dados.tema) ? "modo-mono" : undefined;

  return (
    <>
      {/*
        Tema do tenant. O conteúdo de `cssDoTema` é montado exclusivamente a
        partir de valores que passaram por allowlist (regex hexadecimal para
        cores, lista fechada para fontes) — ver src/lib/site/theme.ts.
        Sem essa garantia, este seria o ponto de injeção de CSS do sistema.
      */}
      <style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />
      <link rel="stylesheet" href={urlGoogleFonts(dados.tema)} />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="manifest" href="/manifest.webmanifest" />

      <a href="#conteudo" className="pular-para-conteudo">
        Pular para o conteúdo
      </a>

      <div className={classeModo}>
        <BannerAoVivo inicial={estadoLive} />

        <Cabecalho
          nomeIgreja={dados.config.nomeExibicao}
          logoUrl={logoDoCabecalho(dados.config.logoClaroId, tenant.slug)}
          menu={menu}
          estadoLive={estadoLive}
        />

        <main id="conteudo">{children}</main>

        <Rodape
          config={dados.config}
          campi={dados.campi}
          menu={menu}
          marcaUrl={
            dados.config.logoClaroId
              ? urlArquivoPublico(dados.config.logoClaroId)
              : tenant.slug === "discipular"
                ? "/marca/mark-light.png"
                : null
          }
        />
      </div>
    </>
  );
}
