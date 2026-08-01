"use client";

import { useActionState } from "react";
import { salvarTemplate, type ResultadoTemplate } from "@/app/painel/automacoes/acoes";
import { variaveisDoTemplate } from "@/lib/mensagens/template";

export function EditorTemplate({
  id,
  titulo,
  corpo,
  ativo,
}: {
  id: string;
  titulo: string;
  corpo: string;
  ativo: boolean;
}) {
  const [resultado, enviar, pendente] = useActionState(salvarTemplate, null as ResultadoTemplate);
  const variaveis = variaveisDoTemplate(corpo);

  return (
    <form action={enviar} className="secao-painel">
      <input type="hidden" name="id" value={id} />
      <h2 className="secao-painel__titulo">{titulo}</h2>
      {variaveis.length > 0 && (
        <p className="secao-painel__desc">
          Variáveis disponíveis: {variaveis.map((v) => <code key={v} style={{ marginRight: ".4rem" }}>{`{${v}}`}</code>)}
        </p>
      )}
      {resultado && (
        <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status" style={{ marginBottom: ".8rem" }}>
          {resultado.mensagem}
        </div>
      )}
      <div className="campo">
        <textarea name="corpo" rows={5} defaultValue={corpo} maxLength={2000} required />
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginTop: ".6rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".9rem" }}>
          <input type="checkbox" name="ativo" defaultChecked={ativo} /> Ativa
        </label>
        <button type="submit" className="btn btn--sm" disabled={pendente}>{pendente ? "Salvando…" : "Salvar mensagem"}</button>
      </div>
    </form>
  );
}
