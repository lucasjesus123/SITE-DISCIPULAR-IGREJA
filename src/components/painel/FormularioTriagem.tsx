"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarPessoasParaVinculo, processarSubmissao } from "@/app/painel/caixa-entrada/acoes";

/**
 * Formulário de triagem.
 *
 * O fluxo que ele implementa é o que separa "recebemos uma mensagem" de
 * "esta pessoa agora faz parte da nossa base":
 *
 *   1. A pessoa já existe?  -> vincula, e o histórico dela ganha a interação
 *   2. É alguém novo?       -> cria a ficha, com o status certo
 *   3. Não é nenhum dos dois (dúvida, spam) -> arquiva sem poluir a base
 */

interface Celula {
  id: string;
  nome: string;
  bairro: string | null;
}

export function FormularioTriagem({
  submissaoId,
  statusAtual,
  notaAtual,
  jaTemPessoa,
  podeCriarPessoa,
  celulas,
}: {
  submissaoId: string;
  statusAtual: string;
  notaAtual: string | null;
  jaTemPessoa: boolean;
  podeCriarPessoa: boolean;
  celulas: Celula[];
}) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();

  const [status, setStatus] = useState(statusAtual);
  const [nota, setNota] = useState(notaAtual ?? "");
  const [acaoPessoa, setAcaoPessoa] = useState<"nada" | "criar" | "vincular">("nada");
  const [statusPessoa, setStatusPessoa] = useState("VISITANTE");
  const [celulaId, setCelulaId] = useState("");

  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<
    { id: string; nome: string; email: string | null; status: string }[]
  >([]);
  const [pessoaSelecionada, setPessoaSelecionada] = useState<string>("");
  const [buscando, setBuscando] = useState(false);

  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function buscar() {
    if (termoBusca.trim().length < 2) return;
    setBuscando(true);
    try {
      setResultados(await buscarPessoasParaVinculo(termoBusca));
    } finally {
      setBuscando(false);
    }
  }

  function salvar() {
    setFeedback(null);

    iniciarTransicao(async () => {
      const resultado = await processarSubmissao(submissaoId, {
        status,
        notaInterna: nota || undefined,
        criarPessoa: acaoPessoa === "criar",
        pessoaExistenteId: acaoPessoa === "vincular" ? pessoaSelecionada || undefined : undefined,
        statusPessoa: acaoPessoa === "criar" ? statusPessoa : undefined,
        celulaId: celulaId || undefined,
      });

      setFeedback({
        tipo: resultado.ok ? "ok" : "erro",
        texto: resultado.mensagem,
      });

      if (resultado.ok) {
        // refresh() recarrega os dados do servidor sem perder o estado da
        // página — a pessoa vê o resultado sem um recarregamento completo.
        router.refresh();
      }
    });
  }

  return (
    <div className="secao-painel" style={{ marginBottom: 0 }}>
      <h2 className="secao-painel__titulo">Triagem</h2>
      <p className="secao-painel__desc">Decida o que fazer com esta submissão.</p>

      {feedback && (
        <div
          className={`alerta alerta--${feedback.tipo === "ok" ? "sucesso" : "erro"}`}
          role="alert"
          style={{ marginBottom: "1.4rem" }}
        >
          {feedback.texto}
        </div>
      )}

      <div className="stack" style={{ "--flow": "1.3rem" } as React.CSSProperties}>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="status">
            Situação
          </label>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="NOVO">Novo</option>
            <option value="EM_ANALISE">Em análise</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="ARQUIVADO">Arquivado</option>
            <option value="SPAM">Spam</option>
          </select>
        </div>

        {!jaTemPessoa && (
          <>
            <hr className="rule" />

            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="campo__rotulo" style={{ marginBottom: ".7rem" }}>
                Cadastro de pessoa
              </legend>

              <div style={{ display: "grid", gap: ".6rem" }}>
                <Opcao
                  nome="acaoPessoa"
                  valor="nada"
                  atual={acaoPessoa}
                  aoMudar={setAcaoPessoa}
                  rotulo="Não criar cadastro agora"
                />
                <Opcao
                  nome="acaoPessoa"
                  valor="vincular"
                  atual={acaoPessoa}
                  aoMudar={setAcaoPessoa}
                  rotulo="Vincular a uma pessoa que já existe"
                />
                {podeCriarPessoa && (
                  <Opcao
                    nome="acaoPessoa"
                    valor="criar"
                    atual={acaoPessoa}
                    aoMudar={setAcaoPessoa}
                    rotulo="Criar um novo cadastro"
                  />
                )}
              </div>
            </fieldset>

            {acaoPessoa === "vincular" && (
              <div className="campo">
                <label className="campo__rotulo" htmlFor="busca">
                  Buscar pessoa
                </label>
                <div style={{ display: "flex", gap: ".6rem" }}>
                  <input
                    id="busca"
                    type="search"
                    value={termoBusca}
                    onChange={(e) => setTermoBusca(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void buscar();
                      }
                    }}
                    placeholder="Nome, e-mail ou telefone"
                    maxLength={80}
                  />
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void buscar()}
                    disabled={buscando}
                  >
                    {buscando ? "…" : "Buscar"}
                  </button>
                </div>

                {resultados.length > 0 && (
                  <div style={{ marginTop: ".8rem", display: "grid", gap: ".4rem" }}>
                    {resultados.map((p) => (
                      <label
                        key={p.id}
                        style={{
                          display: "flex",
                          gap: ".7rem",
                          alignItems: "center",
                          padding: ".6rem .8rem",
                          border: "1px solid var(--line-on-light)",
                          borderRadius: "var(--radius)",
                          cursor: "pointer",
                          background: pessoaSelecionada === p.id ? "rgb(var(--gold-rgb) / .08)" : "#fff",
                        }}
                      >
                        <input
                          type="radio"
                          name="pessoaSelecionada"
                          value={p.id}
                          checked={pessoaSelecionada === p.id}
                          onChange={() => setPessoaSelecionada(p.id)}
                        />
                        <span>
                          <strong>{p.nome}</strong>
                          {p.email && (
                            <span className="dim" style={{ fontSize: ".82rem" }}>
                              {" "}
                              · {p.email}
                            </span>
                          )}
                          <span className="etiqueta etiqueta--concluido" style={{ marginLeft: ".5rem" }}>
                            {p.status}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}

                {termoBusca.length >= 2 && resultados.length === 0 && !buscando && (
                  <p className="campo__ajuda">Nenhuma pessoa encontrada com esse termo.</p>
                )}
              </div>
            )}

            {acaoPessoa === "criar" && (
              <>
                <div className="campo">
                  <label className="campo__rotulo" htmlFor="statusPessoa">
                    Situação inicial da pessoa
                  </label>
                  <select
                    id="statusPessoa"
                    value={statusPessoa}
                    onChange={(e) => setStatusPessoa(e.target.value)}
                  >
                    <option value="VISITANTE">Visitante</option>
                    <option value="EM_ACOMPANHAMENTO">Em acompanhamento</option>
                    <option value="CONGREGANTE">Congregante</option>
                    <option value="MEMBRO">Membro</option>
                  </select>
                </div>

                {celulas.length > 0 && (
                  <div className="campo">
                    <label className="campo__rotulo" htmlFor="celulaId">
                      Encaminhar para célula
                    </label>
                    <select id="celulaId" value={celulaId} onChange={(e) => setCelulaId(e.target.value)}>
                      <option value="">Não encaminhar agora</option>
                      {celulas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                          {c.bairro ? ` — ${c.bairro}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <hr className="rule" />

        <div className="campo">
          <label className="campo__rotulo" htmlFor="nota">
            Nota interna
          </label>
          <textarea
            id="nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Registre o que foi feito: ligamos, agendamos visita, encaminhamos para o pastor…"
          />
          <p className="campo__ajuda">Visível apenas para a equipe. Não aparece para a pessoa.</p>
        </div>

        <button type="button" className="btn btn--block" onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar triagem"}
        </button>
      </div>
    </div>
  );
}

function Opcao<T extends string>({
  nome,
  valor,
  atual,
  aoMudar,
  rotulo,
}: {
  nome: string;
  valor: T;
  atual: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <label style={{ display: "flex", gap: ".7rem", alignItems: "center", cursor: "pointer", fontSize: ".9rem" }}>
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={atual === valor}
        onChange={() => aoMudar(valor)}
      />
      {rotulo}
    </label>
  );
}
