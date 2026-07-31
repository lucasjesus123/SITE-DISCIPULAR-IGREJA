"use client";

import { useActionState, useState } from "react";
import { estornarLancamentoAcao, type ResultadoFinanceiro } from "@/app/painel/financeiro/acoes";

/**
 * Estornar um lançamento. Nunca apaga: cria o lançamento contrário. Por isso
 * pede uma justificativa obrigatória antes de confirmar.
 */
export function BotaoEstorno({ lancamentoId }: { lancamentoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [resultado, enviar, pendente] = useActionState(estornarLancamentoAcao, null as ResultadoFinanceiro);

  if (resultado?.ok) {
    return <span className="etiqueta etiqueta--concluido">Estornado</span>;
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAberto(true)}>
        Estornar
      </button>
    );
  }

  return (
    <form action={enviar} style={{ display: "flex", gap: ".4rem", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="lancamentoId" value={lancamentoId} />
      <input
        name="justificativa"
        required
        minLength={3}
        maxLength={300}
        placeholder="Justificativa"
        style={{ maxWidth: 180 }}
      />
      <button type="submit" className="btn btn--sm" disabled={pendente}>
        {pendente ? "…" : "Confirmar"}
      </button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAberto(false)}>
        Cancelar
      </button>
      {resultado && !resultado.ok && (
        <span style={{ color: "#e5484d", fontSize: ".78rem", width: "100%", textAlign: "right" }}>{resultado.mensagem}</span>
      )}
    </form>
  );
}
