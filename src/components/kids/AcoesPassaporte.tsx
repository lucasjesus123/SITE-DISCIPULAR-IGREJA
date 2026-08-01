"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { darConquista, registrarEvolucao, type ResultadoKids } from "@/app/painel/kids/acoes";

const MEDALHAS = [
  { nome: "Primeira visita", icone: "estrela" },
  { nome: "Decorou o versículo", icone: "ouro" },
  { nome: "Ajudou um amiguinho", icone: "coracao" },
  { nome: "Presença assídua", icone: "prata" },
];

export function AcoesPassaporte({ criancaId, hoje }: { criancaId: string; hoje: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [resultado, enviar, enviando] = useActionState(registrarEvolucao, null as ResultadoKids);

  const [erroMedalha, setErroMedalha] = useState<string | null>(null);

  function conceder(nome: string, icone: string) {
    setErroMedalha(null);
    iniciar(async () => {
      const r = await darConquista(criancaId, nome, icone);
      if (!r.ok) setErroMedalha(r.mensagem ?? "Falhou.");
      else router.refresh();
    });
  }

  return (
    <div className="stack" style={{ "--flow": "1.4rem" } as React.CSSProperties}>
      <div>
        <p className="cartao__rotulo" style={{ marginBottom: ".6rem" }}>Dar uma medalha</p>
        {erroMedalha && <div className="alerta alerta--erro" role="alert" style={{ marginBottom: ".6rem" }}>{erroMedalha}</div>}
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          {MEDALHAS.map((m) => (
            <button key={m.nome} type="button" className="btn btn--sm btn--ghost" disabled={pendente} onClick={() => conceder(m.nome, m.icone)}>
              🏅 {m.nome}
            </button>
          ))}
        </div>
      </div>

      <form action={enviar} className="stack" style={{ "--flow": ".8rem" } as React.CSSProperties}>
        <p className="cartao__rotulo">Adicionar à linha do tempo</p>
        {resultado && (
          <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status">{resultado.mensagem}</div>
        )}
        <input type="hidden" name="criancaId" value={criancaId} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".8rem" }}>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="ev-tipo">Tipo</label>
            <select id="ev-tipo" name="tipo" defaultValue="MARCO">
              <option value="PRESENCA">Presença</option>
              <option value="LICAO">Lição</option>
              <option value="MARCO">Marco</option>
              <option value="CONQUISTA">Conquista</option>
            </select>
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="ev-data">Data</label>
            <input id="ev-data" name="data" type="date" defaultValue={hoje} required />
          </div>
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="ev-titulo">Título</label>
          <input id="ev-titulo" name="titulo" required minLength={2} maxLength={160} placeholder="Ex.: Aprendeu a história de Davi" />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="ev-desc">Descrição (opcional)</label>
          <input id="ev-desc" name="descricao" maxLength={1000} />
        </div>
        <button type="submit" className="btn btn--sm" disabled={enviando}>{enviando ? "Salvando…" : "Adicionar"}</button>
      </form>
    </div>
  );
}
