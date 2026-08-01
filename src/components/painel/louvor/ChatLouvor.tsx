"use client";

import { useActionState, useEffect, useRef } from "react";
import { postarNoChat, type ResultadoLouvor } from "@/app/painel/louvor/acoes";

interface Mensagem {
  id: string;
  autorNome: string;
  texto: string;
  criadoEm: string; // ISO
  fixada: boolean;
}

/**
 * Chat do ministério. Persistido no banco; aqui é o canal geral, com envio via
 * server action. (Tempo real por WebSocket entra numa fase seguinte; por ora o
 * histórico é confiável e recarrega ao enviar.)
 */
export function ChatLouvor({ mensagens, nomeUsuario }: { mensagens: Mensagem[]; nomeUsuario: string }) {
  const [resultado, enviar, pendente] = useActionState(postarNoChat, null as ResultadoLouvor);
  const formRef = useRef<HTMLFormElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resultado?.ok) formRef.current?.reset();
  }, [resultado]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  return (
    <div className="lvr-chat">
      <div className="lvr-chat__historico">
        {mensagens.length === 0 ? (
          <div className="vazio">Nenhuma mensagem ainda. Comece a conversa com a equipe.</div>
        ) : (
          mensagens.map((m) => {
            const meu = m.autorNome === nomeUsuario;
            return (
              <div key={m.id} className={`lvr-msg${meu ? " lvr-msg--meu" : ""}${m.fixada ? " lvr-msg--fixada" : ""}`}>
                {!meu && <span className="lvr-msg__autor">{m.autorNome}</span>}
                <p className="lvr-msg__texto">{m.texto}</p>
                <time className="lvr-msg__hora">
                  {new Date(m.criadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            );
          })
        )}
        <div ref={fimRef} />
      </div>

      <form ref={formRef} action={enviar} className="lvr-chat__form">
        <input name="texto" required maxLength={2000} placeholder="Escreva para a equipe…" autoComplete="off" aria-label="Mensagem" />
        <button type="submit" className="btn" disabled={pendente}>{pendente ? "…" : "Enviar"}</button>
      </form>
      {resultado && !resultado.ok && resultado.mensagem && (
        <div className="alerta alerta--erro" role="alert">{resultado.mensagem}</div>
      )}
    </div>
  );
}
