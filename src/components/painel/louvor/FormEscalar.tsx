"use client";

import { useActionState } from "react";
import { escalarMembro, type ResultadoLouvor } from "@/app/painel/louvor/acoes";

export function FormEscalar({
  eventoId,
  membros,
  funcoes,
}: {
  eventoId: string;
  membros: { id: string; nome: string }[];
  funcoes: { id: string; nome: string }[];
}) {
  const [resultado, enviar, pendente] = useActionState(escalarMembro, null as ResultadoLouvor);

  return (
    <form action={enviar} className="lvr-escalar">
      <input type="hidden" name="eventoId" value={eventoId} />
      <select name="membroId" required aria-label="Integrante" defaultValue="">
        <option value="" disabled>Integrante…</option>
        {membros.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
      </select>
      <select name="funcaoId" aria-label="Função" defaultValue="">
        <option value="">Função…</option>
        {funcoes.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
      </select>
      <select name="papel" aria-label="Papel" defaultValue="INSTRUMENTISTA">
        <option value="MINISTRANTE">Ministrante</option>
        <option value="INSTRUMENTISTA">Instrumentista</option>
        <option value="VOCAL">Vocal</option>
        <option value="MULTIMIDIA">Multimídia</option>
      </select>
      <button type="submit" className="btn btn--peq" disabled={pendente}>{pendente ? "…" : "Escalar"}</button>
      {resultado && !resultado.ok && <span className="lvr-erro-inline">{resultado.mensagem}</span>}
    </form>
  );
}
