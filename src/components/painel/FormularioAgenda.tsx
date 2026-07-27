"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  atualizarAgendaItem,
  criarAgendaItem,
  excluirAgendaItem,
} from "@/app/painel/agenda/acoes";

/**
 * Formulário de item da agenda (criação e edição).
 *
 * O SELETOR DE MODO É O CORAÇÃO DESTA TELA.
 * Um item é "toda quarta às 19h30" OU "dia 12/10 às 20h" — nunca os dois. Em
 * vez de mostrar os quatro campos juntos e torcer para o usuário entender, só
 * os campos do modo escolhido são RENDERIZADOS. Como o envio é montado a
 * partir do formulário, os campos do outro modo simplesmente não existem no
 * payload, e o servidor recebe exatamente uma das duas configurações.
 *
 * Isso é conveniência, não segurança: a regra de "exatamente um modo" é
 * reimposta por Zod dentro da Server Action, que aceita qualquer payload de
 * quem a chamar direto.
 */

export interface ValoresAgenda {
  tipo: string;
  titulo: string;
  descricao: string;
  campusId: string;
  diaSemana: string;
  horario: string;
  dataHora: string;
  destaque: boolean;
  ativo: boolean;
  publicoSite: boolean;
  ordem: number;
}

const VAZIO: ValoresAgenda = {
  tipo: "CULTO",
  titulo: "",
  descricao: "",
  campusId: "",
  diaSemana: "",
  horario: "",
  dataHora: "",
  destaque: false,
  ativo: true,
  publicoSite: true,
  ordem: 0,
};

const DIAS = [
  { valor: "0", rotulo: "Domingo" },
  { valor: "1", rotulo: "Segunda-feira" },
  { valor: "2", rotulo: "Terça-feira" },
  { valor: "3", rotulo: "Quarta-feira" },
  { valor: "4", rotulo: "Quinta-feira" },
  { valor: "5", rotulo: "Sexta-feira" },
  { valor: "6", rotulo: "Sábado" },
];

const TIPOS = [
  { valor: "CULTO", rotulo: "Culto" },
  { valor: "ESCOLA", rotulo: "Escola / curso" },
  { valor: "CELULA", rotulo: "Célula" },
  { valor: "EVENTO", rotulo: "Evento" },
  { valor: "ENSAIO", rotulo: "Ensaio" },
  { valor: "ORACAO", rotulo: "Oração" },
];

export function FormularioAgenda({
  modo,
  itemId,
  inicial,
  campi,
}: {
  modo: "criar" | "editar";
  itemId?: string;
  inicial?: Partial<ValoresAgenda>;
  campi: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const v: ValoresAgenda = { ...VAZIO, ...inicial };

  const [repeticao, setRepeticao] = useState<"semanal" | "pontual">(
    v.dataHora ? "pontual" : "semanal",
  );
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const dados = Object.fromEntries(new FormData(formulario));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado =
        modo === "criar"
          ? await criarAgendaItem(dados)
          : await atualizarAgendaItem(itemId ?? "", dados);

      if (resultado.ok) {
        setSucesso(resultado.mensagem);
        if (modo === "criar") {
          formulario.reset();
          setRepeticao("semanal");
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
      const resultado = await excluirAgendaItem(itemId ?? "");
      if (resultado.ok) {
        router.refresh();
        return;
      }
      setErro(resultado.mensagem);
      setConfirmandoExclusao(false);
    });
  }

  const sufixo = itemId ?? "novo";

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
        <Campo rotulo="Título" nome={`titulo-${sufixo}`} erros={campos.titulo} obrigatorio>
          <input
            id={`titulo-${sufixo}`}
            name="titulo"
            type="text"
            required
            maxLength={160}
            defaultValue={v.titulo}
            placeholder="Culto de celebração"
            autoComplete="off"
          />
        </Campo>

        <Campo rotulo="Tipo" nome={`tipo-${sufixo}`} erros={campos.tipo}>
          <select id={`tipo-${sufixo}`} name="tipo" defaultValue={v.tipo}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo
        rotulo="Descrição"
        nome={`descricao-${sufixo}`}
        erros={campos.descricao}
        ajuda="Uma ou duas frases. Aparece no site abaixo do título."
      >
        <textarea
          id={`descricao-${sufixo}`}
          name="descricao"
          rows={2}
          maxLength={2000}
          defaultValue={v.descricao}
        />
      </Campo>

      <fieldset
        style={{
          border: "1px solid var(--line-on-light)",
          borderRadius: "var(--radius)",
          padding: "1rem",
          margin: "1.2rem 0",
        }}
      >
        <legend className="campo__rotulo" style={{ padding: "0 .4rem" }}>
          Quando acontece
        </legend>

        <div style={{ display: "flex", gap: "1.2rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <label style={{ display: "flex", gap: ".45rem", alignItems: "center", fontSize: ".88rem" }}>
            <input
              type="radio"
              name={`repeticao-${sufixo}`}
              checked={repeticao === "semanal"}
              onChange={() => setRepeticao("semanal")}
            />
            Toda semana
          </label>
          <label style={{ display: "flex", gap: ".45rem", alignItems: "center", fontSize: ".88rem" }}>
            <input
              type="radio"
              name={`repeticao-${sufixo}`}
              checked={repeticao === "pontual"}
              onChange={() => setRepeticao("pontual")}
            />
            Data marcada
          </label>
        </div>

        {repeticao === "semanal" ? (
          <div className="grid cols-2">
            <Campo rotulo="Dia da semana" nome={`diaSemana-${sufixo}`} erros={campos.diaSemana} obrigatorio>
              <select id={`diaSemana-${sufixo}`} name="diaSemana" defaultValue={v.diaSemana} required>
                <option value="">Escolha o dia</option>
                {DIAS.map((d) => (
                  <option key={d.valor} value={d.valor}>
                    {d.rotulo}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo rotulo="Horário" nome={`horario-${sufixo}`} erros={campos.horario} obrigatorio>
              <input
                id={`horario-${sufixo}`}
                name="horario"
                type="time"
                required
                defaultValue={v.horario}
              />
            </Campo>
          </div>
        ) : (
          <Campo
            rotulo="Data e hora"
            nome={`dataHora-${sufixo}`}
            erros={campos.dataHora}
            obrigatorio
            ajuda="Horário local da igreja."
          >
            <input
              id={`dataHora-${sufixo}`}
              name="dataHora"
              type="datetime-local"
              required
              defaultValue={v.dataHora}
            />
          </Campo>
        )}
      </fieldset>

      <div className="grid cols-2">
        <Campo rotulo="Campus" nome={`campusId-${sufixo}`} erros={campos.campusId}>
          <select id={`campusId-${sufixo}`} name="campusId" defaultValue={v.campusId}>
            <option value="">Todos / não se aplica</option>
            {campi.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>

        <Campo
          rotulo="Ordem"
          nome={`ordem-${sufixo}`}
          erros={campos.ordem}
          ajuda="Menor número aparece primeiro na lista do site."
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

      <div style={{ display: "grid", gap: ".5rem", margin: "1rem 0 1.4rem" }}>
        <div className="campo campo--checkbox">
          <input
            id={`publicoSite-${sufixo}`}
            name="publicoSite"
            type="checkbox"
            value="on"
            defaultChecked={v.publicoSite}
          />
          <label htmlFor={`publicoSite-${sufixo}`}>Mostrar no site e no aplicativo</label>
        </div>

        <div className="campo campo--checkbox">
          <input
            id={`destaque-${sufixo}`}
            name="destaque"
            type="checkbox"
            value="on"
            defaultChecked={v.destaque}
          />
          <label htmlFor={`destaque-${sufixo}`}>Destacar (aparece antes dos demais)</label>
        </div>

        <div className="campo campo--checkbox">
          <input
            id={`ativo-${sufixo}`}
            name="ativo"
            type="checkbox"
            value="on"
            defaultChecked={v.ativo}
          />
          <label htmlFor={`ativo-${sufixo}`}>
            Ativo — desmarque para guardar o item sem exibi-lo em lugar nenhum
          </label>
        </div>
      </div>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn btn--sm" disabled={pendente}>
          {pendente ? "Salvando…" : modo === "criar" ? "Adicionar à agenda" : "Salvar alterações"}
        </button>

        {modo === "editar" && !confirmandoExclusao && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={pendente}
            style={{ marginLeft: "auto", color: "#cf222e" }}
          >
            Remover
          </button>
        )}
      </div>

      {modo === "editar" && confirmandoExclusao && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.2rem" }}>
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Remover este item?</strong> Ele some do site e do aplicativo na hora. Se a
            intenção é só tirar do ar por um tempo, desmarque &ldquo;Ativo&rdquo; em vez de remover.
          </p>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <button type="button" className="btn btn--sm" onClick={remover} disabled={pendente}>
              {pendente ? "Removendo…" : "Sim, remover"}
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
