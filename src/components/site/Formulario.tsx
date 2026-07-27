"use client";

import { createContext, useContext, useRef, useState } from "react";

/**
 * Formulário público reutilizável.
 *
 * Usado pelo site E pelo PWA. Um único componente significa que uma melhoria
 * de segurança (ou uma correção de acessibilidade) vale para os dois de uma
 * vez, em vez de ser aplicada num e esquecida no outro.
 *
 * O QUE ELE FAZ POR SEGURANÇA
 *   - Envia o token CSRF no header.
 *   - Inclui o honeypot `website` e o carimbo de tempo `_t`.
 *   - Bloqueia envio duplo (clique nervoso e também replay automatizado).
 *   - Exibe erros por campo vindos do servidor, sem nunca renderizar HTML.
 *
 * O QUE ELE NÃO FAZ
 *   - Validar em vez do servidor. Os atributos `required`/`maxLength` daqui
 *     são conveniência para quem preenche. A validação real está no Zod, no
 *     servidor, e é a única que conta.
 */

export interface CampoErros {
  [campo: string]: string[];
}

export function Formulario({
  tipo,
  children,
  textoBotao = "Enviar",
  aoConcluir,
}: {
  /** Slug da rota: "visitante", "pedido-oracao", "batismo"... */
  tipo: string;
  children: React.ReactNode;
  textoBotao?: string;
  aoConcluir?: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erros, setErros] = useState<CampoErros>({});
  const montadoEm = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando) return; // trava contra duplo clique

    setEnviando(true);
    setErroGeral(null);
    setErros({});

    try {
      const form = new FormData(evento.currentTarget);
      form.set("_t", String(montadoEm.current));

      const resposta = await fetch(`/api/publico/formularios/${tipo}`, {
        method: "POST",
        body: form,
        headers: {
          // Token CSRF lido do cookie. O cookie é intencionalmente legível
          // por JS (não é o de sessão); a proteção vem de o atacante não
          // conseguir LER o cookie de outro domínio para replicá-lo aqui.
          "x-csrf-token": lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "",
          accept: "application/json",
        },
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        ok?: boolean;
        mensagem?: string;
        erro?: string;
        campos?: CampoErros;
      };

      if (resposta.ok && dados.ok) {
        setSucesso(dados.mensagem ?? "Recebemos sua mensagem. Obrigado!");
        formRef.current?.reset();
        montadoEm.current = Date.now();
        aoConcluir?.();
        return;
      }

      if (resposta.status === 429) {
        setErroGeral("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
        return;
      }

      if (dados.campos) setErros(dados.campos);
      setErroGeral(dados.erro ?? "Não foi possível enviar. Confira os campos e tente novamente.");
    } catch {
      setErroGeral("Não conseguimos enviar agora. Verifique sua conexão e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="alerta alerta--sucesso" role="status">
        {sucesso}
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="stack" style={{ "--flow": "1.4rem" } as React.CSSProperties}>
      {erroGeral && (
        <div className="alerta alerta--erro" role="alert">
          {erroGeral}
        </div>
      )}

      <ContextoErros.Provider value={erros}>{children}</ContextoErros.Provider>

      {/*
        Honeypot. Escondido visualmente por CSS (não por display:none, que
        vários bots detectam). Pessoa nenhuma preenche; se vier preenchido, a
        submissão é classificada como spam no servidor.
      */}
      <div className="hp-campo" aria-hidden="true">
        <label htmlFor={`website-${tipo}`}>Não preencha este campo</label>
        <input
          id={`website-${tipo}`}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <button type="submit" className="btn btn--lg btn--block" disabled={enviando}>
        {enviando ? "Enviando…" : textoBotao}
      </button>

      <p className="campo__ajuda">
        Ao enviar, você concorda com o tratamento dos seus dados conforme nossa{" "}
        <a href="/privacidade" className="gold">
          política de privacidade
        </a>
        .
      </p>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Campos
// -----------------------------------------------------------------------------

/**
 * Erros por campo vindos do servidor, distribuídos aos campos sem que cada
 * um precise receber a prop manualmente.
 */
const ContextoErros = createContext<CampoErros>({});

function useErro(nome: string): string | undefined {
  return useContext(ContextoErros)[nome]?.[0];
}

export function Campo({
  nome,
  rotulo,
  tipo = "text",
  obrigatorio = false,
  ajuda,
  autoComplete,
  ...resto
}: {
  nome: string;
  rotulo: string;
  tipo?: string;
  obrigatorio?: boolean;
  ajuda?: string;
  autoComplete?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const erro = useErro(nome);
  const idAjuda = ajuda ? `${nome}-ajuda` : undefined;
  const idErro = erro ? `${nome}-erro` : undefined;

  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={nome}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio" aria-hidden="true">*</span>}
      </label>
      <input
        id={nome}
        name={nome}
        type={tipo}
        required={obrigatorio}
        autoComplete={autoComplete}
        // aria-describedby liga o campo à mensagem de erro para leitores de
        // tela; sem isso, quem usa NVDA ouve "campo inválido" sem saber por quê.
        aria-describedby={[idAjuda, idErro].filter(Boolean).join(" ") || undefined}
        aria-invalid={erro ? true : undefined}
        {...resto}
      />
      {ajuda && (
        <p className="campo__ajuda" id={idAjuda}>
          {ajuda}
        </p>
      )}
      {erro && (
        <p className="campo__erro" id={idErro} role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

export function CampoTexto({
  nome,
  rotulo,
  obrigatorio = false,
  ajuda,
  linhas = 5,
  ...resto
}: {
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  ajuda?: string;
  linhas?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const erro = useErro(nome);

  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={nome}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio" aria-hidden="true">*</span>}
      </label>
      <textarea
        id={nome}
        name={nome}
        rows={linhas}
        required={obrigatorio}
        aria-invalid={erro ? true : undefined}
        {...resto}
      />
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
      {erro && (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

export function CampoSelecao({
  nome,
  rotulo,
  opcoes,
  obrigatorio = false,
  ajuda,
}: {
  nome: string;
  rotulo: string;
  opcoes: { valor: string; rotulo: string }[];
  obrigatorio?: boolean;
  ajuda?: string;
}) {
  const erro = useErro(nome);

  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={nome}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio" aria-hidden="true">*</span>}
      </label>
      <select id={nome} name={nome} required={obrigatorio} aria-invalid={erro ? true : undefined} defaultValue="">
        <option value="" disabled>
          Selecione…
        </option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
      {erro && (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

export function CampoMarcacao({
  nome,
  rotulo,
  obrigatorio = false,
  defaultChecked,
}: {
  nome: string;
  rotulo: React.ReactNode;
  obrigatorio?: boolean;
  defaultChecked?: boolean;
}) {
  const erro = useErro(nome);

  return (
    <div className="campo">
      <div className="campo campo--checkbox">
        <input
          id={nome}
          name={nome}
          type="checkbox"
          value="on"
          required={obrigatorio}
          defaultChecked={defaultChecked}
          aria-invalid={erro ? true : undefined}
        />
        <label htmlFor={nome}>{rotulo}</label>
      </div>
      {erro && (
        <p className="campo__erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}
