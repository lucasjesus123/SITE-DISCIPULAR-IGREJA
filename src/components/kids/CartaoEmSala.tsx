"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { checkoutCrianca } from "@/app/painel/kids/acoes";

type Responsavel = { responsavelUserId: string; nome: string; autorizadoRetirar: boolean };

export function CartaoEmSala({
  sessaoId,
  nome,
  sala,
  alergias,
  restricoes,
  responsaveis,
}: {
  sessaoId: string;
  nome: string;
  sala: string;
  alergias: string | null;
  restricoes: string | null;
  responsaveis: Responsavel[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [quem, setQuem] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const autorizados = responsaveis.filter((r) => r.autorizadoRetirar);

  function retirar() {
    setErro(null);
    iniciar(async () => {
      const r = await checkoutCrianca(sessaoId, codigo.trim(), quem);
      if (!r.ok) setErro(r.mensagem ?? "Falhou.");
      else router.refresh();
    });
  }

  return (
    <article className="kids-card">
      <p className="kids-card__nome">{nome}</p>
      <p className="kids-card__sala">{sala}</p>
      {alergias && <p className="kids-alerta">⚠️ Alergia: {alergias}</p>}
      {restricoes && <p className="kids-alerta">⚠️ Restrição: {restricoes}</p>}

      {!aberto ? (
        <button type="button" className="btn btn--sm" style={{ marginTop: ".7rem" }} onClick={() => setAberto(true)}>
          Retirar
        </button>
      ) : (
        <div className="stack" style={{ "--flow": ".6rem", marginTop: ".7rem" } as React.CSSProperties}>
          {erro && <div className="alerta alerta--erro" role="alert" style={{ fontSize: ".8rem" }}>{erro}</div>}
          <input placeholder="Código de segurança" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={12} />
          <select value={quem} onChange={(e) => setQuem(e.target.value)}>
            <option value="" disabled>Quem está retirando?</option>
            {autorizados.map((r) => <option key={r.responsavelUserId} value={r.responsavelUserId}>{r.nome}</option>)}
          </select>
          <div style={{ display: "flex", gap: ".4rem" }}>
            <button type="button" className="btn btn--sm" disabled={pendente || !codigo || !quem} onClick={retirar}>
              {pendente ? "…" : "Confirmar retirada"}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setAberto(false)}>Cancelar</button>
          </div>
          {autorizados.length === 0 && (
            <p style={{ fontSize: ".78rem", color: "#e5484d" }}>Nenhum responsável autorizado cadastrado para esta criança.</p>
          )}
        </div>
      )}
    </article>
  );
}
