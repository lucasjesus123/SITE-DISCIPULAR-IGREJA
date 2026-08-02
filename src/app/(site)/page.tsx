import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, carregarMensagens } from "@/lib/services/site";
import { estadoAoVivo } from "@/lib/youtube/live";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { HomeInstitucional } from "@/components/site/institucional/HomeInstitucional";
import "./institucional.css";

export const dynamic = "force-dynamic";

/**
 * Home do site da igreja — identidade Institucional (grafite + verde),
 * WHITELABEL: a mesma página serve todas as igrejas, com o logo, cores,
 * conteúdo, PIX, YouTube, WhatsApp e endereço de cada uma vindos do painel.
 */
export default async function Home() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados, mensagens, live] = await Promise.all([
    carregarDadosSite(tenant.id),
    carregarMensagens(tenant.id, 1),
    estadoAoVivo(tenant.id),
  ]);

  // Logo whitelabel: o da igreja (painel) ou, na falta, a marca oficial da
  // Discipular só para o tenant-âncora. Outras igrejas sem logo mostram o nome.
  const logoUrl = dados.config.logoClaroId
    ? urlArquivoPublico(dados.config.logoClaroId)
    : tenant.slug === "discipular"
      ? "/marca/logo-white.png"
      : null;

  return (
    <HomeInstitucional
      dados={dados}
      live={{ aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo }}
      ultimaMsgVideoId={mensagens[0]?.youtubeVideoId ?? null}
      logoUrl={logoUrl}
    />
  );
}
