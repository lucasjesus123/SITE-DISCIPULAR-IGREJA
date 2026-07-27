"use client";

import { useState } from "react";
import { tokenCsrf } from "@/components/auth/csrf-cliente";

/**
 * Formulário de "esqueci minha senha".
 *
 * A REGRA DESTA TELA: A CONFIRMAÇÃO É SEMPRE A MESMA.
 * O servidor responde 200 com o mesmo texto exista ou não a conta, e o cliente
 * apenas repassa. Não há tratamento especial para "não encontrado" porque esse
 * caso não chega até aqui — e é assim de propósito: se houvesse um ramo no
 * cliente para ele, alguém acabaria "melhorando a experiência" e transformando
 * a tela num verificador de quem tem conta na plataforma.
 *
 * A mensagem também não promete que o e-mail FOI enviado. Ela diz "se houver
 * uma conta". É a formulação honesta e a única compatível com o anti-enumeração.
 */
export function FormularioRecuperarSenha() {
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch("/api/auth/recuperar", {
        method: "POST",
        body: new FormData(evento.currentTarget),
        headers: { "x-csrf-token": tokenCsrf(), accept: "application/json" },
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        ok?: boolean;
        mensagem?: string;
        erro?: string;
      };

      if (resposta.ok && dados.ok) {
        setConfirmado(
          dados.mensagem ??
            "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha.",
        );
        return;
      }

      if (resposta.status === 429) {
        setErro("Muitos pedidos seguidos. Aguarde alguns minutos antes de tentar de novo.");
        return;
      }

      setErro(dados.erro ?? "Não foi possível concluir. Confira o e-mail digitado.");
    } catch {
      setErro("Não conseguimos conectar. Verifique sua internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (confirmado) {
    return (
      <div className="stack" style={{ "--flow": "1.2rem" } as React.CSSProperties}>
        <div className="alerta alerta--sucesso" role="status">
          {confirmado}
        </div>
        <p className="dim" style={{ fontSize: ".85rem" }}>
          O link vale por 30 minutos e só pode ser usado uma vez. Se não chegar
          em alguns minutos, confira a caixa de spam antes de pedir outro.
        </p>
        <a href="/login" className="btn btn--ghost btn--block">
          Voltar para o login
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="stack" style={{ "--flow": "1.4rem" } as React.CSSProperties}>
      {erro && (
        <div className="alerta alerta--erro" role="alert">
          {erro}
        </div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="email">
          E-mail da sua conta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={254}
          autoFocus
        />
      </div>

      <button type="submit" className="btn btn--lg btn--block" disabled={enviando}>
        {enviando ? "Enviando…" : "Enviar link de recuperação"}
      </button>
    </form>
  );
}
