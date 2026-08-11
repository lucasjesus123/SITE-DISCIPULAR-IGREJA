"use client";

import { useEffect } from "react";

/**
 * Movimento visível também no celular: cada seção surge (fade + sobe) quando
 * entra na tela ao rolar. Sem dependências — IntersectionObserver puro.
 *
 * Respeita "reduzir movimento" do sistema. Se o JS não rodar, tudo aparece
 * normal (o estado escondido só é aplicado quando este componente monta).
 */
export function RevelarAoRolar() {
  useEffect(() => {
    const raiz = document.querySelector(".inst-site");
    if (!raiz) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const alvos = Array.from(
      raiz.querySelectorAll<HTMLElement>(".sec, .horarios, .cells, .give, .footcta, footer"),
    );
    // Aplica o estado inicial só agora (com JS): sem JS, nada fica escondido.
    alvos.forEach((el) => el.classList.add("reveal"));

    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) {
            e.target.classList.add("reveal--vis");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    alvos.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
