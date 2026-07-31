"use client";

import { useActionState, useEffect, useState } from "react";
import { transferirContas, type ResultadoFinanceiro } from "@/app/painel/financeiro/acoes";

type Opcao = { id: string; nome: string };

export function FormularioTransferencia({
  campi,
  contasFisicas,
  hoje,
}: {
  campi: Opcao[];
  contasFisicas: Opcao[];
  hoje: string;
}) {
  const [chave, setChave] = useState("");
  const [resultado, enviar, pendente] = useActionState(transferirContas, null as ResultadoFinanceiro);

  useEffect(() => setChave(crypto.randomUUID()), []);
  useEffect(() => {
    if (resultado?.ok) setChave(crypto.randomUUID());
  }, [resultado]);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1.1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status">
          {resultado.mensagem}
        </div>
      )}

      <input type="hidden" name="chave" value={chave} />

      <div className="campo">
        <label className="campo__rotulo" htmlFor="tr-campus">Congregação (registro)</label>
        <select id="tr-campus" name="campusId" required defaultValue={campi[0]?.id}>
          {campi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="tr-origem">De (origem)</label>
          <select id="tr-origem" name="contaOrigemId" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {contasFisicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="tr-destino">Para (destino)</label>
          <select id="tr-destino" name="contaDestinoId" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {contasFisicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="tr-valor">Valor (R$)</label>
          <input id="tr-valor" name="valor" required inputMode="decimal" placeholder="0,00" />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="tr-data">Data</label>
          <input id="tr-data" name="dataCaixa" type="date" required defaultValue={hoje} />
        </div>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="tr-hist">Histórico</label>
        <input id="tr-hist" name="historico" required minLength={2} maxLength={300} placeholder="Ex.: Transferência do dízimo para o banco" />
      </div>

      <button type="submit" className="btn" disabled={pendente || !chave}>
        {pendente ? "Transferindo…" : "Registrar transferência"}
      </button>
    </form>
  );
}
