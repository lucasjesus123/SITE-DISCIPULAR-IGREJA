"use client";

import { useEffect, useRef } from "react";
import { feixe, LARGURA_ONDA } from "@/lib/site/ondas";

/**
 * Fundo animado da área restrita (login / recuperar senha).
 *
 * É um campo de "ondas de seda": dezenas de linhas senoidais finas, com um
 * degradê verde→ciano→azul, deslizando em velocidades diferentes. Puro
 * SVG + CSS — nada de biblioteca externa (a CSP do sistema bloquearia) e
 * nada que dependa de rede. A geometria (pura e testada) vem de
 * `src/lib/site/ondas.ts`; aqui só renderizamos e animamos.
 *
 * INTERATIVIDADE: as camadas fazem um leve parallax seguindo o cursor. Tudo
 * DESLIGADO para quem pediu menos movimento (prefers-reduced-motion).
 */

const W = LARGURA_ONDA;
const H = 600;

const CAMADAS = [
  { classe: "onda--a", linhas: feixe(26, 300, 210, 42, 400, 0.26) },
  { classe: "onda--b", linhas: feixe(22, 300, 300, 62, 560, 0.2) },
  { classe: "onda--c", linhas: feixe(16, 300, 150, 30, 320, 0.34) },
];

export function FundoOndas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let ax = 0, ay = 0; // alvo
    let cx = 0, cy = 0; // atual (suavizado)

    function aoMover(e: PointerEvent) {
      const nx = e.clientX / window.innerWidth - 0.5; // -0.5..0.5
      const ny = e.clientY / window.innerHeight - 0.5;
      ax = nx * 40; // amplitude do parallax em px
      ay = ny * 28;
      if (!raf) laço();
    }
    function laço() {
      cx += (ax - cx) * 0.08;
      cy += (ay - cy) * 0.08;
      el!.style.setProperty("--px", cx.toFixed(2));
      el!.style.setProperty("--py", cy.toFixed(2));
      if (Math.abs(ax - cx) > 0.1 || Math.abs(ay - cy) > 0.1) {
        raf = requestAnimationFrame(laço);
      } else {
        raf = 0;
      }
    }

    window.addEventListener("pointermove", aoMover, { passive: true });
    return () => {
      window.removeEventListener("pointermove", aoMover);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="tela-login__ondas" aria-hidden="true">
      {/* halos de cor difusos atrás das linhas */}
      <span className="tela-login__halo tela-login__halo--verde" />
      <span className="tela-login__halo tela-login__halo--azul" />

      <svg className="tela-login__svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="ondaGrad" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0" stopColor="#2bf5a0" />
            <stop offset="0.5" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#5b7cff" />
          </linearGradient>
          <filter id="ondaBlur" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="1.1" />
          </filter>
        </defs>

        {CAMADAS.map((camada) => (
          <g key={camada.classe} className={`onda ${camada.classe}`} filter="url(#ondaBlur)">
            {camada.linhas.map((l, i) => (
              <path key={i} d={l.d} fill="none" stroke="url(#ondaGrad)" strokeWidth={1} style={{ opacity: l.o }} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
