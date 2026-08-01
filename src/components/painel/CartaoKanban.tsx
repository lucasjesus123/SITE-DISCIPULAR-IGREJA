"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StatusPessoa } from "@prisma/client";
import { moverEtapa } from "@/app/painel/acompanhamento/acoes";

/**
 * Cartão do Kanban de acompanhamento. As setas movem a pessoa uma etapa para
 * frente ou para trás na jornada. A autorização e a validação da transição
 * acontecem no servidor (moverEtapa).
 */
export function CartaoKanban({
  pessoa,
  anterior,
  proxima,
}: {
  pessoa: { id: string; nome: string; telefone: string | null; contato: string | null };
  anterior: StatusPessoa | null;
  proxima: StatusPessoa | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function mover(status: StatusPessoa) {
    setErro(null);
    iniciar(async () => {
      const r = await moverEtapa(pessoa.id, status);
      if (!r.ok) setErro(r.mensagem ?? "Falhou.");
      else router.refresh();
    });
  }

  return (
    <article className={`kb-card${pendente ? " kb-card--pendente" : ""}`}>
      <p className="kb-card__nome">{pessoa.nome}</p>
      {pessoa.contato && <p className="kb-card__contato">{pessoa.contato}</p>}
      {erro && <p className="kb-card__erro">{erro}</p>}
      <div className="kb-card__acoes">
        <button
          type="button"
          className="kb-btn"
          disabled={!anterior || pendente}
          onClick={() => anterior && mover(anterior)}
          aria-label="Voltar uma etapa"
          title="Voltar uma etapa"
        >
          ←
        </button>
        <button
          type="button"
          className="kb-btn"
          disabled={!proxima || pendente}
          onClick={() => proxima && mover(proxima)}
          aria-label="Avançar uma etapa"
          title="Avançar uma etapa"
        >
          →
        </button>
      </div>
    </article>
  );
}
