"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Botão de copiar a chave PIX.
 *
 * POR QUE ISTO É UM COMPONENTE DE CLIENTE E NÃO UM `onclick` NO HTML
 * A CSP do sistema (src/lib/security/headers.ts) não permite script inline, e
 * um `onclick="..."` seria exatamente isso. O React registra o listener via
 * JavaScript do bundle, que passa pelo nonce/hash da política.
 *
 * ACESSIBILIDADE — a parte que costuma ser esquecida
 * O feedback "copiado" vai para uma região `aria-live`, e NÃO para o rótulo do
 * botão. Trocar o texto do próprio botão enquanto ele está com o foco faz
 * vários leitores de tela reanunciarem o controle inteiro, o que interrompe
 * quem está navegando. Mudando só a região viva, o NVDA/VoiceOver anuncia
 * "Chave copiada" e o foco permanece intacto.
 *
 * A chave também fica visível e selecionável na página: `navigator.clipboard`
 * exige contexto seguro (HTTPS) e permissão do navegador, e falha em alguns
 * navegadores embutidos de aplicativo. Quando falha, a pessoa ainda consegue
 * copiar com a mão — o caminho manual nunca deixa de existir.
 */

type Estado = "pronto" | "copiado" | "falhou";

export function CopiarChave({
  chave,
  rotulo = "Copiar chave PIX",
}: {
  chave: string;
  rotulo?: string;
}) {
  const [estado, setEstado] = useState<Estado>("pronto");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpa o timer se a pessoa navegar antes de ele disparar: um setState em
  // componente desmontado é vazamento silencioso.
  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  async function copiar() {
    let resultado: Estado = "falhou";

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(chave);
        resultado = "copiado";
      }
    } catch {
      // Permissão negada ou contexto inseguro. Não é erro do visitante e não
      // vale poluir o console dele.
    }

    setEstado(resultado);

    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setEstado("pronto"), 5_000);
  }

  return (
    <div className="stack" style={{ "--flow": ".9rem" } as React.CSSProperties}>
      <button type="button" className="btn btn--lg" onClick={copiar}>
        <span aria-hidden="true">
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" strokeLinecap="round" />
          </svg>
        </span>
        {rotulo}
      </button>

      {/*
        A região viva existe desde o primeiro render, vazia. Se ela fosse
        criada só no momento do sucesso, parte dos leitores de tela não
        anunciaria o conteúdo — eles observam mudanças dentro de regiões que
        já estavam no DOM.
      */}
      <p role="status" aria-live="polite" className="campo__ajuda" style={{ minHeight: "1.2em" }}>
        {estado === "copiado" && "Chave copiada para a área de transferência."}
        {estado === "falhou" &&
          "Não foi possível copiar automaticamente. Selecione a chave acima e copie manualmente."}
      </p>
    </div>
  );
}
