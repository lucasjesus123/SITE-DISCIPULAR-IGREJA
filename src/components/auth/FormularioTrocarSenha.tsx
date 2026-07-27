"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tokenCsrf } from "@/components/auth/csrf-cliente";
import { IndicadorForcaSenha, avaliarSenha } from "@/components/auth/IndicadorForcaSenha";

/**
 * Troca de senha dentro do painel.
 *
 * Exige a senha atual. Quem já está logado não precisaria "provar" nada para o
 * sistema — mas precisa provar para NÓS que é o dono da conta, e não alguém que
 * pegou a máquina destravada enquanto o pastor foi almoçar. É a mesma razão
 * pela qual o banco pede a senha de novo na hora da transferência.
 */
export function FormularioTrocarSenha() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const avaliacao = avaliarSenha(novaSenha);
  const coincidem = novaSenha.length > 0 && novaSenha === confirmacao;
  const podeEnviar = senhaAtual.length > 0 && avaliacao.nivel >= 2 && coincidem && !enviando;

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setErro(null);
    setSucesso(null);

    try {
      const resposta = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": tokenCsrf(),
          accept: "application/json",
        },
        body: JSON.stringify({ senhaAtual, novaSenha, confirmacao }),
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        ok?: boolean;
        mensagem?: string;
        erro?: string;
      };

      if (resposta.ok && dados.ok) {
        setSucesso(dados.mensagem ?? "Senha alterada.");
        setSenhaAtual("");
        setNovaSenha("");
        setConfirmacao("");
        // A resposta trouxe o cookie da sessão rotacionada; o refresh recarrega
        // a lista de sessões, que acabou de mudar por completo.
        router.refresh();
        return;
      }

      if (resposta.status === 429) {
        setErro("Muitas tentativas seguidas. Aguarde alguns minutos.");
        return;
      }

      if (resposta.status === 401) {
        setErro("Sua sessão expirou. Entre novamente para trocar a senha.");
        return;
      }

      setErro(dados.erro ?? "Não foi possível alterar a senha.");
      // Limpa só a senha atual: se ela estava errada, é o campo a refazer.
      setSenhaAtual("");
    } catch {
      setErro("Não conseguimos conectar. Verifique sua internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="stack" style={{ "--flow": "1.3rem" } as React.CSSProperties}>
      {erro && (
        <div className="alerta alerta--erro" role="alert">
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="alerta alerta--sucesso" role="status">
          {sucesso}
        </div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="senhaAtual">
          Senha atual
        </label>
        <input
          id="senhaAtual"
          name="senhaAtual"
          type="password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          required
          autoComplete="current-password"
          maxLength={256}
        />
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="novaSenhaPainel">
          Nova senha
        </label>
        <input
          id="novaSenhaPainel"
          name="novaSenha"
          type="password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          required
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
        />
        <IndicadorForcaSenha senha={novaSenha} />
      </div>

      <div className="campo">
        <label className="campo__rotulo" htmlFor="confirmacaoPainel">
          Repita a nova senha
        </label>
        <input
          id="confirmacaoPainel"
          name="confirmacao"
          type="password"
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

      <div>
        <button type="submit" className="btn" disabled={!podeEnviar}>
          {enviando ? "Salvando…" : "Alterar senha"}
        </button>
      </div>

      <p className="campo__ajuda">
        Ao alterar, os outros dispositivos conectados a esta conta são
        desconectados. Este continua ativo.
      </p>
    </form>
  );
}
