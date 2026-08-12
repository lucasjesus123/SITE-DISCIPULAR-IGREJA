import type { ReactElement } from "react";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarPagina, carregarDadosSite } from "@/lib/services/site";
import { blocosSeguros } from "@/lib/validation/blocos";
import { estadoAoVivo } from "@/lib/youtube/live";
import { RenderizarBlocos } from "@/components/site/Blocos";

/**
 * Override editável das páginas institucionais físicas.
 *
 * Se a igreja publicou uma página de blocos com este `slug` no painel
 * (Painel → Páginas), este helper devolve a página montada por blocos — dando
 * controle TOTAL do conteúdo (texto, links, imagens, vídeos, cores) pelo editor
 * whitelabel. Se não houver página publicada (ou vier vazia), devolve `null` e
 * a página física mantém o conteúdo padrão. Assim nada quebra: a igreja que não
 * mexer continua com o layout atual; quem quiser editar, edita 100%.
 */
export async function carregarOverridePagina(slug: string): Promise<ReactElement | null> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return null;

  const pagina = await carregarPagina(tenant.id, slug);
  if (!pagina) return null;

  const blocos = blocosSeguros(pagina.blocos);
  if (blocos.length === 0) return null;

  const [dados, live] = await Promise.all([carregarDadosSite(tenant.id), estadoAoVivo(tenant.id)]);

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
