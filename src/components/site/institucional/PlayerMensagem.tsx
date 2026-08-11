"use client";

import { useState } from "react";

/**
 * Player da "última mensagem" na home.
 *
 * Mostra a miniatura com o botão de play; ao clicar, troca por um iframe do
 * YouTube que toca DENTRO do site (autoplay), sem jogar o visitante para fora.
 * Usa youtube-nocookie (menos rastreio) e só carrega o iframe após o clique
 * (nada do YouTube é baixado enquanto ninguém aperta o play).
 *
 * Sem vídeo cadastrado, vira um link para a página de mensagens — a home nunca
 * fica com um player quebrado.
 */
export function PlayerMensagem({
  videoId,
  thumb,
  aoVivo,
  hrefFallback,
}: {
  videoId: string | null;
  thumb: string | null;
  aoVivo: boolean;
  hrefFallback: string;
}) {
  const [tocando, setTocando] = useState(false);

  if (!videoId) {
    const externo = hrefFallback.startsWith("http");
    return (
      <a
        className="player"
        href={hrefFallback}
        target={externo ? "_blank" : undefined}
        rel={externo ? "noopener noreferrer" : undefined}
      >
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="Última mensagem" />
        )}
        <span className="play">▶</span>
      </a>
    );
  }

  if (tocando) {
    return (
      <div className="player">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title="Última mensagem"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, zIndex: 3 }}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="player"
      onClick={() => setTocando(true)}
      aria-label="Assistir a última mensagem"
      style={{ padding: 0, width: "100%", cursor: "pointer", font: "inherit", color: "inherit" }}
    >
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumb} alt="Última mensagem" />
      )}
      {aoVivo && (
        <span className="tag">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} /> AO VIVO
        </span>
      )}
      <span className="play">▶</span>
    </button>
  );
}
