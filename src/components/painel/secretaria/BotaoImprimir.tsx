"use client";

/** Aciona a impressão do navegador (Ctrl+P) → o usuário salva como PDF. */
export function BotaoImprimir({ rotulo = "Imprimir / Salvar PDF" }: { rotulo?: string }) {
  return (
    <button type="button" className="btn btn--sm" onClick={() => window.print()}>
      {rotulo}
    </button>
  );
}
