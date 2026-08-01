"use client";

import { useActionState } from "react";
import { criarSala, type ResultadoKids } from "@/app/painel/kids/acoes";

export function FormNovaSala() {
  const [resultado, enviar, pendente] = useActionState(criarSala, null as ResultadoKids);
  return (
    <form action={enviar} className="stack" style={{ "--flow": ".8rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status">{resultado.mensagem}</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: ".8rem" }}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="ns-nome">Nome da sala</label>
          <input id="ns-nome" name="nome" required minLength={2} maxLength={80} placeholder="Ex.: Berçário" />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="ns-faixa">Faixa etária</label>
          <input id="ns-faixa" name="faixaEtaria" maxLength={40} placeholder="0-2 anos" />
        </div>
      </div>
      <button type="submit" className="btn btn--sm" disabled={pendente}>{pendente ? "Criando…" : "Criar sala"}</button>
    </form>
  );
}
