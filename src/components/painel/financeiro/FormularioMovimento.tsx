"use client";

import { useActionState, useEffect, useState } from "react";
import { lancarMovimento, type ResultadoFinanceiro } from "@/app/painel/financeiro/acoes";

type Opcao = { id: string; nome: string; campusId?: string | null };

export function FormularioMovimento({
  campi,
  contasFisicas,
  receitas,
  despesas,
  hoje,
}: {
  campi: Opcao[];
  contasFisicas: Opcao[];
  receitas: Opcao[];
  despesas: Opcao[];
  hoje: string;
}) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [chave, setChave] = useState("");
  const [resultado, enviar, pendente] = useActionState(lancarMovimento, null as ResultadoFinanceiro);

  // Chave de idempotência: uma por tentativa. Regenera a cada sucesso para o
  // próximo lançamento não colidir com o anterior.
  useEffect(() => setChave(crypto.randomUUID()), []);
  useEffect(() => {
    if (resultado?.ok) setChave(crypto.randomUUID());
  }, [resultado]);

  const categorias = tipo === "ENTRADA" ? receitas : despesas;

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1.1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status">
          {resultado.mensagem}
        </div>
      )}

      <input type="hidden" name="chave" value={chave} />

      <div className="barra-ferramentas" style={{ marginBottom: 0 }}>
        <button type="button" className="filtro-chip" aria-pressed={tipo === "ENTRADA"} onClick={() => setTipo("ENTRADA")}>
          Entrada
        </button>
        <button type="button" className="filtro-chip" aria-pressed={tipo === "SAIDA"} onClick={() => setTipo("SAIDA")}>
          Saída
        </button>
      </div>
      <input type="hidden" name="tipo" value={tipo} />

      <div className="campo">
        <label className="campo__rotulo" htmlFor="mv-campus">Congregação</label>
        <select id="mv-campus" name="campusId" required defaultValue={campi[0]?.id}>
          {campi.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="mv-conta">Conta (caixa/banco/pix)</label>
        <select id="mv-conta" name="contaFisicaId" required defaultValue="">
          <option value="" disabled>Selecione…</option>
          {contasFisicas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="mv-cat">Categoria</label>
        <select id="mv-cat" name="categoriaId" required defaultValue="" key={tipo}>
          <option value="" disabled>Selecione…</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="mv-valor">Valor (R$)</label>
          <input id="mv-valor" name="valor" required inputMode="decimal" placeholder="0,00" />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="mv-data">Data</label>
          <input id="mv-data" name="dataCaixa" type="date" required defaultValue={hoje} />
        </div>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="mv-hist">Histórico</label>
        <input id="mv-hist" name="historico" required minLength={2} maxLength={300} placeholder="Ex.: Dízimos do culto de domingo" />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".88rem" }}>
        <input type="checkbox" name="contribuicaoAnonima" /> Contribuição anônima (não vincular a um membro)
      </label>

      <button type="submit" className="btn" disabled={pendente || !chave}>
        {pendente ? "Registrando…" : `Registrar ${tipo === "ENTRADA" ? "entrada" : "saída"}`}
      </button>
    </form>
  );
}
