"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirAtiva, excluirInscricao } from "@/app/painel/inscricoes/acoes";

export function AcoesInscricao({
  inscricaoId,
  ativa,
  urlPublica,
}: {
  inscricaoId: string;
  ativa: boolean;
  urlPublica: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(urlPublica);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* clipboard bloqueado: o link continua visível para copiar à mão */
    }
  }

  return (
    <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
      <button type="button" className="btn btn--sm" onClick={copiar}>
        {copiado ? "Link copiado ✓" : "Copiar link"}
      </button>
      <a className="btn btn--sm btn--ghost" href={urlPublica} target="_blank" rel="noopener noreferrer">Abrir página</a>
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        disabled={pendente}
        onClick={() => iniciar(async () => { await definirAtiva(inscricaoId, !ativa); router.refresh(); })}
      >
        {ativa ? "Encerrar inscrições" : "Reabrir"}
      </button>
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        disabled={pendente}
        onClick={() => {
          if (confirm("Excluir esta inscrição e todos os inscritos? Não dá para desfazer.")) {
            iniciar(async () => { await excluirInscricao(inscricaoId); });
          }
        }}
        style={{ color: "#e5484d" }}
      >
        Excluir
      </button>
    </div>
  );
}
