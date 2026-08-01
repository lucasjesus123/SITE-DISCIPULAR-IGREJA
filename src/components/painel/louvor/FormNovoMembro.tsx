"use client";

import { useActionState, useEffect, useRef } from "react";
import { adicionarMembro, type ResultadoLouvor } from "@/app/painel/louvor/acoes";

export function FormNovoMembro({ funcoes }: { funcoes: { id: string; nome: string }[] }) {
  const [resultado, enviar, pendente] = useActionState(adicionarMembro, null as ResultadoLouvor);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resultado?.ok) formRef.current?.reset();
  }, [resultado]);

  return (
    <form ref={formRef} action={enviar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta alerta--${resultado.ok ? "sucesso" : "erro"}`} role="alert">
          {resultado.ok ? "Integrante adicionado." : resultado.mensagem}
        </div>
      )}
      <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
        <div className="campo" style={{ flex: 2, minWidth: 180 }}>
          <label className="campo__rotulo" htmlFor="mb-nome">Nome</label>
          <input id="mb-nome" name="nome" required minLength={2} maxLength={160} placeholder="Nome do integrante" />
        </div>
        <div className="campo" style={{ flex: 1, minWidth: 140 }}>
          <label className="campo__rotulo" htmlFor="mb-wpp">WhatsApp (opcional)</label>
          <input id="mb-wpp" name="whatsapp" maxLength={20} placeholder="(00) 00000-0000" />
        </div>
      </div>

      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".4rem" }}>Funções / instrumentos</p>
        <div className="lvr-chips">
          {funcoes.map((f) => (
            <label key={f.id} className="lvr-chip-check">
              <input type="checkbox" name="funcoes" value={f.id} /> {f.nome}
            </label>
          ))}
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".9rem" }}>
        <input type="checkbox" name="ehLider" /> É líder do ministério
      </label>

      <button type="submit" className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Adicionar integrante"}</button>
    </form>
  );
}
