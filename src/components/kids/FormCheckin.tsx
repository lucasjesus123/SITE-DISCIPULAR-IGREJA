"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkinCrianca } from "@/app/painel/kids/acoes";

type Opcao = { id: string; nome: string; salaPadraoId?: string | null };

export function FormCheckin({ criancas, salas }: { criancas: Opcao[]; salas: Opcao[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [criancaId, setCriancaId] = useState("");
  const [salaId, setSalaId] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function fazer() {
    setErro(null);
    setCodigo(null);
    iniciar(async () => {
      const r = await checkinCrianca(criancaId, salaId);
      if (!r.ok) setErro(r.mensagem ?? "Falhou.");
      else {
        setCodigo(r.codigo ?? null);
        router.refresh();
      }
    });
  }

  return (
    <div className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {codigo && (
        <div className="kids-codigo" role="status">
          <span className="kids-codigo__rot">Código de segurança para a retirada</span>
          <strong className="kids-codigo__val">{codigo}</strong>
          <span className="kids-codigo__nota">Anote/entregue este código. Só ele libera a retirada.</span>
        </div>
      )}
      {erro && <div className="alerta alerta--erro" role="alert">{erro}</div>}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="ck-crianca">Criança</label>
        <select id="ck-crianca" value={criancaId} onChange={(e) => {
          setCriancaId(e.target.value);
          const c = criancas.find((x) => x.id === e.target.value);
          if (c?.salaPadraoId) setSalaId(c.salaPadraoId);
        }}>
          <option value="" disabled>Selecione…</option>
          {criancas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="ck-sala">Sala</label>
        <select id="ck-sala" value={salaId} onChange={(e) => setSalaId(e.target.value)}>
          <option value="" disabled>Selecione…</option>
          {salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
      </div>

      <button type="button" className="btn" onClick={fazer} disabled={pendente || !criancaId || !salaId}>
        {pendente ? "Fazendo check-in…" : "Fazer check-in"}
      </button>
    </div>
  );
}
