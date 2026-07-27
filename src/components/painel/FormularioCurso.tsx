"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  atualizarCurso,
  criarCurso,
  definirStatusMatricula,
  excluirCurso,
} from "@/app/painel/cursos/acoes";

/**
 * Formulário de curso da Escola + controles de matrícula.
 *
 * SOBRE O CAMPO DE PREÇO
 * O usuário digita como fala: "120", "120,00", "R$ 1.250,90". O servidor
 * converte para CENTAVOS por manipulação de string. Aqui no navegador o campo
 * é `type="text"` de propósito — um `type="number"` com casas decimais varia
 * de comportamento entre teclados de celular e locales, e "1.250" pode chegar
 * como mil duzentos e cinquenta ou como um vírgula dois cinco dependendo do
 * aparelho. Texto puro + conversão determinística no servidor é previsível.
 */

export interface ValoresCurso {
  nome: string;
  slug: string;
  resumo: string;
  descricao: string;
  diaSemana: string;
  horario: string;
  preco: string;
  periodicidade: string;
  vagas: string;
  inscricoesAbertas: boolean;
  ativo: boolean;
  ordem: number;
}

const VAZIO: ValoresCurso = {
  nome: "",
  slug: "",
  resumo: "",
  descricao: "",
  diaSemana: "",
  horario: "",
  preco: "",
  periodicidade: "",
  vagas: "",
  inscricoesAbertas: true,
  ativo: true,
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

export function FormularioCurso({
  modo,
  cursoId,
  inicial,
  podeExcluir = false,
}: {
  modo: "criar" | "editar";
  cursoId?: string;
  inicial?: Partial<ValoresCurso>;
  podeExcluir?: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const v: ValoresCurso = { ...VAZIO, ...inicial };

  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado =
        modo === "criar" ? await criarCurso(dados) : await atualizarCurso(cursoId ?? "", dados);

      if (resultado.ok) {
        if (modo === "criar" && resultado.cursoId) {
          router.push(`/painel/cursos/${resultado.cursoId}`);
          return;
        }
        setSucesso(resultado.mensagem);
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
      const resultado = await excluirCurso(cursoId ?? "");
      if (resultado.ok) {
        router.push("/painel/cursos");
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
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1.4rem" }}>
          {erro}
        </div>
      )}
      {sucesso && (
        <div className="alerta alerta--sucesso" role="status" style={{ marginBottom: "1.4rem" }}>
          {sucesso}
        </div>
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">O curso</h2>
        <p className="secao-painel__desc">
          O resumo aparece no cartão da Escola no site; a descrição, na página do curso.
        </p>

        <Campo rotulo="Nome" nome="nome" erros={campos.nome} obrigatorio>
          <input
            id="nome"
            name="nome"
            type="text"
            required
            maxLength={160}
            defaultValue={v.nome}
            placeholder="Teologia Discipular"
            autoComplete="off"
          />
        </Campo>

        <Campo
          rotulo="Resumo"
          nome="resumo"
          erros={campos.resumo}
          ajuda="Uma linha. É o que a pessoa lê antes de clicar."
        >
          <input id="resumo" name="resumo" type="text" maxLength={400} defaultValue={v.resumo} />
        </Campo>

        <Campo rotulo="Descrição" nome="descricao" erros={campos.descricao}>
          <textarea
            id="descricao"
            name="descricao"
            rows={5}
            maxLength={6000}
            defaultValue={v.descricao}
          />
        </Campo>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Encontros</h2>

        <div className="grid cols-2">
          <Campo rotulo="Dia da semana" nome="diaSemana" erros={campos.diaSemana}>
            <select id="diaSemana" name="diaSemana" defaultValue={v.diaSemana}>
              <option value="">Não definido</option>
              {DIAS.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Horário" nome="horario" erros={campos.horario}>
            <input id="horario" name="horario" type="time" defaultValue={v.horario} />
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Investimento e vagas</h2>
        <p className="secao-painel__desc">
          Deixe o valor em branco para cursos gratuitos. As vagas, quando definidas, bloqueiam a
          confirmação de novas matrículas depois de lotadas.
        </p>

        <div className="grid cols-3">
          <Campo
            rotulo="Valor"
            nome="preco"
            erros={campos.preco}
            ajuda="Ex.: 120,00. Em branco = gratuito."
          >
            <input
              id="preco"
              name="preco"
              type="text"
              inputMode="decimal"
              maxLength={20}
              defaultValue={v.preco}
              placeholder="0,00"
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Cobrança" nome="periodicidade" erros={campos.periodicidade}>
            <select id="periodicidade" name="periodicidade" defaultValue={v.periodicidade}>
              <option value="">Não se aplica</option>
              <option value="UNICO">Pagamento único</option>
              <option value="MENSAL">Mensal</option>
            </select>
          </Campo>

          <Campo
            rotulo="Vagas"
            nome="vagas"
            erros={campos.vagas}
            ajuda="Em branco = sem limite."
          >
            <input
              id="vagas"
              name="vagas"
              type="number"
              min={1}
              max={10000}
              defaultValue={v.vagas}
            />
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Publicação</h2>

        <div style={{ display: "grid", gap: ".5rem" }}>
          <div className="campo campo--checkbox">
            <input
              id="ativo"
              name="ativo"
              type="checkbox"
              value="on"
              defaultChecked={v.ativo}
            />
            <label htmlFor="ativo">Ativo — aparece na Escola, no site e no aplicativo</label>
          </div>

          <div className="campo campo--checkbox">
            <input
              id="inscricoesAbertas"
              name="inscricoesAbertas"
              type="checkbox"
              value="on"
              defaultChecked={v.inscricoesAbertas}
            />
            <label htmlFor="inscricoesAbertas">
              Inscrições abertas — desmarque para manter o curso visível sem receber novas inscrições
            </label>
          </div>
        </div>

        <div className="grid cols-2" style={{ marginTop: "1rem" }}>
          <Campo
            rotulo="Ordem"
            nome="ordem"
            erros={campos.ordem}
            ajuda="Menor número aparece primeiro."
          >
            <input id="ordem" name="ordem" type="number" min={0} max={999} defaultValue={v.ordem} />
          </Campo>

          {modo === "editar" && (
            <Campo
              rotulo="Endereço do curso"
              nome="slug"
              erros={campos.slug}
              ajuda="Muda a URL pública. Links já divulgados param de funcionar."
            >
              <input
                id="slug"
                name="slug"
                type="text"
                maxLength={80}
                defaultValue={v.slug}
                spellCheck={false}
                autoComplete="off"
              />
            </Campo>
          )}
        </div>
      </section>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn" disabled={pendente}>
          {pendente ? "Salvando…" : modo === "criar" ? "Criar curso" : "Salvar alterações"}
        </button>
        <Link href="/painel/cursos" className="btn btn--ghost">
          Voltar
        </Link>

        {modo === "editar" && podeExcluir && !confirmandoExclusao && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={pendente}
            style={{ marginLeft: "auto", color: "#cf222e" }}
          >
            Excluir curso
          </button>
        )}
      </div>

      {modo === "editar" && podeExcluir && confirmandoExclusao && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.4rem" }}>
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Excluir este curso?</strong> Só é possível enquanto ele não tiver nenhuma
            matrícula — o histórico de quem estudou aqui é registro da igreja.
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

/**
 * Botões de transição de status de uma matrícula.
 *
 * Fica neste arquivo por ser o mesmo assunto (gestão de um curso) e por ser
 * pequeno demais para justificar um componente próprio. Os botões oferecidos
 * dependem do status atual — mas isso é ORIENTAÇÃO, não controle: a Server
 * Action valida o destino contra uma lista fechada e reconfere as vagas,
 * porque ela aceita qualquer payload de quem a chamar direto.
 */
export function AcoesMatricula({
  matriculaId,
  statusAtual,
}: {
  matriculaId: string;
  statusAtual: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function definir(status: string) {
    setErro(null);
    iniciar(async () => {
      const resultado = await definirStatusMatricula(matriculaId, { status });
      if (resultado.ok) {
        router.refresh();
        return;
      }
      setErro(resultado.mensagem);
    });
  }

  const opcoes: { status: string; rotulo: string }[] = [];
  if (statusAtual !== "CONFIRMADO" && statusAtual !== "CURSANDO" && statusAtual !== "CONCLUIDO") {
    opcoes.push({ status: "CONFIRMADO", rotulo: "Confirmar" });
  }
  if (statusAtual === "CONFIRMADO") opcoes.push({ status: "CURSANDO", rotulo: "Iniciar" });
  if (statusAtual === "CONFIRMADO" || statusAtual === "CURSANDO") {
    opcoes.push({ status: "CONCLUIDO", rotulo: "Concluir" });
  }
  if (statusAtual !== "CANCELADO") opcoes.push({ status: "CANCELADO", rotulo: "Cancelar" });

  return (
    <div>
      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
        {opcoes.map((o) => (
          <button
            key={o.status}
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => definir(o.status)}
            disabled={pendente}
            style={o.status === "CANCELADO" ? { color: "#cf222e" } : undefined}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {erro && (
        <p className="campo__erro" role="alert" style={{ marginTop: ".4rem" }}>
          {erro}
        </p>
      )}
    </div>
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
