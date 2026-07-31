"use client";

import { useActionState } from "react";

export type ResultadoCadastro = { ok: boolean; mensagem: string } | null;

/**
 * Formulário de edição do PRÓPRIO cadastro (nome e telefone).
 *
 * E-mail e papel continuam sendo geridos pelo responsável da igreja (em
 * Usuários) — são identidade de acesso e nível de permissão, não dados que a
 * pessoa deva trocar sozinha. Nome e telefone, sim.
 */
export function FormularioMeuCadastro({
  acao,
  nomeInicial,
  telefoneInicial,
}: {
  acao: (estado: ResultadoCadastro, formData: FormData) => Promise<ResultadoCadastro>;
  nomeInicial: string;
  telefoneInicial: string;
}) {
  const [resultado, enviar, pendente] = useActionState(acao, null);

  return (
    <form action={enviar} className="stack" style={{ maxWidth: 460, "--flow": "1.2rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta ${resultado.ok ? "alerta--sucesso" : "alerta--erro"}`} role="status">
          {resultado.mensagem}
        </div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="meu-nome">Nome completo</label>
        <input id="meu-nome" name="nome" type="text" required minLength={2} maxLength={120} defaultValue={nomeInicial} autoComplete="name" />
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="meu-telefone">Telefone / WhatsApp</label>
        <input id="meu-telefone" name="telefone" type="tel" maxLength={20} defaultValue={telefoneInicial} placeholder="(51) 99999-9999" autoComplete="tel" />
      </div>

      <button type="submit" className="btn" disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar meus dados"}
      </button>
    </form>
  );
}
