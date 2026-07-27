"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { atualizarCelula, criarCelula } from "@/app/painel/celulas/acoes";

/**
 * Formulário de célula (criação e edição).
 *
 * O campo de endereço exato NÃO existe de propósito. Célula acontece na casa
 * de alguém: guardamos bairro, cidade e coordenada aproximada para o mapa
 * "encontre uma célula", e o endereço completo é passado por contato direto.
 * Ver o comentário do modelo `Celula` em prisma/schema.prisma.
 */

export interface ValoresCelula {
  nome: string;
  descricao: string;
  campusId: string;
  diaSemana: string;
  horario: string;
  liderNome: string;
  liderTelefone: string;
  bairro: string;
  cidade: string;
  latitude: string;
  longitude: string;
  capacidade: string;
  ativa: boolean;
}

const VAZIO: ValoresCelula = {
  nome: "",
  descricao: "",
  campusId: "",
  diaSemana: "",
  horario: "",
  liderNome: "",
  liderTelefone: "",
  bairro: "",
  cidade: "",
  latitude: "",
  longitude: "",
  capacidade: "",
  ativa: true,
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

export function FormularioCelula({
  modo,
  celulaId,
  inicial,
  campi,
}: {
  modo: "criar" | "editar";
  celulaId?: string;
  inicial?: Partial<ValoresCelula>;
  campi: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});

  const v: ValoresCelula = { ...VAZIO, ...inicial };

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado =
        modo === "criar"
          ? await criarCelula(dados)
          : await atualizarCelula(celulaId ?? "", dados);

      if (resultado.ok) {
        if (modo === "criar" && resultado.celulaId) {
          router.push(`/painel/celulas/${resultado.celulaId}`);
          return;
        }
        setSucesso(resultado.mensagem);
        router.refresh();
        return;
      }

      setErro(resultado.mensagem);
      setCampos(resultado.campos ?? {});
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
        <h2 className="secao-painel__titulo">A célula</h2>

        <div className="grid cols-2">
          <Campo rotulo="Nome" nome="nome" erros={campos.nome} obrigatorio>
            <input
              id="nome"
              name="nome"
              type="text"
              required
              maxLength={120}
              defaultValue={v.nome}
              autoComplete="off"
              placeholder="Ex.: Célula Centro"
            />
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

          <Campo rotulo="Dia do encontro" nome="diaSemana" erros={campos.diaSemana}>
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

        <div className="campo" style={{ marginTop: "1.2rem" }}>
          <label className="campo__rotulo" htmlFor="descricao">
            Descrição
          </label>
          <textarea
            id="descricao"
            name="descricao"
            rows={3}
            maxLength={2000}
            defaultValue={v.descricao}
            placeholder="Para quem é, como funciona, qual o perfil do grupo."
          />
          {campos.descricao?.map((m) => (
            <span key={m} className="campo__erro">
              {m}
            </span>
          ))}
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Liderança</h2>

        <div className="grid cols-2">
          <Campo rotulo="Nome do líder" nome="liderNome" erros={campos.liderNome}>
            <input
              id="liderNome"
              name="liderNome"
              type="text"
              maxLength={160}
              defaultValue={v.liderNome}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Telefone do líder" nome="liderTelefone" erros={campos.liderTelefone}>
            <input
              id="liderTelefone"
              name="liderTelefone"
              type="tel"
              maxLength={20}
              defaultValue={v.liderTelefone}
              autoComplete="off"
            />
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Onde acontece</h2>
        <p className="secao-painel__desc">
          Bairro e cidade bastam para o site. O endereço completo é da casa de alguém e não fica
          guardado em campo consultável — quem quiser participar recebe por contato direto.
        </p>

        <div className="grid cols-3">
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

          <Campo
            rotulo="Capacidade"
            nome="capacidade"
            erros={campos.capacidade}
            ajuda="Quantas pessoas cabem, para o app sugerir células com vaga."
          >
            <input
              id="capacidade"
              name="capacidade"
              type="number"
              min={1}
              max={500}
              defaultValue={v.capacidade}
            />
          </Campo>

          <Campo
            rotulo="Latitude"
            nome="latitude"
            erros={campos.latitude}
            ajuda="Aproximada, para o mapa. Deixe em branco se não usar."
          >
            <input
              id="latitude"
              name="latitude"
              type="text"
              inputMode="decimal"
              maxLength={20}
              defaultValue={v.latitude}
            />
          </Campo>

          <Campo rotulo="Longitude" nome="longitude" erros={campos.longitude}>
            <input
              id="longitude"
              name="longitude"
              type="text"
              inputMode="decimal"
              maxLength={20}
              defaultValue={v.longitude}
            />
          </Campo>
        </div>

        <div className="campo campo--checkbox" style={{ marginTop: "1.2rem" }}>
          <input id="ativa" name="ativa" type="checkbox" defaultChecked={v.ativa} value="on" />
          <label htmlFor="ativa">
            Célula ativa (aparece no site e recebe novas pessoas)
          </label>
        </div>
      </section>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <button type="submit" className="btn" disabled={pendente}>
          {pendente ? "Salvando…" : modo === "criar" ? "Criar célula" : "Salvar alterações"}
        </button>
        <Link
          href={modo === "editar" && celulaId ? `/painel/celulas/${celulaId}` : "/painel/celulas"}
          className="btn btn--ghost"
        >
          Cancelar
        </Link>
      </div>
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
