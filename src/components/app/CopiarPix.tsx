"use client";

import { useRef, useState } from "react";

/**
 * Chave PIX com botão "copiar".
 *
 * POR QUE ISTO EXISTE
 * Ninguém digita uma chave aleatória de 32 caracteres olhando para a tela do
 * celular. Sem o botão, a pessoa erra um dígito, o banco recusa, e a oferta
 * simplesmente não acontece. Copiar é a diferença entre a intenção e o ato.
 *
 * DETALHES QUE PARECEM PEQUENOS E NÃO SÃO
 *   - `navigator.clipboard` só existe em contexto seguro (HTTPS). Há um plano B
 *     com `<textarea>` + `execCommand`, porque parte dos membros abre o app em
 *     WebView antiga onde a API moderna não está disponível.
 *   - A confirmação é anunciada com `aria-live`: quem usa leitor de tela
 *     precisa saber que copiou, e o botão não muda de posição.
 *   - A chave aparece INTEIRA e selecionável. Mascarar seria "segurança"
 *     teatral: chave PIX é pública por definição — é o que a igreja imprime no
 *     telão. O que não pode circular é a chave ERRADA.
 */
export function CopiarPix({ chave, titular }: { chave: string; titular: string | null }) {
  const [estado, setEstado] = useState<"parado" | "copiado" | "falhou">("parado");
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function copiar() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(chave);
        concluir("copiado");
        return;
      }
      concluir(copiarPlanoB() ? "copiado" : "falhou");
    } catch {
      // Permissão negada ou WebView sem suporte: cai no plano B antes de
      // desistir e pedir a cópia manual.
      concluir(copiarPlanoB() ? "copiado" : "falhou");
    }
  }

  function copiarPlanoB(): boolean {
    const area = areaRef.current;
    if (!area) return false;
    try {
      area.removeAttribute("readonly");
      area.select();
      area.setSelectionRange(0, chave.length);
      const ok = document.execCommand("copy");
      area.setAttribute("readonly", "");
      return ok;
    } catch {
      return false;
    }
  }

  function concluir(resultado: "copiado" | "falhou") {
    setEstado(resultado);
    // Volta ao estado neutro para que uma segunda cópia também dê retorno
    // visível — sem isso o botão fica "Copiado!" para sempre e a pessoa não
    // sabe se o segundo clique funcionou.
    window.setTimeout(() => setEstado("parado"), 2500);
  }

  return (
    <div>
      <div
        style={{
          padding: "1rem",
          background: "var(--ink-700)",
          border: "1px solid var(--line-on-dark)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <p
          style={{
            fontSize: ".64rem",
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "var(--gold)",
            fontWeight: 600,
          }}
        >
          Chave PIX
        </p>

        <p
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: ".95rem",
            marginTop: ".5rem",
            wordBreak: "break-all",
            lineHeight: 1.5,
            // Permite selecionar com o dedo se a pessoa preferir o jeito manual.
            userSelect: "all",
          }}
        >
          {chave}
        </p>

        {titular && (
          <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", marginTop: ".6rem" }}>
            Em nome de {titular}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={copiar}
        className="btn btn--block"
        style={{ marginTop: ".9rem" }}
      >
        {estado === "copiado" ? "Chave copiada" : estado === "falhou" ? "Copie manualmente" : "Copiar chave"}
      </button>

      <p className="sr-only" aria-live="polite">
        {estado === "copiado"
          ? "Chave PIX copiada para a área de transferência."
          : estado === "falhou"
            ? "Não foi possível copiar automaticamente. Selecione a chave acima."
            : ""}
      </p>

      {/*
        Textarea fora de tela para o plano B. Fica com `readonly` e `tabIndex`
        negativo para não entrar na navegação por teclado nem receber digitação.
      */}
      <textarea
        ref={areaRef}
        defaultValue={chave}
        readOnly
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -9999,
          top: 0,
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
