"use client";

import { useActionState } from "react";
import { criarInscricao, type ResultadoInscricao } from "@/app/painel/inscricoes/acoes";

export function FormularioNovaInscricao() {
  const [resultado, enviar, pendente] = useActionState(criarInscricao, null as ResultadoInscricao);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1.1rem" } as React.CSSProperties}>
      {resultado && !resultado.ok && (
        <div className="alerta alerta--erro" role="alert">{resultado.mensagem}</div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="in-titulo">Título</label>
        <input id="in-titulo" name="titulo" required minLength={3} maxLength={160} placeholder="Ex.: Retiro de Casais 2026" />
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="in-desc">Descrição (opcional)</label>
        <textarea id="in-desc" name="descricao" rows={3} maxLength={2000} placeholder="Detalhes, data, local, valor…" />
      </div>

      <div style={{ display: "flex", gap: "1.4rem", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".9rem" }}>
          <input type="checkbox" name="pedirTelefone" defaultChecked /> Pedir telefone
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".9rem" }}>
          <input type="checkbox" name="pedirEmail" /> Pedir e-mail
        </label>
      </div>

      <button type="submit" className="btn" disabled={pendente}>
        {pendente ? "Criando…" : "Criar inscrição"}
      </button>
    </form>
  );
}
