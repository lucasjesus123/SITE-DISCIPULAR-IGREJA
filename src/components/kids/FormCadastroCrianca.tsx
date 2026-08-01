"use client";

import { useActionState } from "react";
import { cadastrarCrianca, type ResultadoKids } from "@/app/painel/kids/acoes";

type Sala = { id: string; nome: string };

export function FormCadastroCrianca({ salas }: { salas: Sala[] }) {
  const [resultado, enviar, pendente] = useActionState(cadastrarCrianca, null as ResultadoKids);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status">{resultado.mensagem}</div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="kc-nome">Nome</label>
          <input id="kc-nome" name="nome" required minLength={2} maxLength={160} />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="kc-apelido">Apelido</label>
          <input id="kc-apelido" name="apelido" maxLength={60} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="kc-nasc">Nascimento</label>
          <input id="kc-nasc" name="dataNascimento" type="date" required />
        </div>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="kc-sala">Sala padrão</label>
          <select id="kc-sala" name="salaPadraoId" defaultValue="">
            <option value="">—</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="kc-alergias">Alergias (destaque na sala)</label>
        <input id="kc-alergias" name="alergias" maxLength={500} placeholder="Ex.: amendoim, lactose" />
      </div>
      <div className="campo">
        <label className="campo__rotulo" htmlFor="kc-restr">Restrições / necessidades</label>
        <input id="kc-restr" name="restricoes" maxLength={500} />
      </div>

      <label style={{ display: "flex", alignItems: "flex-start", gap: ".5rem", fontSize: ".88rem" }}>
        <input type="checkbox" name="consentimentoLgpd" required />
        <span>Confirmo o <strong>consentimento LGPD</strong> do responsável para o tratamento dos dados da criança (art. 14).</span>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".88rem" }}>
        <input type="checkbox" name="consentimentoFoto" /> Autorizo o uso de foto (revogável)
      </label>

      <button type="submit" className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Cadastrar criança"}</button>
    </form>
  );
}
