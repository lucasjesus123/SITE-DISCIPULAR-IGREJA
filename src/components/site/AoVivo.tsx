"use client";

import { useEffect, useState } from "react";

/**
 * A "luzinha" de AO VIVO.
 *
 * Faz polling em /api/publico/ao-vivo. O servidor já tem cache no banco, então
 * cada consulta aqui custa uma leitura indexada — não uma chamada ao YouTube.
 *
 * DETALHES QUE IMPORTAM
 *  - Intervalo maior fora do horário de culto: não faz sentido perguntar de
 *    30 em 30 segundos numa terça às 15h.
 *  - Pausa quando a aba está oculta. Uma aba esquecida aberta a noite toda
 *    faria 1.400 requisições sem ninguém olhando.
 *  - Nenhum dado sensível trafega: a resposta é { aoVivo, videoId, titulo }.
 */

export interface EstadoLive {
  aoVivo: boolean;
  videoId: string | null;
  titulo: string | null;
}

const INTERVALO_ATIVO_MS = 45_000;
const INTERVALO_OCIOSO_MS = 5 * 60_000;

export function useAoVivo(inicial: EstadoLive): EstadoLive {
  const [estado, setEstado] = useState<EstadoLive>(inicial);

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;

    async function consultar() {
      // Aba oculta: não gasta rede nem bateria do celular do membro.
      if (document.visibilityState === "hidden") {
        agendar(INTERVALO_OCIOSO_MS);
        return;
      }

      try {
        const resposta = await fetch("/api/publico/ao-vivo", {
          cache: "no-store",
          headers: { accept: "application/json" },
        });

        if (resposta.ok && !cancelado) {
          const dados = (await resposta.json()) as Partial<EstadoLive>;
          setEstado({
            aoVivo: dados.aoVivo === true,
            // Revalida o formato do videoId no cliente também: ele vira
            // parte de uma URL de iframe logo abaixo.
            videoId:
              typeof dados.videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(dados.videoId)
                ? dados.videoId
                : null,
            titulo: typeof dados.titulo === "string" ? dados.titulo.slice(0, 200) : null,
          });
          agendar(dados.aoVivo ? INTERVALO_ATIVO_MS : INTERVALO_OCIOSO_MS);
          return;
        }
      } catch {
        // Rede instável não deve poluir o console do visitante.
      }
      agendar(INTERVALO_OCIOSO_MS);
    }

    function agendar(ms: number) {
      if (cancelado) return;
      timer = setTimeout(consultar, ms);
    }

    agendar(inicial.aoVivo ? INTERVALO_ATIVO_MS : INTERVALO_OCIOSO_MS);

    const aoVoltar = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void consultar();
      }
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      cancelado = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [inicial.aoVivo]);

  return estado;
}

/** Selo compacto para o cabeçalho. */
export function SeloAoVivo({ inicial, href = "#ao-vivo" }: { inicial: EstadoLive; href?: string }) {
  const estado = useAoVivo(inicial);

  if (!estado.aoVivo) {
    return (
      <a href={href} className="ao-vivo" style={{ color: "var(--bone-faint)" }}>
        <span
          className="ao-vivo__ponto"
          style={{ background: "currentColor", animation: "none", opacity: 0.5 }}
          aria-hidden="true"
        />
        Ao Vivo
      </a>
    );
  }

  return (
    <a href={href} className="ao-vivo" style={{ color: "#E5484D" }}>
      <span className="ao-vivo__ponto" aria-hidden="true" />
      {/* aria-live avisa quem usa leitor de tela que a transmissão começou,
          sem precisar recarregar a página. */}
      <span aria-live="polite">Ao vivo agora</span>
    </a>
  );
}

/** Faixa no topo da página quando a transmissão começa. */
export function BannerAoVivo({ inicial }: { inicial: EstadoLive }) {
  const estado = useAoVivo(inicial);
  if (!estado.aoVivo) return null;

  return (
    <a href="#ao-vivo" className="ao-vivo--banner">
      <span className="ao-vivo__ponto" aria-hidden="true" />
      <span aria-live="polite">
        {estado.titulo ? `Ao vivo: ${estado.titulo}` : "Estamos ao vivo agora"}
      </span>
      <span aria-hidden="true">→</span>
    </a>
  );
}

/**
 * Player. A URL é montada aqui a partir do videoId já validado por regex —
 * nunca de uma URL recebida pronta do servidor ou do usuário.
 */
export function PlayerAoVivo({ inicial }: { inicial: EstadoLive }) {
  const estado = useAoVivo(inicial);

  if (!estado.aoVivo || !estado.videoId) {
    return (
      <div className="frame">
        <div className="frame__placeholder">Nenhuma transmissão no momento</div>
      </div>
    );
  }

  const src = `https://www.youtube-nocookie.com/embed/${estado.videoId}?rel=0&modestbranding=1&autoplay=1&mute=1`;

  return (
    <div className="frame">
      <iframe
        src={src}
        title={estado.titulo ?? "Transmissão ao vivo"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
        // sandbox limita o que o iframe pode fazer mesmo sendo do YouTube:
        // sem allow-top-navigation, um embed comprometido não consegue
        // redirecionar a página inteira do visitante.
        sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
