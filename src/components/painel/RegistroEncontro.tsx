"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarEncontro } from "@/app/painel/celulas/acoes";

/**
 * Relatório do encontro da célula.
 *
 * É o formulário que o líder preenche toda semana, muitas vezes no celular,
 * depois das 22h. Por isso: poucos campos, teclado numérico nos números, e
 * data já preenchida com o último dia de encontro previsto.
 *
 * Existe um relatório por célula e por dia. Reenviar a mesma data CORRIGE o
 * relatório em vez de duplicar — é o comportamento que o líder espera quando
 * percebe que errou a contagem.
 */
export function RegistroEncontro({
  celulaId,
  dataSugerida,
}: {
  celulaId: string;
  /** "AAAA-MM-DD" — calculado no servidor a partir do dia de encontro. */
  dataSugerida: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado = await registrarEncontro(celulaId, dados);
      if (resultado.ok) {
        setSucesso(resultado.mensagem);
        setAberto(false);
        router.refresh();
      } else {
        setErro(resultado.mensagem);
        setCampos(resultado.campos ?? {});
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
          <h2 className="secao-painel__titulo">Relatar encontro</h2>
          <p className="secao-painel__desc" style={{ marginBottom: 0 }}>
            Se já houver relatório para a data escolhida, ele é corrigido — não duplicado.
          </p>
        </div>
        {!aberto && (
          <button type="button" className="btn btn--sm btn--outline-gold" onClick={() => setAberto(true)}>
            Registrar
          </button>
        )}
      </div>

      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginTop: "1.2rem" }}>
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="alerta alerta--sucesso" role="status" style={{ marginTop: "1.2rem" }}>
          {sucesso}
        </div>
      )}

      {aberto && (
        <form onSubmit={enviar} style={{ marginTop: "1.4rem" }} noValidate>
          <div className="grid cols-3">
            <Campo rotulo="Data do encontro" nome="data" erros={campos.data} obrigatorio>
              <input id="data" name="data" type="date" required defaultValue={dataSugerida} />
            </Campo>

            <Campo rotulo="Presentes" nome="presentes" erros={campos.presentes} obrigatorio>
              <input
                id="presentes"
                name="presentes"
                type="number"
                min={0}
                max={1000}
                required
                defaultValue={0}
                inputMode="numeric"
              />
            </Campo>

            <Campo rotulo="Visitantes" nome="visitantes" erros={campos.visitantes} obrigatorio>
              <input
                id="visitantes"
                name="visitantes"
                type="number"
                min={0}
                max={1000}
                required
                defaultValue={0}
                inputMode="numeric"
              />
            </Campo>

            <Campo
              rotulo="Decisões"
              nome="decisoes"
              erros={campos.decisoes}
              ajuda="Quantas pessoas entregaram a vida a Jesus neste encontro."
            >
              <input
                id="decisoes"
                name="decisoes"
                type="number"
                min={0}
                max={1000}
                defaultValue={0}
                inputMode="numeric"
              />
            </Campo>

            <Campo rotulo="Oferta (R$)" nome="oferta" erros={campos.oferta} ajuda="Ex.: 120,50">
              <input
                id="oferta"
                name="oferta"
                type="text"
                maxLength={14}
                defaultValue=""
                inputMode="decimal"
                placeholder="0,00"
              />
            </Campo>
          </div>

          <div className="campo" style={{ marginTop: "1.2rem" }}>
            <label className="campo__rotulo" htmlFor="observacoes">
              Observações
            </label>
            <textarea
              id="observacoes"
              name="observacoes"
              rows={3}
              maxLength={2000}
              placeholder="Quem faltou, quem precisa de visita, o que Deus fez."
            />
            {campos.observacoes?.map((m) => (
              <span key={m} className="campo__erro">
                {m}
              </span>
            ))}
          </div>

          <div style={{ display: "flex", gap: ".6rem", marginTop: "1.2rem" }}>
            <button type="submit" className="btn btn--sm" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar relatório"}
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
    </section>
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
