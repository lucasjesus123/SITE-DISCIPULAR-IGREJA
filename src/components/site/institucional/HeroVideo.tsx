"use client";

import { useState } from "react";

/**
 * Vídeo do topo (hero) — toca DENTRO do site.
 *
 * Mostra a miniatura + botão de play; ao clicar, troca por um iframe do YouTube
 * (youtube-nocookie, autoplay) sem jogar o visitante para fora. Só carrega o
 * iframe depois do clique. Sem vídeo, vira um link (ao vivo / mensagens).
 */
export function HeroVideo({
  videoId,
  thumb,
  aoVivo,
  titulo,
  sub,
  hrefFallback,
}: {
  videoId: string | null;
  thumb: string | null;
  aoVivo: boolean;
  titulo: string;
  sub: string;
  hrefFallback: string;
}) {
  const [tocando, setTocando] = useState(false);

  const Miolo = (
    <>
      {thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="tk-vcard__thumb" src={thumb} alt="" />
      )}
      <div className="tk-vcard__ov" />
      {aoVivo && (
        <div className="tk-vcard__lv"><span className="tk-dot" />Ao vivo agora</div>
      )}
      <div className="tk-vcard__play"><i>▶</i></div>
      <div className="tk-vcard__cap"><b>{titulo}</b><span>{sub}</span></div>
    </>
  );

  if (!videoId) {
    const externo = hrefFallback.startsWith("http");
    return (
      <a className="tk-vcard" href={hrefFallback} target={externo ? "_blank" : undefined} rel={externo ? "noopener noreferrer" : undefined}>
        {Miolo}
      </a>
    );
  }

  if (tocando) {
    return (
      <div className="tk-vcard">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          title={titulo}
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
      className="tk-vcard"
      onClick={() => setTocando(true)}
      aria-label={`Assistir: ${titulo}`}
      style={{ padding: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" }}
    >
      {Miolo}
    </button>
  );
}
