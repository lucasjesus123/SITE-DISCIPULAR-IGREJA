"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarDadosDaIgreja, salvarModulos } from "@/app/painel/configuracoes/acoes";

/**
 * Dados da igreja e módulos ativos.
 *
 * São dois formulários independentes de propósito. Trocar o CNPJ e desligar um
 * módulo do site são decisões de peso diferente, com consequências diferentes:
 * juntá-los num único "Salvar" faria alguém publicar uma mudança que não
 * pretendia só porque o botão era o mesmo.
 *
 * A máscara de CNPJ aqui é conforto visual. Quem valida os dígitos
 * verificadores é o servidor — a formatação no navegador não é, e nunca foi,
 * controle de nada.
 */

/** Espelha a allowlist de `FUSOS` em acoes.ts. Lá é o controle; aqui, o rótulo. */
const FUSOS: { valor: string; rotulo: string }[] = [
  { valor: "America/Sao_Paulo", rotulo: "Brasília (São Paulo, Sul, Sudeste, Centro-Oeste)" },
  { valor: "America/Bahia", rotulo: "Bahia" },
  { valor: "America/Fortaleza", rotulo: "Fortaleza (CE, PI, RN, PB)" },
  { valor: "America/Recife", rotulo: "Recife" },
  { valor: "America/Maceio", rotulo: "Maceió (AL, SE)" },
  { valor: "America/Belem", rotulo: "Belém (PA, AP)" },
  { valor: "America/Araguaina", rotulo: "Araguaína (TO)" },
  { valor: "America/Campo_Grande", rotulo: "Campo Grande (MS)" },
  { valor: "America/Cuiaba", rotulo: "Cuiabá (MT)" },
  { valor: "America/Manaus", rotulo: "Manaus (AM)" },
  { valor: "America/Porto_Velho", rotulo: "Porto Velho (RO)" },
  { valor: "America/Boa_Vista", rotulo: "Boa Vista (RR)" },
  { valor: "America/Rio_Branco", rotulo: "Rio Branco (AC)" },
  { valor: "America/Eirunepe", rotulo: "Eirunepé (AM oeste)" },
  { valor: "America/Noronha", rotulo: "Fernando de Noronha" },
];

export interface ValoresConfiguracoes {
  nome: string;
  razaoSocial: string;
  cnpj: string;
  fusoHorario: string;
}

export interface ModuloUI {
  chave: string;
  rotulo: string;
  descricao: string;
  ligado: boolean;
}

export function FormularioConfiguracoes({
  inicial,
  modulos,
}: {
  inicial: ValoresConfiguracoes;
  modulos: ModuloUI[];
}) {
  return (
    <>
      <BlocoDados inicial={inicial} />
      <BlocoModulos modulos={modulos} />
    </>
  );
}

// -----------------------------------------------------------------------------

function BlocoDados({ inicial }: { inicial: ValoresConfiguracoes }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [cnpj, setCnpj] = useState(formatarCnpj(inicial.cnpj));
  const [aviso, setAviso] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setAviso(null);
    setCampos({});

    iniciar(async () => {
      const resultado = await salvarDadosDaIgreja(dados);
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      setCampos(resultado.campos ?? {});
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate>
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Dados da igreja</h2>
        <p className="secao-painel__desc">
          O nome aparece no painel e nos e-mails do sistema. Razão social e CNPJ são usados em
          recibos e documentos — preencha só se a igreja for pessoa jurídica registrada.
        </p>

        {aviso && (
          <div
            className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
            style={{ marginBottom: "1.2rem" }}
          >
            {aviso.texto}
          </div>
        )}

        <div className="grid cols-2">
          <Campo rotulo="Nome da igreja" nome="nome" erros={campos.nome} obrigatorio>
            <input
              id="nome"
              name="nome"
              type="text"
              required
              maxLength={160}
              defaultValue={inicial.nome}
              autoComplete="organization"
            />
          </Campo>

          <Campo rotulo="Razão social" nome="razaoSocial" erros={campos.razaoSocial}>
            <input
              id="razaoSocial"
              name="razaoSocial"
              type="text"
              maxLength={200}
              defaultValue={inicial.razaoSocial}
              autoComplete="off"
              placeholder="Como está no cartão CNPJ"
            />
          </Campo>

          <Campo
            rotulo="CNPJ"
            nome="cnpj"
            erros={campos.cnpj}
            ajuda="Os dígitos verificadores são conferidos ao salvar."
          >
            <input
              id="cnpj"
              name="cnpj"
              type="text"
              inputMode="numeric"
              maxLength={18}
              value={cnpj}
              onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
              autoComplete="off"
              placeholder="00.000.000/0000-00"
            />
          </Campo>

          <Campo
            rotulo="Fuso horário"
            nome="fusoHorario"
            erros={campos.fusoHorario}
            obrigatorio
            ajuda="Usado nos horários da agenda e nas janelas de transmissão ao vivo."
          >
            <select id="fusoHorario" name="fusoHorario" required defaultValue={inicial.fusoHorario}>
              {FUSOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <div style={{ marginTop: "1.4rem" }}>
          <button type="submit" className="btn" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar dados"}
          </button>
        </div>
      </section>
    </form>
  );
}

// -----------------------------------------------------------------------------

function BlocoModulos({ modulos }: { modulos: ModuloUI[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tom: "sucesso" | "erro"; texto: string } | null>(null);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setAviso(null);
    iniciar(async () => {
      const resultado = await salvarModulos(dados);
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} noValidate>
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Módulos</h2>
        <p className="secao-painel__desc">
          Desligar um módulo o remove do site e do aplicativo. Os dados já cadastrados continuam
          guardados e voltam a aparecer se você religar — desligar é esconder, nunca apagar.
        </p>

        {aviso && (
          <div
            className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`}
            role={aviso.tom === "erro" ? "alert" : "status"}
            style={{ marginBottom: "1.2rem" }}
          >
            {aviso.texto}
          </div>
        )}

        <div className="grid cols-2">
          {modulos.map((m) => (
            <div className="campo campo--checkbox" key={m.chave}>
              <input
                id={`modulo-${m.chave}`}
                name={m.chave}
                type="checkbox"
                value="on"
                defaultChecked={m.ligado}
              />
              <label htmlFor={`modulo-${m.chave}`}>
                <strong>{m.rotulo}</strong>
                <span className="campo__ajuda" style={{ display: "block" }}>
                  {m.descricao}
                </span>
              </label>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "1.4rem" }}>
          <button type="submit" className="btn" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar módulos"}
          </button>
        </div>
      </section>
    </form>
  );
}

// -----------------------------------------------------------------------------

/** Máscara 00.000.000/0000-00. Puramente visual — o servidor descarta a
 *  formatação e valida os 14 dígitos. */
function formatarCnpj(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
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
