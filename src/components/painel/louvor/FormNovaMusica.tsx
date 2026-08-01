"use client";

import { useActionState, useEffect, useRef } from "react";
import { adicionarMusica, type ResultadoLouvor } from "@/app/painel/louvor/acoes";
import { todosOsTons } from "@/lib/louvor/tom";

export function FormNovaMusica() {
  const [resultado, enviar, pendente] = useActionState(adicionarMusica, null as ResultadoLouvor);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resultado?.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <form ref={formRef} action={enviar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta alerta--${resultado.ok ? "sucesso" : "erro"}`} role="alert">
          {resultado.ok ? "Música adicionada." : resultado.mensagem}
        </div>
      )}
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="campo" style={{ flex: 2, minWidth: 180 }}>
          <label className="campo__rotulo" htmlFor="ms-titulo">Título</label>
          <input id="ms-titulo" name="titulo" required minLength={2} maxLength={160} placeholder="Ex.: Bondade de Deus" />
        </div>
        <div className="campo" style={{ flex: 1, minWidth: 140 }}>
          <label className="campo__rotulo" htmlFor="ms-artista">Artista (opcional)</label>
          <input id="ms-artista" name="artista" maxLength={120} placeholder="Ex.: Isaias Saad" />
        </div>
        <div className="campo" style={{ width: 100 }}>
          <label className="campo__rotulo" htmlFor="ms-tom">Tom</label>
          <select id="ms-tom" name="tomPadrao" defaultValue="">
            <option value="">—</option>
            {todosOsTons().map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="campo" style={{ flex: 1, minWidth: 180 }}>
          <label className="campo__rotulo" htmlFor="ms-cifra">Link da cifra (opcional)</label>
          <input id="ms-cifra" name="linkCifra" maxLength={500} placeholder="https://..." />
        </div>
        <div className="campo" style={{ flex: 1, minWidth: 180 }}>
          <label className="campo__rotulo" htmlFor="ms-video">Link do vídeo (opcional)</label>
          <input id="ms-video" name="linkVideo" maxLength={500} placeholder="https://youtube.com/..." />
        </div>
      </div>
      <button type="submit" className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Adicionar música"}</button>
    </form>
  );
}
