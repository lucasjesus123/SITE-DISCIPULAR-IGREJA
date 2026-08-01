"use client";

import { useActionState } from "react";
import { criarEscala, type ResultadoLouvor } from "@/app/painel/louvor/acoes";
import { nomeDoMes } from "@/lib/louvor/escala";

export function FormNovaEscala({ anoAtual, mesAtual }: { anoAtual: number; mesAtual: number }) {
  const [resultado, enviar, pendente] = useActionState(criarEscala, null as ResultadoLouvor);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {resultado && !resultado.ok && <div className="alerta alerta--erro" role="alert">{resultado.mensagem}</div>}
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="campo" style={{ flex: 1, minWidth: 140 }}>
          <label className="campo__rotulo" htmlFor="es-mes">Mês</label>
          <select id="es-mes" name="mes" defaultValue={mesAtual}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{nomeDoMes(m)}</option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ width: 120 }}>
          <label className="campo__rotulo" htmlFor="es-ano">Ano</label>
          <input id="es-ano" name="ano" type="number" min={2020} max={2100} defaultValue={anoAtual} />
        </div>
      </div>
      <button type="submit" className="btn" disabled={pendente}>{pendente ? "Criando…" : "Lançar escala"}</button>
    </form>
  );
}
