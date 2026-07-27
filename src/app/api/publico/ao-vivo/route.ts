import { NextResponse } from "next/server";
import { contextoDeRequest } from "@/lib/http/contexto";
import { resolverTenantPorHost } from "@/lib/tenant/resolve";
import { estadoAoVivo } from "@/lib/youtube/live";
import { tratarErro } from "@/lib/http/erros";

/**
 * Estado da transmissão ao vivo do tenant do hostname.
 *
 * Rota pública e sem autenticação — de propósito: o site precisa dela antes
 * de qualquer login. Ela é segura porque:
 *   - não recebe NENHUM parâmetro (o tenant vem do host)
 *   - devolve só três campos, todos já públicos por natureza
 *   - a chave da API do YouTube fica no servidor e nunca é repassada
 *   - o cache no banco impede que polling vire chamada externa
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { host } = contextoDeRequest(request);
    const tenant = await resolverTenantPorHost(host);

    if (!tenant || tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
      // Resposta neutra: não confirmamos nem negamos que a igreja existe.
      return NextResponse.json(
        { aoVivo: false, videoId: null, titulo: null },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const estado = await estadoAoVivo(tenant.id);

    return NextResponse.json(
      {
        aoVivo: estado.aoVivo,
        videoId: estado.videoId,
        titulo: estado.titulo,
      },
      {
        headers: {
          // Cache curto e PRIVADO. `public` faria um proxy compartilhado
          // guardar a resposta de uma igreja e entregá-la para outra.
          "Cache-Control": "private, max-age=20",
        },
      },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "publico/ao-vivo" });
  }
}
