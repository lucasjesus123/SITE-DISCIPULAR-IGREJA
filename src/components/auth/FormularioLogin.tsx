"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Formulário de login.
 *
 * DETALHES QUE NÃO SÃO ENFEITE
 *
 *  - `autoComplete="current-password"` faz o gerenciador de senhas do
 *    navegador funcionar. Isso é um controle de segurança: quem consegue usar
 *    o gerenciador usa senha forte e única; quem não consegue reusa a senha
 *    do e-mail.
 *
 *  - Nunca exibimos qual campo está errado. A mensagem do servidor é sempre
 *    "E-mail ou senha incorretos", e o cliente só a repassa.
 *
 *  - `router.replace` em vez de `push` após o login: evita que o botão
 *    "voltar" leve o usuário de volta à tela de login já autenticado.
 */
export function FormularioLogin() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      const form = new FormData(evento.currentTarget);

      const resposta = await fetch("/api/auth/login", {
        method: "POST",
        body: form,
        headers: {
          "x-csrf-token":
            lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "",
          accept: "application/json",
        },
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        ok?: boolean;
        destino?: string;
        erro?: string;
      };

      if (resposta.ok && dados.ok && dados.destino) {
        // Destino sempre relativo e definido pelo SERVIDOR. Não usamos
        // `?redirect=` da URL: seria open redirect, e um link de phishing
        // "logue aqui e volte" mandaria o usuário para o site do atacante
        // logo depois de autenticar.
        const destino = dados.destino.startsWith("/") && !dados.destino.startsWith("//")
          ? dados.destino
          : "/painel";
        router.replace(destino);
        router.refresh();
        return;
      }

      if (resposta.status === 429) {
        setErro("Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.");
        return;
      }

      setErro(dados.erro ?? "Não foi possível entrar. Tente novamente.");
      // Limpa só a senha, mantendo o e-mail: reduz frustração sem afrouxar nada.
      const campoSenha = formRef.current?.elements.namedItem("senha");
      if (campoSenha instanceof HTMLInputElement) campoSenha.value = "";
    } catch {
      setErro("Não conseguimos conectar. Verifique sua internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={enviar} className="stack" style={{ "--flow": "1.4rem" } as React.CSSProperties}>
      {erro && (
        <div className="alerta alerta--erro" role="alert">
          {erro}
        </div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="email">
          E-mail
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

      <div className="campo">
        <label className="campo__rotulo" htmlFor="senha">
          Senha
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="senha"
            name="senha"
            type={mostrarSenha ? "text" : "password"}
            required
            autoComplete="current-password"
            maxLength={256}
            style={{ paddingRight: "5rem" }}
          />
          <button
            type="button"
            onClick={() => setMostrarSenha((v) => !v)}
            style={{
              position: "absolute",
              right: ".9rem",
              top: "50%",
              transform: "translateY(-50%)",
              fontSize: ".72rem",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              color: "var(--gold)",
              fontWeight: 600,
            }}
            aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
          >
            {mostrarSenha ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>

      <button type="submit" className="btn btn--lg btn--block" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}
