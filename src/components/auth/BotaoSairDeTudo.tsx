"use client";

import { useState, useTransition } from "react";

export interface ResultadoRevogacao {
  ok: boolean;
  mensagem: string;
}

/**
 * "Sair de todos os dispositivos".
 *
 * É o botão de pânico: a pessoa perdeu o celular, usou um computador
 * emprestado, ou desconfia que alguém entrou. Ele revoga TODAS as sessões,
 * inclusive esta — de propósito. Uma versão que poupasse a sessão atual seria
 * inútil justamente no cenário em que o "atual" é o dispositivo do invasor.
 *
 * A confirmação em duas etapas existe porque a ação derruba o próprio usuário:
 * um clique acidental no meio de uma triagem custaria o trabalho em andamento.
 */
export function BotaoSairDeTudo({
  acao,
  sessoesAtivas,
}: {
  acao: () => Promise<ResultadoRevogacao>;
  sessoesAtivas: number;
}) {
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function executar() {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (resultado.ok) {
        /**
         * Navegação completa, e não `router.replace`. O cookie de sessão acabou
         * de ser invalidado: qualquer navegação do roteador do Next reusaria o
         * cache do cliente e mostraria por um instante uma tela que a pessoa já
         * não pode ver. Recarregar do servidor é o único estado honesto.
         */
        window.location.assign("/login");
        return;
      }
      setErro(resultado.mensagem);
    });
  }

  if (!confirmando) {
    return (
      <div>
        {erro && (
          <div className="alerta alerta--erro" role="alert" style={{ marginBottom: ".9rem" }}>
            {erro}
          </div>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => setConfirmando(true)}>
          Sair de todos os dispositivos
        </button>
      </div>
    );
  }

  return (
    <div className="alerta alerta--aviso">
      <p style={{ marginBottom: ".8rem" }}>
        <strong>Encerrar {sessoesAtivas} sessão(ões)?</strong> Você também será
        desconectado aqui e precisará entrar de novo.
      </p>
      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn--sm" onClick={executar} disabled={pendente}>
          {pendente ? "Encerrando…" : "Sim, encerrar tudo"}
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => setConfirmando(false)}
          disabled={pendente}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
