"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { atualizarPessoa, criarPessoa, excluirPessoa } from "@/app/painel/pessoas/acoes";

/**
 * Formulário de cadastro de pessoa (criação e edição).
 *
 * A validação daqui é CONVENIÊNCIA. `required`, `maxLength` e `pattern` evitam
 * uma ida ao servidor por um campo em branco — nada mais. Quem quiser mandar
 * lixo não usa este formulário; a validação que vale é a do Zod dentro da
 * Server Action.
 *
 * `observacoesPastorais` só é renderizado quando `podeEditarSensivel` é
 * verdadeiro, mas isso é só a metade visual da proteção: o servidor ignora o
 * campo de quem não tem `pessoas.lerSensivel`, mesmo que ele chegue no payload.
 */

export interface ValoresPessoa {
  nome: string;
  email: string;
  telefone: string;
  dataNascimento: string;
  genero: string;
  estadoCivil: string;
  status: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  dataConversao: string;
  batizado: boolean;
  dataBatismo: string;
  igrejaAnterior: string;
  celulaId: string;
  campusId: string;
  observacoesPastorais: string;
  consentimentoLgpd: boolean;
}

const VAZIO: ValoresPessoa = {
  nome: "",
  email: "",
  telefone: "",
  dataNascimento: "",
  genero: "NAO_INFORMADO",
  estadoCivil: "NAO_INFORMADO",
  status: "VISITANTE",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
  dataConversao: "",
  batizado: false,
  dataBatismo: "",
  igrejaAnterior: "",
  celulaId: "",
  campusId: "",
  observacoesPastorais: "",
  consentimentoLgpd: false,
};

export function FormularioPessoa({
  modo,
  pessoaId,
  inicial,
  celulas,
  campi,
  podeEditarSensivel,
  podeExcluir = false,
}: {
  modo: "criar" | "editar";
  pessoaId?: string;
  inicial?: Partial<ValoresPessoa>;
  celulas: { id: string; nome: string; bairro: string | null }[];
  campi: { id: string; nome: string }[];
  podeEditarSensivel: boolean;
  podeExcluir?: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [duplicadoConfirmado, setDuplicadoConfirmado] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");

  const v: ValoresPessoa = { ...VAZIO, ...inicial };

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setErro(null);
    setAviso(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado =
        modo === "criar"
          ? await criarPessoa({ ...dados, confirmarDuplicado: duplicadoConfirmado })
          : await atualizarPessoa(pessoaId ?? "", dados);

      if (resultado.ok) {
        setDuplicadoConfirmado(false);
        if (modo === "criar" && resultado.pessoaId) {
          router.push(`/painel/pessoas/${resultado.pessoaId}`);
          return;
        }
        setSucesso(resultado.mensagem);
        router.refresh();
        return;
      }

      setCampos(resultado.campos ?? {});
      if (resultado.duplicado) {
        // Não é erro: é um alerta com saída. O operador decide se é a mesma
        // pessoa ou um homônimo com o telefone da família.
        setAviso(resultado.mensagem);
        setDuplicadoConfirmado(true);
      } else {
        setErro(resultado.mensagem);
      }
    });
  }

  function remover() {
    setErro(null);
    iniciar(async () => {
      const resultado = await excluirPessoa(pessoaId ?? "", motivoExclusao);
      if (resultado.ok) {
        router.push("/painel/pessoas");
        router.refresh();
      } else {
        setErro(resultado.mensagem);
        setConfirmandoExclusao(false);
      }
    });
  }

  return (
    <form onSubmit={enviar} noValidate>
      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1.4rem" }}>
          {erro}
        </div>
      )}
      {aviso && (
        <div className="alerta alerta--aviso" role="alert" style={{ marginBottom: "1.4rem" }}>
          <p style={{ marginBottom: ".6rem" }}>{aviso}</p>
          <p style={{ fontSize: ".82rem" }}>
            Se for outra pessoa, envie novamente que o cadastro será criado assim mesmo.
          </p>
        </div>
      )}
      {sucesso && (
        <div className="alerta alerta--sucesso" role="status" style={{ marginBottom: "1.4rem" }}>
          {sucesso}
        </div>
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Identificação</h2>
        <p className="secao-painel__desc">
          Só o nome é obrigatório. É melhor um cadastro com pouca coisa hoje do que nenhum cadastro
          esperando a ficha completa.
        </p>

        <div className="grid cols-2">
          <Campo rotulo="Nome completo" nome="nome" erros={campos.nome} obrigatorio>
            <input
              id="nome"
              name="nome"
              type="text"
              required
              maxLength={160}
              defaultValue={v.nome}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Telefone / WhatsApp" nome="telefone" erros={campos.telefone}>
            <input
              id="telefone"
              name="telefone"
              type="tel"
              maxLength={20}
              defaultValue={v.telefone}
              autoComplete="off"
              inputMode="tel"
            />
          </Campo>

          <Campo rotulo="E-mail" nome="email" erros={campos.email}>
            <input
              id="email"
              name="email"
              type="email"
              maxLength={254}
              defaultValue={v.email}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Data de nascimento" nome="dataNascimento" erros={campos.dataNascimento}>
            <input
              id="dataNascimento"
              name="dataNascimento"
              type="date"
              defaultValue={v.dataNascimento}
            />
          </Campo>

          <Campo rotulo="Gênero" nome="genero" erros={campos.genero}>
            <select id="genero" name="genero" defaultValue={v.genero}>
              <option value="NAO_INFORMADO">Não informado</option>
              <option value="FEMININO">Feminino</option>
              <option value="MASCULINO">Masculino</option>
            </select>
          </Campo>

          <Campo rotulo="Estado civil" nome="estadoCivil" erros={campos.estadoCivil}>
            <select id="estadoCivil" name="estadoCivil" defaultValue={v.estadoCivil}>
              <option value="NAO_INFORMADO">Não informado</option>
              <option value="SOLTEIRO">Solteiro(a)</option>
              <option value="CASADO">Casado(a)</option>
              <option value="UNIAO_ESTAVEL">União estável</option>
              <option value="DIVORCIADO">Divorciado(a)</option>
              <option value="VIUVO">Viúvo(a)</option>
            </select>
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Vínculo com a igreja</h2>

        <div className="grid cols-3">
          <Campo rotulo="Situação" nome="status" erros={campos.status}>
            <select id="status" name="status" defaultValue={v.status}>
              <option value="VISITANTE">Visitante</option>
              <option value="EM_ACOMPANHAMENTO">Em acompanhamento</option>
              <option value="CONGREGANTE">Congregante</option>
              <option value="MEMBRO">Membro</option>
              <option value="INATIVO">Inativo</option>
              <option value="TRANSFERIDO">Transferido</option>
            </select>
          </Campo>

          <Campo rotulo="Célula" nome="celulaId" erros={campos.celulaId}>
            <select id="celulaId" name="celulaId" defaultValue={v.celulaId}>
              <option value="">Sem célula</option>
              {celulas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.bairro ? ` — ${c.bairro}` : ""}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Campus" nome="campusId" erros={campos.campusId}>
            <select id="campusId" name="campusId" defaultValue={v.campusId}>
              <option value="">Não definido</option>
              {campi.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Jornada de fé</h2>
        <p className="secao-painel__desc">
          Preencha o que a pessoa contou. Campo em branco é melhor que campo chutado — esta ficha
          orienta o acompanhamento pastoral.
        </p>

        <div className="grid cols-2">
          <Campo rotulo="Data de conversão" nome="dataConversao" erros={campos.dataConversao}>
            <input
              id="dataConversao"
              name="dataConversao"
              type="date"
              defaultValue={v.dataConversao}
            />
          </Campo>

          <Campo rotulo="Igreja anterior" nome="igrejaAnterior" erros={campos.igrejaAnterior}>
            <input
              id="igrejaAnterior"
              name="igrejaAnterior"
              type="text"
              maxLength={160}
              defaultValue={v.igrejaAnterior}
              autoComplete="off"
            />
          </Campo>

          <div className="campo campo--checkbox">
            <input
              id="batizado"
              name="batizado"
              type="checkbox"
              defaultChecked={v.batizado}
              value="on"
            />
            <label htmlFor="batizado">Já é batizado(a) nas águas</label>
          </div>

          <Campo rotulo="Data do batismo" nome="dataBatismo" erros={campos.dataBatismo}>
            <input id="dataBatismo" name="dataBatismo" type="date" defaultValue={v.dataBatismo} />
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Endereço</h2>

        <div className="grid cols-3">
          <Campo rotulo="CEP" nome="cep" erros={campos.cep}>
            <input
              id="cep"
              name="cep"
              type="text"
              maxLength={9}
              defaultValue={v.cep}
              inputMode="numeric"
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Logradouro" nome="logradouro" erros={campos.logradouro}>
            <input
              id="logradouro"
              name="logradouro"
              type="text"
              maxLength={200}
              defaultValue={v.logradouro}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Número" nome="numero" erros={campos.numero}>
            <input
              id="numero"
              name="numero"
              type="text"
              maxLength={20}
              defaultValue={v.numero}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Complemento" nome="complemento" erros={campos.complemento}>
            <input
              id="complemento"
              name="complemento"
              type="text"
              maxLength={100}
              defaultValue={v.complemento}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Bairro" nome="bairro" erros={campos.bairro}>
            <input
              id="bairro"
              name="bairro"
              type="text"
              maxLength={100}
              defaultValue={v.bairro}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Cidade" nome="cidade" erros={campos.cidade}>
            <input
              id="cidade"
              name="cidade"
              type="text"
              maxLength={100}
              defaultValue={v.cidade}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="UF" nome="uf" erros={campos.uf}>
            <input
              id="uf"
              name="uf"
              type="text"
              maxLength={2}
              defaultValue={v.uf}
              autoComplete="off"
              style={{ textTransform: "uppercase" }}
            />
          </Campo>
        </div>
      </section>

      {podeEditarSensivel && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Observações pastorais</h2>
          <p className="secao-painel__desc">
            Visível apenas para pastores e administradores. Não é o lugar para diagnóstico médico,
            confissão ou qualquer coisa que a pessoa não gostaria de ver impressa: um dia alguém com
            acesso legítimo vai ler isto.
          </p>

          <Campo rotulo="Anotações" nome="observacoesPastorais" erros={campos.observacoesPastorais}>
            <textarea
              id="observacoesPastorais"
              name="observacoesPastorais"
              rows={5}
              maxLength={5000}
              defaultValue={v.observacoesPastorais}
            />
          </Campo>
        </section>
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Consentimento</h2>

        <div className="campo campo--checkbox">
          <input
            id="consentimentoLgpd"
            name="consentimentoLgpd"
            type="checkbox"
            defaultChecked={v.consentimentoLgpd}
            value="on"
          />
          <label htmlFor="consentimentoLgpd">
            A pessoa autorizou o tratamento dos dados e o contato da igreja (LGPD). Marque apenas se
            isso realmente aconteceu — este registro é a prova da igreja.
          </label>
        </div>
        {v.consentimentoLgpd && modo === "editar" && (
          <p className="campo__ajuda" style={{ marginTop: ".8rem" }}>
            O consentimento já registrado não é removido por esta tela. A revogação é um ato do
            titular e tem fluxo próprio.
          </p>
        )}
      </section>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn" disabled={pendente}>
          {pendente ? "Salvando…" : modo === "criar" ? "Criar cadastro" : "Salvar alterações"}
        </button>
        <Link
          href={modo === "editar" && pessoaId ? `/painel/pessoas/${pessoaId}` : "/painel/pessoas"}
          className="btn btn--ghost"
        >
          Cancelar
        </Link>

        {modo === "editar" && podeExcluir && !confirmandoExclusao && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={pendente}
            style={{ marginLeft: "auto", color: "#cf222e" }}
          >
            Excluir cadastro
          </button>
        )}
      </div>

      {modo === "editar" && podeExcluir && confirmandoExclusao && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.4rem" }}>
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Remover este cadastro?</strong> Ele sai das listas e dos relatórios, mas o
            histórico (batismos, matrículas, interações) é preservado para não corromper os registros
            da igreja. A ação fica na auditoria.
          </p>
          <div className="campo" style={{ marginBottom: ".9rem" }}>
            <label className="campo__rotulo" htmlFor="motivoExclusao">
              Motivo (fica na auditoria)
            </label>
            <input
              id="motivoExclusao"
              type="text"
              maxLength={200}
              value={motivoExclusao}
              onChange={(e) => setMotivoExclusao(e.target.value)}
              placeholder="Ex.: cadastro duplicado"
            />
          </div>
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
