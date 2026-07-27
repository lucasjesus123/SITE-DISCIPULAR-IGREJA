"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarInteracao } from "@/app/painel/pessoas/acoes";

/**
 * Histórico de contatos pastorais de uma pessoa.
 *
 * As datas chegam JÁ FORMATADAS do servidor. Formatar no cliente com
 * `Intl.DateTimeFormat` produziria um texto diferente do renderizado no
 * servidor (fuso e locale do navegador não são os da máquina), e o React
 * acusaria divergência de hidratação — além de fazer a data "pular" na tela.
 */

export interface ItemInteracao {
  id: string;
  tipo: string;
  descricao: string;
  autor: string;
  quando: string;
}

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: "LIGACAO", rotulo: "Ligação" },
  { valor: "VISITA", rotulo: "Visita" },
  { valor: "MENSAGEM", rotulo: "Mensagem / WhatsApp" },
  { valor: "ORACAO", rotulo: "Oração" },
  { valor: "OUTRO", rotulo: "Outro" },
];

export function HistoricoInteracoes({
  pessoaId,
  itens,
  podeRegistrar,
}: {
  pessoaId: string;
  itens: ItemInteracao[];
  podeRegistrar: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState("LIGACAO");
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);

    iniciar(async () => {
      const resultado = await registrarInteracao(pessoaId, { tipo, descricao });
      if (resultado.ok) {
        setDescricao("");
        setAberto(false);
        router.refresh();
      } else {
        setErro(resultado.mensagem);
      }
    });
  }

  return (
    <section className="secao-painel">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 className="secao-painel__titulo">Histórico de acompanhamento</h2>
          <p className="secao-painel__desc" style={{ marginBottom: 0 }}>
            Cada ligação, visita ou conversa registrada aqui. É o que separa um cadastro de um
            acompanhamento de verdade.
          </p>
        </div>

        {podeRegistrar && !aberto && (
          <button type="button" className="btn btn--sm btn--outline-gold" onClick={() => setAberto(true)}>
            Registrar contato
          </button>
        )}
      </div>

      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ margin: "1.2rem 0" }}>
          {erro}
        </div>
      )}

      {podeRegistrar && aberto && (
        <form onSubmit={enviar} style={{ marginTop: "1.4rem" }} noValidate>
          <div className="grid cols-2">
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`tipo-${pessoaId}`}>
                Tipo de contato
              </label>
              <select
                id={`tipo-${pessoaId}`}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="campo" style={{ marginTop: "1rem" }}>
            <label className="campo__rotulo" htmlFor={`descricao-${pessoaId}`}>
              O que aconteceu
            </label>
            <textarea
              id={`descricao-${pessoaId}`}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Ex.: liguei para saber da cirurgia da mãe. Pediu visita na quinta."
              required
            />
            <span className="campo__ajuda">
              Escreva pensando em quem vai ler depois — inclusive a própria pessoa, se um dia pedir
              cópia dos dados dela.
            </span>
          </div>

          <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem" }}>
            <button type="submit" className="btn btn--sm" disabled={pendente || descricao.trim().length < 3}>
              {pendente ? "Salvando…" : "Salvar no histórico"}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setAberto(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {itens.length === 0 ? (
        <div className="vazio" style={{ marginTop: "1.4rem" }}>
          Nenhum contato registrado ainda.
        </div>
      ) : (
        <ol style={{ listStyle: "none", margin: "1.6rem 0 0", padding: 0, display: "grid", gap: "1rem" }}>
          {itens.map((item) => (
            <li
              key={item.id}
              style={{
                paddingLeft: "1rem",
                borderLeft: "2px solid var(--line-on-light)",
              }}
            >
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
                <span className="etiqueta etiqueta--andamento">{rotuloTipo(item.tipo)}</span>
                <span className="dim" style={{ fontSize: ".78rem" }}>
                  {item.quando} · {item.autor}
                </span>
              </div>
              {/*
                `whiteSpace: pre-wrap` preserva as quebras de linha sem
                renderizar HTML. O React escapa o texto, então nada colado pelo
                usuário vira marcação.
              */}
              <p style={{ margin: ".45rem 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {item.descricao}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function rotuloTipo(tipo: string): string {
  return TIPOS.find((t) => t.valor === tipo)?.rotulo ?? "Contato";
}
