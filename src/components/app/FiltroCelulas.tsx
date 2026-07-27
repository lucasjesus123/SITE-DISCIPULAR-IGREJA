"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * Filtro do "encontre uma célula".
 *
 * POR QUE O FILTRO VIVE NA URL, E NÃO EM ESTADO LOCAL
 * A lista em si é renderizada no servidor. Guardar o filtro na URL mantém a
 * página compartilhável ("olha as células de Vera Cruz: <link>"), sobrevive ao
 * botão voltar do celular e evita mandar as 200 células para o navegador só
 * para filtrar no cliente.
 *
 * DETALHE DE SEGURANÇA
 * Este componente monta a query string do ZERO, com apenas três chaves
 * conhecidas. Ele nunca copia os parâmetros atuais da URL — se copiasse,
 * qualquer lixo que alguém colasse no endereço seria propagado a cada clique,
 * e um dia acabaria refletido em algum lugar. O servidor revalida tudo de novo
 * (Zod + lista fechada) antes de usar; isto aqui é só a metade conveniente.
 */

const DIAS = [
  { valor: 0, curto: "Dom" },
  { valor: 1, curto: "Seg" },
  { valor: 2, curto: "Ter" },
  { valor: 3, curto: "Qua" },
  { valor: 4, curto: "Qui" },
  { valor: 5, curto: "Sex" },
  { valor: 6, curto: "Sáb" },
] as const;

export function FiltroCelulas({
  cidades,
  bairros,
  cidade,
  bairro,
  dia,
  totalFiltrado,
}: {
  cidades: string[];
  /** Já filtrados pela cidade selecionada — quem decide isso é o servidor. */
  bairros: string[];
  cidade: string | null;
  bairro: string | null;
  dia: number | null;
  totalFiltrado: number;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function navegar(proximo: { cidade?: string | null; bairro?: string | null; dia?: number | null }) {
    const params = new URLSearchParams();

    const novaCidade = proximo.cidade !== undefined ? proximo.cidade : cidade;
    // Trocar de cidade zera o bairro: "Centro" existe em toda cidade, e manter
    // o bairro antigo devolveria uma lista vazia sem a pessoa entender por quê.
    const novoBairro =
      proximo.cidade !== undefined ? (proximo.bairro ?? null) : proximo.bairro !== undefined ? proximo.bairro : bairro;
    const novoDia = proximo.dia !== undefined ? proximo.dia : dia;

    if (novaCidade) params.set("cidade", novaCidade);
    if (novoBairro) params.set("bairro", novoBairro);
    if (novoDia !== null && novoDia !== undefined) params.set("dia", String(novoDia));

    const query = params.toString();
    iniciar(() => {
      // `replace` e não `push`: mexer no filtro não deve encher o histórico de
      // volta do celular com dez variações da mesma tela.
      router.replace(query ? `/app/celulas?${query}` : "/app/celulas", { scroll: false });
    });
  }

  const temFiltro = cidade !== null || bairro !== null || dia !== null;

  return (
    <div style={{ display: "grid", gap: ".9rem" }} aria-busy={pendente}>
      {cidades.length > 1 && (
        <div className="campo">
          <label className="campo__rotulo" htmlFor="filtro-cidade">
            Cidade
          </label>
          <select
            id="filtro-cidade"
            value={cidade ?? ""}
            onChange={(e) => navegar({ cidade: e.target.value || null, bairro: null })}
          >
            <option value="">Todas as cidades</option>
            {cidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {bairros.length > 1 && (
        <div className="campo">
          <label className="campo__rotulo" htmlFor="filtro-bairro">
            Bairro
          </label>
          <select
            id="filtro-bairro"
            value={bairro ?? ""}
            onChange={(e) => navegar({ bairro: e.target.value || null })}
          >
            <option value="">Todos os bairros</option>
            {bairros.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <p className="campo__rotulo" id="rotulo-dia" style={{ marginBottom: ".55rem" }}>
          Dia da semana
        </p>
        <div
          role="group"
          aria-labelledby="rotulo-dia"
          style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}
        >
          {DIAS.map((d) => {
            const ativo = dia === d.valor;
            return (
              <button
                key={d.valor}
                type="button"
                aria-pressed={ativo}
                onClick={() => navegar({ dia: ativo ? null : d.valor })}
                style={{
                  // 44px de altura: mínimo do WCAG para alvo de toque. O app é
                  // usado com o polegar, em pé, muitas vezes sem óculos.
                  minHeight: 44,
                  padding: ".55rem .85rem",
                  borderRadius: 999,
                  fontSize: ".78rem",
                  fontWeight: ativo ? 600 : 400,
                  border: "1px solid",
                  borderColor: ativo ? "var(--gold)" : "var(--line-on-dark)",
                  background: ativo ? "rgb(var(--gold-rgb) / .14)" : "transparent",
                  color: ativo ? "var(--gold)" : "var(--bone-dim)",
                }}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: ".8rem", color: "var(--bone-faint)" }} aria-live="polite">
        {totalFiltrado === 0
          ? "Nenhuma célula com esses filtros."
          : `${totalFiltrado} ${totalFiltrado === 1 ? "célula encontrada" : "células encontradas"}.`}
        {temFiltro && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => navegar({ cidade: null, bairro: null, dia: null })}
              style={{
                background: "none",
                border: 0,
                padding: 0,
                color: "var(--gold)",
                fontSize: ".8rem",
                textDecoration: "underline",
              }}
            >
              Limpar filtros
            </button>
          </>
        )}
      </p>
    </div>
  );
}
