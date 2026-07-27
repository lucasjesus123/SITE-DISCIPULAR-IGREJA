"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  definirDominioPrincipal,
  removerDominioAction,
  verificarDominioAction,
} from "@/app/plataforma/acoes";

/**
 * Botões de um domínio: verificar DNS, promover a principal, remover.
 *
 * Usado tanto na tela de detalhe da igreja quanto na lista global de domínios,
 * por isso recebe `tenantId` e `dominioId` como props em vez de deduzir
 * qualquer coisa do contexto — quem decide o alvo é a página, e o servidor
 * revalida os dois identificadores de qualquer forma.
 */
export function AcoesDominio({
  tenantId,
  dominioId,
  hostname,
  status,
  principal,
}: {
  tenantId: string;
  dominioId: string;
  hostname: string;
  status: "PENDENTE" | "VERIFICADO" | "ERRO";
  principal: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [mensagem, setMensagem] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [registroDns, setRegistroDns] = useState<{ nome: string; valor: string } | null>(null);
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);

  function verificar() {
    setMensagem(null);
    iniciar(async () => {
      const resultado = await verificarDominioAction(tenantId, dominioId);
      setMensagem({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      setRegistroDns(
        resultado.registroDns
          ? { nome: resultado.registroDns.nome, valor: resultado.registroDns.valor }
          : null,
      );
      if (resultado.ok) router.refresh();
    });
  }

  function promover() {
    setMensagem(null);
    iniciar(async () => {
      const resultado = await definirDominioPrincipal(tenantId, dominioId);
      setMensagem({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      if (resultado.ok) router.refresh();
    });
  }

  function remover() {
    setMensagem(null);
    iniciar(async () => {
      const resultado = await removerDominioAction(tenantId, dominioId);
      if (resultado.ok) {
        router.refresh();
      } else {
        setMensagem({ tom: "erro", texto: resultado.mensagem });
        setConfirmandoRemocao(false);
      }
    });
  }

  return (
    <div style={{ display: "grid", gap: ".6rem" }}>
      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn--sm btn--ghost" onClick={verificar} disabled={pendente}>
          {pendente ? "…" : "Verificar DNS"}
        </button>

        {status === "VERIFICADO" && !principal && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={promover} disabled={pendente}>
            Tornar principal
          </button>
        )}

        {!confirmandoRemocao ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoRemocao(true)}
            disabled={pendente}
            style={{ color: "#cf222e" }}
          >
            Remover
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--sm"
              onClick={remover}
              disabled={pendente}
              style={{ background: "#cf222e", borderColor: "#cf222e" }}
            >
              {pendente ? "Removendo…" : `Confirmar remoção de ${hostname}`}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirmandoRemocao(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {mensagem && (
        <div className={`alerta alerta--${mensagem.tom === "sucesso" ? "sucesso" : "erro"}`} role="status">
          {mensagem.texto}
        </div>
      )}

      {registroDns && <InstrucaoDns nome={registroDns.nome} valor={registroDns.valor} />}
    </div>
  );
}

/**
 * Instrução de DNS.
 *
 * O valor é texto vindo do servidor e renderizado como texto — o React escapa
 * tudo. Nada aqui vira HTML: seria o caminho mais bobo possível para um XSS
 * dentro da área que administra todas as igrejas.
 */
export function InstrucaoDns({ nome, valor }: { nome: string; valor: string }) {
  return (
    <div
      style={{
        border: "1px solid var(--line-on-light)",
        borderRadius: "var(--radius)",
        padding: ".9rem 1rem",
        background: "var(--paper-2)",
        fontSize: ".82rem",
      }}
    >
      <p className="cartao__rotulo">Registro TXT a publicar no DNS</p>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: ".35rem .8rem", marginTop: ".6rem" }}>
        <dt style={{ color: "var(--graphite-faint)" }}>Nome</dt>
        <dd style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all", userSelect: "all" }}>
          {nome}
        </dd>
        <dt style={{ color: "var(--graphite-faint)" }}>Tipo</dt>
        <dd>TXT</dd>
        <dt style={{ color: "var(--graphite-faint)" }}>Valor</dt>
        <dd style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", wordBreak: "break-all", userSelect: "all" }}>
          {valor}
        </dd>
      </dl>
      <p style={{ marginTop: ".7rem", color: "var(--graphite-dim)" }}>
        Além do TXT, o domínio precisa de um registro A ou CNAME apontando para a plataforma. A
        propagação costuma levar de minutos a algumas horas.
      </p>
    </div>
  );
}
