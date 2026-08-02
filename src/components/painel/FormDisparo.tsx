"use client";

import { useActionState } from "react";
import { enviarDisparoManual, type ResultadoDisparoManual } from "@/app/painel/disparos/acoes";

export function FormDisparo() {
  const [resultado, enviar, pendente] = useActionState(enviarDisparoManual, null as ResultadoDisparoManual);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta alerta--${resultado.ok ? "sucesso" : "erro"}`} role="alert">{resultado.mensagem}</div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="dp-publico">Para quem</label>
        <select id="dp-publico" name="publico" defaultValue="TODOS">
          <option value="TODOS">Todos os contatos</option>
          <option value="MEMBROS">Somente membros</option>
          <option value="VISITANTES">Somente visitantes</option>
        </select>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="dp-texto">Mensagem</label>
        <textarea id="dp-texto" name="texto" rows={5} required minLength={5} maxLength={2000}
          placeholder="Escreva a mensagem… Use {nome} para o primeiro nome e {igreja} para o nome da igreja." />
      </div>

      <p className="lvr-nota">
        A mensagem sai pelo WhatsApp conectado da igreja, em série (com um respiro entre cada envio).
        Só vai para quem tem telefone cadastrado.
      </p>

      <button type="submit" className="btn" disabled={pendente} style={{ justifySelf: "start" }}>
        {pendente ? "Enviando…" : "Disparar agora"}
      </button>
    </form>
  );
}
