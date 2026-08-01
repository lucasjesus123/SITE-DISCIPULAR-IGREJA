"use client";

import { useActionState } from "react";
import { adicionarMusicaAoEvento, type ResultadoLouvor } from "@/app/painel/louvor/acoes";
import { todosOsTons } from "@/lib/louvor/tom";

export function FormMusicaEvento({
  eventoId,
  musicas,
}: {
  eventoId: string;
  musicas: { id: string; titulo: string }[];
}) {
  const [resultado, enviar, pendente] = useActionState(adicionarMusicaAoEvento, null as ResultadoLouvor);

  if (musicas.length === 0) {
    return <p className="lvr-nota">Cadastre músicas no repertório para adicioná-las ao culto.</p>;
  }

  return (
    <form action={enviar} className="lvr-escalar">
      <input type="hidden" name="eventoId" value={eventoId} />
      <select name="musicaId" required aria-label="Música" defaultValue="">
        <option value="" disabled>Música…</option>
        {musicas.map((m) => <option key={m.id} value={m.id}>{m.titulo}</option>)}
      </select>
      <select name="tomDoDia" aria-label="Tom do dia" defaultValue="">
        <option value="">Tom do dia…</option>
        {todosOsTons().map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <button type="submit" className="btn btn--peq" disabled={pendente}>{pendente ? "…" : "Adicionar"}</button>
      {resultado && !resultado.ok && <span className="lvr-erro-inline">{resultado.mensagem}</span>}
    </form>
  );
}
