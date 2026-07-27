"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tokenCsrf } from "@/components/auth/csrf-cliente";
import { IndicadorForcaSenha, avaliarSenha } from "@/components/auth/IndicadorForcaSenha";

/**
 * Escolha da nova senha, a partir do link recebido por e-mail.
 *
 * O TOKEN VEM POR PROP E VAI NO CORPO
 * A página leu o token da query string (é como ele chega do e-mail) e o passa
 * para cá. O envio é POST com o token no corpo: query string vaza para o log do
 * Nginx, para o histórico do navegador e para o header `Referer` de qualquer
 * recurso externo que a página carregue.
 *
 * `autoComplete="new-password"` faz o gerenciador de senhas oferecer geração e
 * salvamento. Não é detalhe cosmético: é o que faz a pessoa sair daqui com uma
 * senha forte e única em vez de reciclar a do e-mail.
 */
export function FormularioRedefinirSenha({ token }: { token: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<string | null>(null);

  const avaliacao = avaliarSenha(senha);
  const coincidem = senha.length > 0 && senha === confirmacao;
  const podeEnviar = avaliacao.nivel >= 2 && coincidem && !enviando;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);

    try {
      const resposta = await fetch("/api/auth/redefinir", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": tokenCsrf(),
          accept: "application/json",
        },
        body: JSON.stringify({ token, novaSenha: senha, confirmacao }),
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        ok?: boolean;
        mensagem?: string;
        erro?: string;
      };

      if (resposta.ok && dados.ok) {
        setConcluido(dados.mensagem ?? "Senha alterada. Entre novamente.");
        // Limpa os campos da memória do formulário assim que deixam de ser
        // necessários.
        setSenha("");
        setConfirmacao("");
        router.refresh();
        return;
      }

      if (resposta.status === 429) {
        setErro("Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.");
        return;
      }

      setErro(dados.erro ?? "Não foi possível redefinir a senha.");
    } catch {
      setErro("Não conseguimos conectar. Verifique sua internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (concluido) {
    return (
      <div className="stack" style={{ "--flow": "1.2rem" } as React.CSSProperties}>
        <div className="alerta alerta--sucesso" role="status">
          {concluido}
        </div>
        <a href="/login" className="btn btn--lg btn--block">
          Ir para o login
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
        <label className="campo__rotulo" htmlFor="novaSenha">
          Nova senha
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="novaSenha"
            name="novaSenha"
            type={mostrar ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            autoFocus
            style={{ paddingRight: "5rem" }}
            aria-describedby="ajuda-forca"
          />
          <button
            type="button"
            onClick={() => setMostrar((v) => !v)}
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
            aria-label={mostrar ? "Ocultar senha" : "Mostrar senha"}
          >
            {mostrar ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        <div id="ajuda-forca">
          <IndicadorForcaSenha senha={senha} />
        </div>
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="confirmacao">
          Repita a nova senha
        </label>
        <input
          id="confirmacao"
          name="confirmacao"
          type={mostrar ? "text" : "password"}
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          required
          autoComplete="new-password"
          maxLength={256}
          aria-invalid={confirmacao.length > 0 && !coincidem ? true : undefined}
        />
        {confirmacao.length > 0 && !coincidem && (
          <p className="campo__erro" role="alert">
            As senhas não coincidem.
          </p>
        )}
      </div>

      <button type="submit" className="btn btn--lg btn--block" disabled={!podeEnviar}>
        {enviando ? "Salvando…" : "Salvar nova senha"}
      </button>

      <p className="campo__ajuda">
        Ao salvar, todas as sessões abertas nesta conta serão encerradas — em
        todos os dispositivos.
      </p>
    </form>
  );
}
