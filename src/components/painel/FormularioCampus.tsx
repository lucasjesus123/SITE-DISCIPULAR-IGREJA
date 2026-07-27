"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarCampus, criarCampus, excluirCampus } from "@/app/painel/campi/acoes";

/**
 * Formulário de campus (sede / congregação).
 *
 * SOBRE A PRÉVIA DO MAPA
 * A prévia só é renderizada se o endereço passar pela MESMA allowlist do
 * servidor: https + www.google.com + caminho /maps/embed. Poderia parecer
 * exagero validar de novo no navegador, já que o servidor valida — mas a
 * prévia é um `<iframe>` renderizado na origem do painel, com a sessão do
 * pastor logado. Se ela aceitasse qualquer URL digitada, teríamos criado
 * dentro do painel exatamente o buraco que fechamos no site.
 */

export interface ValoresCampus {
  nome: string;
  descricao: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  mapaEmbedUrl: string;
  telefone: string;
  principal: boolean;
  ativo: boolean;
  ordem: number;
}

const VAZIO: ValoresCampus = {
  nome: "",
  descricao: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  mapaEmbedUrl: "",
  telefone: "",
  principal: false,
  ativo: true,
  ordem: 0,
};

/** Espelha a allowlist do servidor. Devolve `null` para tudo que não for o
 *  mapa incorporado do Google. */
function mapaSeguro(bruto: string): string | null {
  const texto = bruto.trim();
  if (!texto) return null;

  // O usuário pode colar o `<iframe …>` inteiro; pegamos só o src.
  const doIframe = texto.includes("<") ? texto.match(/src\s*=\s*["']([^"']+)["']/i)?.[1] : null;

  try {
    const u = new URL(doIframe ?? texto);
    if (u.protocol !== "https:") return null;
    if (u.hostname !== "www.google.com") return null;
    if (!u.pathname.startsWith("/maps/embed")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function FormularioCampus({
  modo,
  campusId,
  inicial,
}: {
  modo: "criar" | "editar";
  campusId?: string;
  inicial?: Partial<ValoresCampus>;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const v: ValoresCampus = { ...VAZIO, ...inicial };

  const [mapa, setMapa] = useState(v.mapaEmbedUrl);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const mapaValido = mapaSeguro(mapa);
  const sufixo = campusId ?? "novo";

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = Object.fromEntries(new FormData(formulario));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado =
        modo === "criar" ? await criarCampus(dados) : await atualizarCampus(campusId ?? "", dados);

      if (resultado.ok) {
        setSucesso(resultado.mensagem);
        if (modo === "criar") {
          formulario.reset();
          setMapa("");
        }
        router.refresh();
        return;
      }

      setCampos(resultado.campos ?? {});
      setErro(resultado.mensagem);
    });
  }

  function remover() {
    setErro(null);
    iniciar(async () => {
      const resultado = await excluirCampus(campusId ?? "");
      if (resultado.ok) {
        router.refresh();
        return;
      }
      setErro(resultado.mensagem);
      setConfirmandoExclusao(false);
    });
  }

  return (
    <form onSubmit={enviar} noValidate>
      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1.2rem" }}>
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="alerta alerta--sucesso" role="status" style={{ marginBottom: "1.2rem" }}>
          {sucesso}
        </div>
      )}

      <div className="grid cols-2">
        <Campo rotulo="Nome" nome={`nome-${sufixo}`} erros={campos.nome} obrigatorio>
          <input
            id={`nome-${sufixo}`}
            name="nome"
            type="text"
            required
            maxLength={120}
            defaultValue={v.nome}
            placeholder="Sede Lajeado"
            autoComplete="off"
          />
        </Campo>

        <Campo
          rotulo="Descrição curta"
          nome={`descricao-${sufixo}`}
          erros={campos.descricao}
          ajuda="Ex.: Cultos aos domingos, 9h e 19h."
        >
          <input
            id={`descricao-${sufixo}`}
            name="descricao"
            type="text"
            maxLength={255}
            defaultValue={v.descricao}
          />
        </Campo>
      </div>

      <div className="grid cols-3">
        <Campo rotulo="CEP" nome={`cep-${sufixo}`} erros={campos.cep}>
          <input
            id={`cep-${sufixo}`}
            name="cep"
            type="text"
            maxLength={9}
            inputMode="numeric"
            defaultValue={v.cep}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Logradouro" nome={`logradouro-${sufixo}`} erros={campos.logradouro}>
          <input
            id={`logradouro-${sufixo}`}
            name="logradouro"
            type="text"
            maxLength={200}
            defaultValue={v.logradouro}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Número" nome={`numero-${sufixo}`} erros={campos.numero}>
          <input
            id={`numero-${sufixo}`}
            name="numero"
            type="text"
            maxLength={20}
            defaultValue={v.numero}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Complemento" nome={`complemento-${sufixo}`} erros={campos.complemento}>
          <input
            id={`complemento-${sufixo}`}
            name="complemento"
            type="text"
            maxLength={100}
            defaultValue={v.complemento}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Bairro" nome={`bairro-${sufixo}`} erros={campos.bairro}>
          <input
            id={`bairro-${sufixo}`}
            name="bairro"
            type="text"
            maxLength={100}
            defaultValue={v.bairro}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Cidade" nome={`cidade-${sufixo}`} erros={campos.cidade}>
          <input
            id={`cidade-${sufixo}`}
            name="cidade"
            type="text"
            maxLength={100}
            defaultValue={v.cidade}
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="UF" nome={`uf-${sufixo}`} erros={campos.uf}>
          <input
            id={`uf-${sufixo}`}
            name="uf"
            type="text"
            maxLength={2}
            defaultValue={v.uf}
            autoComplete="off"
            style={{ textTransform: "uppercase" }}
          />
        </Campo>

        <Campo rotulo="Telefone" nome={`telefone-${sufixo}`} erros={campos.telefone}>
          <input
            id={`telefone-${sufixo}`}
            name="telefone"
            type="tel"
            maxLength={20}
            defaultValue={v.telefone}
            inputMode="tel"
            autoComplete="off"
          />
        </Campo>

        <Campo
          rotulo="Ordem"
          nome={`ordem-${sufixo}`}
          erros={campos.ordem}
          ajuda="Menor número aparece primeiro."
        >
          <input
            id={`ordem-${sufixo}`}
            name="ordem"
            type="number"
            min={0}
            max={999}
            defaultValue={v.ordem}
          />
        </Campo>
      </div>

      <Campo
        rotulo="Mapa do Google"
        nome={`mapaEmbedUrl-${sufixo}`}
        erros={campos.mapaEmbedUrl}
        ajuda="No Google Maps: Compartilhar → Incorporar um mapa → Copiar HTML. Pode colar o código inteiro."
      >
        <textarea
          id={`mapaEmbedUrl-${sufixo}`}
          name="mapaEmbedUrl"
          rows={2}
          value={mapa}
          onChange={(e) => setMapa(e.target.value)}
          spellCheck={false}
          placeholder="https://www.google.com/maps/embed?pb=..."
        />
      </Campo>

      {mapa.trim() !== "" && !mapaValido && (
        <p className="campo__erro" role="alert">
          Este endereço não é um mapa incorporado do Google. Só aceitamos endereços que começam com
          https://www.google.com/maps/embed — é o que impede que um site qualquer seja exibido dentro
          da página da igreja.
        </p>
      )}

      {mapaValido && (
        <div className="frame" style={{ marginTop: ".8rem", marginBottom: "1.2rem" }}>
          <iframe
            src={mapaValido}
            title="Prévia do mapa"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-popups"
          />
        </div>
      )}

      <div style={{ display: "grid", gap: ".5rem", margin: "1rem 0 1.4rem" }}>
        <div className="campo campo--checkbox">
          <input
            id={`principal-${sufixo}`}
            name="principal"
            type="checkbox"
            value="on"
            defaultChecked={v.principal}
          />
          <label htmlFor={`principal-${sufixo}`}>
            Endereço principal — usado no rodapé e nos dados de contato. Só um campus pode ser o
            principal; marcar este desmarca o anterior.
          </label>
        </div>

        <div className="campo campo--checkbox">
          <input
            id={`ativo-${sufixo}`}
            name="ativo"
            type="checkbox"
            value="on"
            defaultChecked={v.ativo}
          />
          <label htmlFor={`ativo-${sufixo}`}>Ativo — aparece no site e nas listas do painel</label>
        </div>
      </div>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn btn--sm" disabled={pendente}>
          {pendente ? "Salvando…" : modo === "criar" ? "Criar campus" : "Salvar alterações"}
        </button>

        {modo === "editar" && !confirmandoExclusao && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={pendente}
            style={{ marginLeft: "auto", color: "#cf222e" }}
          >
            Excluir campus
          </button>
        )}
      </div>

      {modo === "editar" && confirmandoExclusao && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.2rem" }}>
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Excluir este campus?</strong> Pessoas, células e itens de agenda ligados a ele
            continuam existindo, mas ficam sem campus definido. Para tirar do site sem desfazer
            vínculos, desmarque &ldquo;Ativo&rdquo;.
          </p>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <button type="button" className="btn btn--sm" onClick={remover} disabled={pendente}>
              {pendente ? "Excluindo…" : "Sim, excluir"}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirmandoExclusao(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

function Campo({
  rotulo,
  nome,
  erros,
  ajuda,
  obrigatorio,
  children,
}: {
  rotulo: string;
  nome: string;
  erros?: string[];
  ajuda?: string;
  obrigatorio?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={nome}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      {children}
      {ajuda && <span className="campo__ajuda">{ajuda}</span>}
      {erros?.map((mensagem) => (
        <span key={mensagem} className="campo__erro">
          {mensagem}
        </span>
      ))}
    </div>
  );
}
