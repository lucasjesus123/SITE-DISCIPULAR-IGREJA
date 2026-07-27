"use client";

import { useEffect } from "react";

/**
 * Registra o service worker.
 *
 * `updateViaCache: "none"` é importante: sem isso o navegador pode servir uma
 * versão em cache do próprio sw.js por até 24h, o que atrasaria a chegada de
 * uma correção de segurança no service worker.
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Em desenvolvimento o service worker atrapalha o hot reload e mascara
    // mudanças — só registramos em produção.
    if (window.location.hostname === "localhost") return;

    const registrar = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Falha ao registrar não deve quebrar o app: ele funciona
          // perfeitamente sem service worker, só perde o modo offline.
        });
    };

    // Espera o load para não competir por banda com o conteúdo da página.
    if (document.readyState === "complete") registrar();
    else window.addEventListener("load", registrar, { once: true });
  }, []);

  return null;
}
