"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agendarDisparoSecretaria } from "@/app/painel/secretaria/acoes";

/**
 * Botão "Agendar mensagem" na linha de um cadastro. Abre um mini-formulário
 * com presets práticos (15 min, 1 hora, amanhã 11h) ou data/hora personalizada.
 * Um CRON envia quando vencer — ver /api/cron/disparos-agendados.
 */
export function AgendarDisparo({
  contato,
  nome,
  registroId,
}: {
  contato: string;
  nome?: string;
  registroId?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [quando, setQuando] = useState("15min");
  const [dataHora, setDataHora] = useState("");
  const [mensagem, setMensagem] = useState(
    nome ? `Olá, ${nome.split(" ")[0]}! Aqui é da igreja. ` : "",
  );
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const router = useRouter();

  function enviar() {
    iniciar(async () => {
      const r = await agendarDisparoSecretaria({ contato, nome, mensagem, quando, dataHora, registroId });
      setMsg({ ok: r.ok, texto: r.mensagem });
      if (r.ok) {
        router.refresh();
        setTimeout(() => setAberto(false), 1200);
      }
    });
  }

  if (!aberto) {
    return (
      <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAberto(true)}>
        Agendar msg
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: ".5rem", minWidth: 260, padding: ".6rem", border: "1px solid var(--pnl-line)", borderRadius: 10 }}>
      {msg && <div className={`alerta alerta--${msg.ok ? "sucesso" : "erro"}`} role="alert">{msg.texto}</div>}
      <select value={quando} onChange={(e) => setQuando(e.target.value)} aria-label="Quando enviar">
        <option value="15min">Daqui 15 minutos</option>
        <option value="30min">Daqui 30 minutos</option>
        <option value="1h">Daqui 1 hora</option>
        <option value="amanha">Amanhã às 11h</option>
        <option value="custom">Escolher data e hora…</option>
      </select>
      {quando === "custom" && (
        <input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} aria-label="Data e hora" />
      )}
      <textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Mensagem…"
        aria-label="Mensagem"
      />
      <div style={{ display: "flex", gap: ".5rem" }}>
        <button type="button" className="btn btn--sm" onClick={enviar} disabled={pendente}>
          {pendente ? "Agendando…" : "Agendar"}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
