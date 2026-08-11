import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema, urlGoogleFonts } from "@/lib/site/theme";
import { sessaoAtual } from "@/lib/auth/session";
import { estadoAoVivo } from "@/lib/youtube/live";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { BarraApp } from "@/components/app/BarraApp";
import { RegistrarServiceWorker } from "@/components/app/RegistrarServiceWorker";
import { tenantDb } from "@/lib/db/tenant-client";
import { carregarTogglesApp, carregarContextoMembro } from "@/lib/services/app-membro";
import { navDoApp } from "@/lib/app-membro/recursos";
import { carregarModulos } from "@/lib/services/modulos";
import { CreditoConexao } from "@/components/CreditoConexao";
import "../globals.css";

/**
 * Layout do aplicativo dos membros (PWA).
 *
 * DIFERENÇA IMPORTANTE PARA O PAINEL
 * O app NÃO exige login no layout. Boa parte dele é útil sem conta: agenda,
 * transmissão ao vivo, pedido de oração, endereços. Exigir cadastro para ver
 * o horário do culto afastaria justamente quem está chegando.
 *
 * As telas que mostram dado pessoal (perfil, meus pedidos, minha célula)
 * verificam a sessão individualmente. É o contrário do painel, onde o padrão
 * é fechado.
 */

export const metadata: Metadata = {
  title: { default: "Aplicativo", template: "%s · Aplicativo" },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  // Ocupa a área do notch quando instalado na tela inicial.
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  if (tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
    return (
      <main className="theme-dark" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem" }}>
        <p className="dim">Aplicativo temporariamente indisponível.</p>
      </main>
    );
  }

  const [dados, sessao, live] = await Promise.all([
    carregarDadosSite(tenant.id),
    sessaoAtual(),
    estadoAoVivo(tenant.id),
    obterTokenCsrf(),
  ]);

  const logado = sessao !== null && sessao.tenantId === tenant.id;

  // Navegação do app conforme os toggles da igreja + vínculos do membro
  // (recurso desligado some da barra; Contribuir exige PIX; Célula exige vínculo).
  const db = tenantDb(tenant.id);

  // Módulo "app" desligado: a igreja não contratou o app de membros.
  const modulos = await carregarModulos(db);
  if (!modulos.app) {
    return (
      <main className="theme-dark" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: "2rem" }}>
        <p className="dim">{dados.config.nomeExibicao} — aplicativo em breve.</p>
      </main>
    );
  }

  const [toggles, contexto] = await Promise.all([
    carregarTogglesApp(db),
    carregarContextoMembro(db, {
      pixConfigurado: Boolean(dados.config.pixChave),
      userId: logado ? sessao!.userId : null,
    }),
  ]);
  const itensNav = navDoApp(toggles, contexto).map((i) => ({ chave: i.chave, href: i.href, rotulo: i.rotulo }));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />
      <link rel="stylesheet" href={urlGoogleFonts(dados.tema)} />
      <link rel="manifest" href="/manifest.webmanifest" />

      <RegistrarServiceWorker />

      <div
        className="theme-dark"
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          // Respeita a barra de gestos do iPhone quando instalado.
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <main style={{ flex: 1, paddingBottom: "5.5rem" }}>
          {children}
          <p style={{ textAlign: "center", fontSize: 11, opacity: 0.5, marginTop: "2rem" }}>
            <CreditoConexao />
          </p>
        </main>

        <BarraApp
          itens={itensNav}
          logado={logado}
          aoVivo={live.aoVivo}
          nomeIgreja={dados.config.nomeExibicao}
        />
      </div>
    </>
  );
}
