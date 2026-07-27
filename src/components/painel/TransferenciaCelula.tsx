"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { transferirCelula } from "@/app/painel/pessoas/acoes";

/**
 * Transferência de célula a partir da ficha da pessoa.
 *
 * Existe separado do formulário de edição porque não é a mesma coisa: mudar o
 * telefone é corrigir um dado, mudar de célula é um evento pastoral. Por isso a
 * Server Action correspondente também grava uma interação no histórico — o
 * líder que recebe a pessoa consegue ver de onde ela veio e por quê.
 */
export function TransferenciaCelula({
  pessoaId,
  celulaAtualId,
  celulas,
}: {
  pessoaId: string;
  celulaAtualId: string | null;
  celulas: { id: string; nome: string; bairro: string | null }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [destino, setDestino] = useState(celulaAtualId ?? "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setSucesso(null);

    iniciar(async () => {
      const resultado = await transferirCelula(pessoaId, { celulaId: destino, motivo });
      if (resultado.ok) {
        setMotivo("");
        setSucesso(resultado.mensagem);
        router.refresh();
      } else {
        setErro(resultado.mensagem);
      }
    });
  }

  return (
    <form onSubmit={enviar} style={{ marginTop: "1.2rem" }} noValidate>
      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1rem" }}>
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="alerta alerta--sucesso" role="status" style={{ marginBottom: "1rem" }}>
          {sucesso}
        </div>
      )}

      <div className="grid cols-2">
        <div className="campo">
          <label className="campo__rotulo" htmlFor={`destino-${pessoaId}`}>
            Transferir para
          </label>
          <select
            id={`destino-${pessoaId}`}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
          >
            <option value="">Sem célula</option>
            {celulas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.bairro ? ` — ${c.bairro}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo__rotulo" htmlFor={`motivo-${pessoaId}`}>
            Motivo (opcional)
          </label>
          <input
            id={`motivo-${pessoaId}`}
            type="text"
            maxLength={200}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: mudou de bairro"
          />
        </div>
      </div>

      <button
        type="submit"
        className="btn btn--sm btn--outline-gold"
        disabled={pendente || destino === (celulaAtualId ?? "")}
        style={{ marginTop: "1rem" }}
      >
        {pendente ? "Transferindo…" : "Confirmar transferência"}
      </button>
    </form>
  );
}
