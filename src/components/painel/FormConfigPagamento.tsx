"use client";

import { useActionState } from "react";
import { salvarConfigPagamento, type ResultadoConfigPagamento } from "@/app/painel/pagamentos/acoes";
import type { StatusPagamento } from "@/lib/pagamentos/config";

export function FormConfigPagamento({ status, webhookUrl }: { status: StatusPagamento; webhookUrl: string }) {
  const [resultado, enviar, pendente] = useActionState(salvarConfigPagamento, null as ResultadoConfigPagamento);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "1.1rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta alerta--${resultado.ok ? "sucesso" : "erro"}`} role="alert">{resultado.mensagem}</div>
      )}

      <div className="cfgpg-status">
        <span className={`cfgpg-dot cfgpg-dot--${status.ativo ? "on" : "off"}`} />
        {status.ativo
          ? <>Gateway <strong>ativo</strong> ({status.ambiente}){status.usandoEnv && " · via variável de ambiente"}</>
          : status.temChave
            ? <>Chave salva, mas <strong>desativado</strong>.</>
            : status.usandoEnv
              ? <>Usando a chave do servidor (.env). Preencha aqui para gerenciar pelo painel.</>
              : <>Nenhum gateway configurado ainda.</>}
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="pg-amb">Ambiente</label>
        <select id="pg-amb" name="ambiente" defaultValue={status.ambiente}>
          <option value="producao">Produção (cobra de verdade)</option>
          <option value="sandbox">Sandbox (teste)</option>
        </select>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="pg-key">Chave da API do ASAAS</label>
        <input id="pg-key" name="apiKey" type="password" autoComplete="off" maxLength={300}
          placeholder={status.temChave ? "•••••••• (deixe em branco para manter a atual)" : "Cole a chave da API aqui"} />
        <p className="lvr-nota">No ASAAS: Configurações → Integrações → Chave de API. Ela é guardada criptografada e nunca é exibida de volta.</p>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="pg-wh">Token do Webhook</label>
        <input id="pg-wh" name="webhookToken" maxLength={120} defaultValue="" autoComplete="off"
          placeholder={status.temWebhook ? "•••••••• (deixe em branco para manter)" : "Um token forte que você inventa"} />
        <p className="lvr-nota">
          No ASAAS, cadastre o webhook com este endereço e o mesmo token no header <code>asaas-access-token</code>:<br />
          <strong>{webhookUrl}</strong>
        </p>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: ".5rem", fontSize: ".92rem" }}>
        <input type="checkbox" name="ativo" defaultChecked={status.ativo} /> Ativar o PIX no app dos membros
      </label>

      <button type="submit" className="btn" disabled={pendente} style={{ justifySelf: "start" }}>
        {pendente ? "Salvando…" : "Salvar configuração"}
      </button>
    </form>
  );
}
