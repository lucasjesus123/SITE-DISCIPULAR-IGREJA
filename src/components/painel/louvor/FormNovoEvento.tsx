"use client";

import { useActionState, useEffect, useRef } from "react";
import { adicionarEvento, type ResultadoLouvor } from "@/app/painel/louvor/acoes";

export function FormNovoEvento({ escalaId }: { escalaId: string }) {
  const [resultado, enviar, pendente] = useActionState(adicionarEvento, null as ResultadoLouvor);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resultado?.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <form ref={formRef} action={enviar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      <input type="hidden" name="escalaId" value={escalaId} />
      {resultado && (
        <div className={`alerta alerta--${resultado.ok ? "sucesso" : "erro"}`} role="alert">
          {resultado.ok ? "Evento adicionado." : resultado.mensagem}
        </div>
      )}
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="campo" style={{ flex: 2, minWidth: 180 }}>
          <label className="campo__rotulo" htmlFor="ev-titulo">Título</label>
          <input id="ev-titulo" name="titulo" required minLength={2} maxLength={120} placeholder="Ex.: Culto da Família" />
        </div>
        <div className="campo" style={{ width: 130 }}>
          <label className="campo__rotulo" htmlFor="ev-tipo">Tipo</label>
          <select id="ev-tipo" name="tipo" defaultValue="CULTO">
            <option value="CULTO">Culto</option>
            <option value="ENSAIO">Ensaio</option>
            <option value="EVENTO">Evento</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="campo" style={{ width: 170 }}>
          <label className="campo__rotulo" htmlFor="ev-data">Data</label>
          <input id="ev-data" name="data" type="date" required />
        </div>
        <div className="campo" style={{ width: 120 }}>
          <label className="campo__rotulo" htmlFor="ev-hora">Hora</label>
          <input id="ev-hora" name="hora" type="time" required />
        </div>
        <div className="campo" style={{ flex: 1, minWidth: 160 }}>
          <label className="campo__rotulo" htmlFor="ev-dress">Dress code (opcional)</label>
          <input id="ev-dress" name="dressCodeTexto" maxLength={200} placeholder="Ex.: Preto e branco" />
        </div>
      </div>
      <div className="campo">
        <label className="campo__rotulo" htmlFor="ev-obs">Observações (opcional)</label>
        <textarea id="ev-obs" name="observacoes" rows={2} maxLength={1000} />
      </div>
      <button type="submit" className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Adicionar evento"}</button>
    </form>
  );
}
