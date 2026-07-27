import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Detecção de transmissão ao vivo no YouTube.
 *
 * É isto que acende a "luzinha" de AO VIVO no site e no app.
 *
 * TRÊS PREOCUPAÇÕES DE ENGENHARIA AQUI
 *
 * 1. COTA. A YouTube Data API dá 10.000 unidades por dia. Um `search.list`
 *    custa 100. Ou seja: 100 buscas por dia no total, para TODAS as igrejas.
 *    Sem cache, uma única igreja com movimento derrubaria a integração de
 *    todo mundo antes do almoço. Por isso: cache no banco + janelas de culto.
 *
 * 2. A CHAVE NUNCA VAI AO NAVEGADOR. Toda chamada acontece no servidor. O
 *    cliente só recebe `{ aoVivo: boolean, videoId?: string }`.
 *
 * 3. FALHA GRACIOSA. Se a API cair ou a cota estourar, o site NÃO pode
 *    quebrar. Devolvemos "não está ao vivo" e aplicamos backoff.
 */

export interface EstadoAoVivo {
  aoVivo: boolean;
  videoId: string | null;
  titulo: string | null;
  /** De onde veio a resposta — útil para depurar sem ler log. */
  fonte: "cache" | "api" | "manual" | "fora-de-janela" | "desativado" | "erro";
}

const OFFLINE: EstadoAoVivo = {
  aoVivo: false,
  videoId: null,
  titulo: null,
  fonte: "desativado",
};

interface Janela {
  diaSemana: number;
  inicio: string;
  fim: string;
}

/**
 * Verifica se AGORA está dentro de alguma janela de culto configurada.
 *
 * Isto existe por dois motivos. O óbvio é economizar cota: fora do horário de
 * culto nem consultamos a API. O menos óbvio é evitar falso positivo — muitos
 * canais deixam uma live de música ambiente ou de câmera fixa rodando, e sem
 * a janela o site ficaria com a luzinha acesa a semana inteira, o que treina
 * o membro a ignorá-la.
 */
function dentroDeJanela(janelas: unknown, fusoHorario: string): boolean {
  if (!Array.isArray(janelas) || janelas.length === 0) {
    // Sem janela configurada, não restringimos.
    return true;
  }

  let agora: { dia: number; minutos: number };
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: fusoHorario,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const partes = fmt.formatToParts(new Date());
    const mapaDias: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    const dia = mapaDias[partes.find((p) => p.type === "weekday")?.value ?? ""] ?? -1;
    const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
    const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
    agora = { dia, minutos: hora * 60 + minuto };
  } catch {
    // Fuso inválido no banco: não é motivo para esconder a live.
    return true;
  }

  for (const j of janelas as Janela[]) {
    if (typeof j?.diaSemana !== "number" || j.diaSemana !== agora.dia) continue;
    const ini = paraMinutos(j.inicio);
    const fim = paraMinutos(j.fim);
    if (ini === null || fim === null) continue;
    if (agora.minutos >= ini && agora.minutos <= fim) return true;
  }
  return false;
}

function paraMinutos(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Estado ao vivo de um tenant.
 *
 * @param tenantId  Vem da resolução por hostname, não do cliente.
 */
export async function estadoAoVivo(tenantId: string): Promise<EstadoAoVivo> {
  const config = await prisma.liveConfig.findUnique({ where: { tenantId } });
  if (!config) return OFFLINE;

  // ---- Modo MANUAL: o operador liga e desliga no painel.
  // Útil para quem transmite em plataforma que não é o YouTube, ou para
  // quando a igreja quer controle total.
  if (config.modo === "MANUAL") {
    return {
      aoVivo: config.forcarAoVivo,
      videoId: config.forcarAoVivo ? config.youtubeVideoIdManual : null,
      titulo: config.mensagemAoVivo,
      fonte: "manual",
    };
  }

  // O botão de forçar funciona em qualquer modo — é o plano B do operador
  // quando a detecção automática falha no meio do culto.
  if (config.forcarAoVivo) {
    return {
      aoVivo: true,
      videoId: config.youtubeVideoIdManual ?? config.ultimoVideoId,
      titulo: config.mensagemAoVivo ?? config.ultimoTitulo,
      fonte: "manual",
    };
  }

  if (!config.youtubeChannelId || !env.YOUTUBE_API_KEY) {
    return { ...OFFLINE, fonte: "desativado" };
  }

  if (!dentroDeJanela(config.janelas, config.fusoHorario)) {
    return { ...OFFLINE, fonte: "fora-de-janela" };
  }

  // ---- Cache
  // Backoff exponencial em cima do TTL quando a API vem falhando: se a cota
  // estourou, insistir a cada 60s só mantém o erro.
  const backoff = Math.min(2 ** config.falhasConsecutivas, 30);
  const ttlMs = env.YOUTUBE_LIVE_CACHE_SECONDS * 1000 * backoff;

  if (config.ultimoCheckEm && Date.now() - config.ultimoCheckEm.getTime() < ttlMs) {
    return {
      aoVivo: config.ultimoCheckAoVivo,
      videoId: config.ultimoVideoId,
      titulo: config.ultimoTitulo,
      fonte: "cache",
    };
  }

  // ---- Consulta à API
  try {
    const resultado = await consultarYoutube(config.youtubeChannelId);

    await prisma.liveConfig.update({
      where: { tenantId },
      data: {
        ultimoCheckEm: new Date(),
        ultimoCheckAoVivo: resultado.aoVivo,
        ultimoVideoId: resultado.videoId,
        ultimoTitulo: resultado.titulo,
        falhasConsecutivas: 0,
      },
    });

    return { ...resultado, fonte: "api" };
  } catch (erro) {
    logger.aviso("Falha ao consultar YouTube", {
      tenantId,
      // Sem detalhe do erro: a mensagem da API pode conter a chave na URL.
      falhas: config.falhasConsecutivas + 1,
    });

    await prisma.liveConfig
      .update({
        where: { tenantId },
        data: {
          ultimoCheckEm: new Date(),
          falhasConsecutivas: { increment: 1 },
        },
      })
      .catch(() => {});

    // Mantém o último estado conhecido em vez de piscar offline no meio do
    // culto por causa de uma falha transitória de rede.
    return {
      aoVivo: config.ultimoCheckAoVivo,
      videoId: config.ultimoVideoId,
      titulo: config.ultimoTitulo,
      fonte: "erro",
    };
  }
}

async function consultarYoutube(
  channelId: string,
): Promise<{ aoVivo: boolean; videoId: string | null; titulo: string | null }> {
  // O channelId já foi validado por regex (^UC[A-Za-z0-9_-]{22}$) na gravação,
  // e é re-verificado aqui antes de virar parte de uma URL.
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
    throw new Error("channelId inválido");
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("key", env.YOUTUBE_API_KEY);

  // Timeout obrigatório: sem ele, uma API lenta pendura o render do site e,
  // com requisições acumulando, derruba o processo.
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), 5_000);

  try {
    const resposta = await fetch(url, {
      signal: controle.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!resposta.ok) {
      throw new Error(`HTTP ${resposta.status}`);
    }

    const dados = (await resposta.json()) as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string } }>;
    };

    const item = dados.items?.[0];
    if (!item?.id?.videoId) {
      return { aoVivo: false, videoId: null, titulo: null };
    }

    // Revalidamos o formato do que a API devolveu antes de guardar: um dia
    // esse valor vira `src` de iframe, e confiar cegamente em resposta externa
    // é como confiar em entrada de usuário.
    const videoId = /^[A-Za-z0-9_-]{11}$/.test(item.id.videoId) ? item.id.videoId : null;
    if (!videoId) return { aoVivo: false, videoId: null, titulo: null };

    return {
      aoVivo: true,
      videoId,
      titulo: (item.snippet?.title ?? "").slice(0, 200) || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * URL de embed. Montada SEMPRE a partir de um videoId já validado.
 * Nenhuma URL vinda do usuário ou da API é usada diretamente como `src`.
 */
export function urlEmbed(videoId: string, opcoes?: { autoplay?: boolean }): string | null {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  const base = `https://www.youtube-nocookie.com/embed/${videoId}`;
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    ...(opcoes?.autoplay ? { autoplay: "1", mute: "1" } : {}),
  });
  return `${base}?${params.toString()}`;
}

/** Miniatura do vídeo. Domínio fixo, ID validado. */
export function urlMiniatura(videoId: string): string | null {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}
