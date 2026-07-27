"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarPedidoOracao, excluirPedidoOracao } from "@/app/painel/oracao/acoes";

export function AcoesOracao({
  pedidoId,
  statusAtual,
  podeExcluir,
}: {
  pedidoId: string;
  statusAtual: string;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [escrevendo, setEscrevendo] = useState(false);
  const [testemunho, setTestemunho] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  function mudarStatus(status: string, comTestemunho = false) {
    setErro(null);
    iniciar(async () => {
      const r = await atualizarPedidoOracao(pedidoId, {
        status,
        respostaTestemunho: comTestemunho && testemunho ? testemunho : undefined,
      });
      if (r.ok) {
        setEscrevendo(false);
        setTestemunho("");
        router.refresh();
      } else {
        setErro(r.mensagem);
      }
    });
  }

  function excluir() {
    setErro(null);
    iniciar(async () => {
      const r = await excluirPedidoOracao(pedidoId);
      if (r.ok) router.refresh();
      else setErro(r.mensagem);
    });
  }

  return (
    <div style={{ marginTop: "1.4rem", paddingTop: "1.2rem", borderTop: "1px solid var(--line-on-light)" }}>
      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: ".9rem" }}>
          {erro}
        </div>
      )}

      {escrevendo ? (
        <div className="stack" style={{ "--flow": ".9rem" } as React.CSSProperties}>
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`testemunho-${pedidoId}`}>
              Testemunho de resposta
            </label>
            <textarea
              id={`testemunho-${pedidoId}`}
              value={testemunho}
              onChange={(e) => setTestemunho(e.target.value)}
              rows={4}
              maxLength={3000}
              placeholder="Como Deus respondeu a este pedido…"
            />
          </div>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => mudarStatus("RESPONDIDO", true)}
              disabled={pendente}
            >
              {pendente ? "Salvando…" : "Marcar como respondido"}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setEscrevendo(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : confirmandoExclusao ? (
        <div className="alerta alerta--erro">
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Excluir definitivamente?</strong> Esta ação não pode ser desfeita. O conteúdo do
            pedido será apagado do banco de dados.
          </p>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <button type="button" className="btn btn--sm" onClick={excluir} disabled={pendente}>
              {pendente ? "Excluindo…" : "Sim, excluir"}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirmandoExclusao(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          {statusAtual === "RECEBIDO" && (
            <button
              type="button"
              className="btn btn--sm btn--outline-gold"
              onClick={() => mudarStatus("ORANDO")}
              disabled={pendente}
            >
              Estamos orando
            </button>
          )}
          {statusAtual !== "RESPONDIDO" && (
            <button
              type="button"
              className="btn btn--sm btn--outline-gold"
              onClick={() => setEscrevendo(true)}
              disabled={pendente}
            >
              Registrar resposta
            </button>
          )}
          {statusAtual !== "ARQUIVADO" && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => mudarStatus("ARQUIVADO")}
              disabled={pendente}
            >
              Arquivar
            </button>
          )}
          {podeExcluir && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={pendente}
              style={{ marginLeft: "auto", color: "#cf222e" }}
            >
              Excluir
            </button>
          )}
        </div>
      )}
    </div>
  );
}
