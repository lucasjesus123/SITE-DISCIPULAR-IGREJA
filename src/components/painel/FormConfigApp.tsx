"use client";

import { useActionState } from "react";
import { salvarConfigApp, type ResultadoConfigApp } from "@/app/painel/configuracoes-app/acoes";
import type { TogglesApp } from "@/lib/app-membro/recursos";

interface ItemToggle {
  chave: keyof TogglesApp;
  titulo: string;
  descricao: string;
  observacao?: string;
}

const ITENS: ItemToggle[] = [
  { chave: "palavra", titulo: "Palavra (ao vivo + mensagens)", descricao: "Transmissão ao vivo e biblioteca de mensagens do YouTube.", observacao: "Integração YouTube" },
  { chave: "contribuir", titulo: "Contribuir (Dízimo/Oferta via PIX)", descricao: "Dízimos e ofertas pelo app.", observacao: "Só aparece se houver chave PIX configurada" },
  { chave: "agenda", titulo: "Agenda / Eventos", descricao: "Eventos da igreja com inscrição em um toque." },
  { chave: "celula", titulo: "Minha Célula / Grupo", descricao: "Próximo encontro, líder e membros do grupo pequeno.", observacao: "Ligue se a igreja usa células" },
  { chave: "notificacoes", titulo: "Notificações (push / WhatsApp)", descricao: "Avisos e lembretes para os membros." },
];

export function FormConfigApp({ toggles }: { toggles: TogglesApp }) {
  const [resultado, enviar, pendente] = useActionState(salvarConfigApp, null as ResultadoConfigApp);

  return (
    <form action={enviar} className="stack" style={{ "--flow": "0.9rem" } as React.CSSProperties}>
      {resultado && (
        <div className={`alerta alerta--${resultado.ok ? "sucesso" : "erro"}`} role="alert">{resultado.mensagem}</div>
      )}

      <div className="stack" style={{ "--flow": "0.6rem" } as React.CSSProperties}>
        {ITENS.map((item) => (
          <label key={item.chave} className="cfgapp-item">
            <input type="checkbox" name={item.chave} defaultChecked={toggles[item.chave]} />
            <span className="cfgapp-item__txt">
              <strong>{item.titulo}</strong>
              <span className="cfgapp-item__desc">{item.descricao}</span>
              {item.observacao && <span className="cfgapp-item__obs">{item.observacao}</span>}
            </span>
          </label>
        ))}
      </div>

      <p className="lvr-nota">
        <strong>Início</strong> e <strong>Perfil</strong> são a base do app e estão sempre ativos.
        &nbsp;<strong>Meus Filhos</strong> (Kids) e <strong>Minhas Escalas</strong> (Louvor) aparecem
        automaticamente para quem tem vínculo — não se liberam manualmente.
      </p>

      <button type="submit" className="btn" disabled={pendente} style={{ justifySelf: "start" }}>
        {pendente ? "Salvando…" : "Salvar configuração"}
      </button>
    </form>
  );
}
