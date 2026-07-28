"use client";

import { useEffect } from "react";

/**
 * Movimento ao rolar — os blocos surgem suavemente ao entrar na tela.
 *
 * Por que JS (IntersectionObserver) e não só CSS scroll-driven: o CSS novo
 * (`animation-timeline: view()`) tem suporte irregular entre navegadores e, num
 * navegador que só o suporta pela metade, deixava o conteúdo preso invisível.
 * Aqui é à prova de falha: só ESCONDEMOS os blocos DEPOIS que o JS confirma que
 * vai revelá-los (classe `mov-ready`). Sem JS, ou com "menos movimento" ligado
 * no sistema, tudo aparece normal — nada some.
 */

const SELETOR = [
  ".section-head",
  ".section .card",
  ".section .value",
  ".section .info-line",
  ".section .frame",
  ".pix-card",
  ".stat",
  ".faq details",
  ".scripture__text",
  ".scripture__ref",
  ".split > div",
  ".footer-cta",
  ".footer-grid > div",
].join(",");

export function MovimentoAoRolar() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const alvos = Array.from(document.querySelectorAll<HTMLElement>(SELETOR));
    if (alvos.length === 0) return;

    document.documentElement.classList.add("mov-ready");

    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.classList.add("visivel");
            observador.unobserve(entrada.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );

    const alturaTela = window.innerHeight;
    alvos.forEach((el, i) => {
      el.dataset.revelar = "";
      el.style.setProperty("--mov-i", String(i % 5));
      // Bloco já visível ao carregar: mostra na hora (evita flash e blocos
      // presos invisíveis acima da dobra). O resto revela ao rolar.
      if (el.getBoundingClientRect().top < alturaTela * 0.92) {
        el.classList.add("visivel");
      } else {
        observador.observe(el);
      }
    });

    return () => observador.disconnect();
  }, []);

  return null;
}
