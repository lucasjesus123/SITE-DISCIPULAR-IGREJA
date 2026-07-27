"use client";

import { useState, useTransition } from "react";

export interface IgrejaDisponivel {
  id: string;
  nome: string;
  /** Rótulo do papel do usuário naquela igreja ("Pastor", "Secretaria"...). */
  papel: string;
  /** Endereço pelo qual aquela igreja é acessada. Exibido para orientar. */
  host: string;
  /** false quando a igreja está suspensa/cancelada: aparece, mas não abre. */
  disponivel: boolean;
}

export interface ResultadoEscolha {
  ok: boolean;
  mensagem: string;
  /** Para onde ir. Absoluto quando a igreja vive em outro endereço. */
  url?: string;
}

/**
 * Escolha de igreja para quem pastoreia mais de uma.
 *
 * POR QUE O DESTINO É DECIDIDO NO SERVIDOR
 * O componente manda apenas o id escolhido e recebe de volta a URL. Ele não
 * monta endereço nenhum: se o destino fosse calculado aqui, um id adulterado
 * poderia virar uma navegação para um host arbitrário — e um "escolha sua
 * igreja" que redireciona para fora é a definição de open redirect. A ação do
 * servidor revalida o vínculo, resolve o host canônico da igreja e devolve o
 * endereço; aqui só navegamos.
 */
export function SeletorDeIgreja({
  igrejas,
  acao,
}: {
  igrejas: IgrejaDisponivel[];
  acao: (tenantId: string) => Promise<ResultadoEscolha>;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  function escolher(id: string) {
    setErro(null);
    setSelecionada(id);
    iniciar(async () => {
      const resultado = await acao(id);
      if (resultado.ok && resultado.url) {
        // Navegação completa: o destino costuma ser OUTRO host (cada igreja tem
        // o seu), e o roteador do Next só sabe navegar dentro da própria origem.
        window.location.assign(resultado.url);
        return;
      }
      setSelecionada(null);
      setErro(resultado.mensagem);
    });
  }

  return (
    <div className="stack" style={{ "--flow": ".9rem" } as React.CSSProperties}>
      {erro && (
        <div className="alerta alerta--erro" role="alert">
          {erro}
        </div>
      )}

      {igrejas.map((igreja) => (
        <button
          key={igreja.id}
          type="button"
          onClick={() => escolher(igreja.id)}
          disabled={pendente || !igreja.disponivel}
          className="card"
          style={{
            width: "100%",
            textAlign: "left",
            cursor: igreja.disponivel ? "pointer" : "not-allowed",
            opacity: igreja.disponivel ? 1 : 0.55,
          }}
        >
          <span className="card__titulo" style={{ display: "block" }}>
            {igreja.nome}
          </span>
          <span className="card__texto" style={{ display: "block", marginTop: ".35rem" }}>
            {igreja.papel} · {igreja.host}
          </span>
          {!igreja.disponivel && (
            <span className="etiqueta etiqueta--urgente" style={{ marginTop: ".7rem" }}>
              Acesso indisponível
            </span>
          )}
          {pendente && selecionada === igreja.id && (
            <span className="card__texto" style={{ display: "block", marginTop: ".5rem" }}>
              Abrindo…
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
