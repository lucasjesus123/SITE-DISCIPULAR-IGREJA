"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { publicarEscala, removerEscalado, removerMembro } from "@/app/painel/louvor/acoes";

/** Botão de publicar a escala (mostra o aviso do WhatsApp no retorno). */
export function BotaoPublicar({ escalaId, publicada }: { escalaId: string; publicada: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  if (publicada) {
    return <span className="etiqueta etiqueta--novo">Publicada</span>;
  }

  return (
    <div style={{ display: "grid", gap: ".4rem", justifyItems: "start" }}>
      <button
        type="button"
        className="btn"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            const r = await publicarEscala(escalaId);
            setMsg(r.mensagem ?? null);
            router.refresh();
          })
        }
      >
        {pendente ? "Publicando…" : "Publicar escala"}
      </button>
      {msg && <span className="lvr-aviso">{msg}</span>}
    </div>
  );
}

/** Remove uma escalação (X no card do integrante). */
export function BotaoRemoverEscalado({ escaladoId, escalaId }: { escaladoId: string; escalaId: string }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="lvr-x"
      aria-label="Remover da escala"
      disabled={pendente}
      onClick={() => iniciar(async () => { await removerEscalado(escaladoId, escalaId); router.refresh(); })}
    >
      ×
    </button>
  );
}

/** Desativa um integrante da equipe. */
export function BotaoRemoverMembro({ membroId }: { membroId: string }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="lvr-link lvr-link--perigo"
      disabled={pendente}
      onClick={() => {
        if (!confirm("Remover este integrante do ministério?")) return;
        iniciar(async () => { await removerMembro(membroId); router.refresh(); });
      }}
    >
      remover
    </button>
  );
}
