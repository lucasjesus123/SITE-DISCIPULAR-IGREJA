"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { criarIgreja } from "@/app/plataforma/acoes";

/**
 * Formulário de criação de igreja.
 *
 * A validação daqui é CONVENIÊNCIA (o `required` e o `maxLength` evitam um
 * ida-e-volta ao servidor por um campo vazio). A validação que vale é a do Zod
 * dentro da Server Action: quem quiser atacar não usa este formulário.
 *
 * O DETALHE QUE MUDA A UX
 * A senha temporária é exibida uma única vez, depois do sucesso, e a tela NÃO
 * navega sozinha. Redirecionar automaticamente destruiria o único momento em
 * que a senha existe visível — e o operador teria que disparar um "esqueci
 * minha senha" para o cliente logo depois de criar a conta dele.
 */

interface EstadoSucesso {
  mensagem: string;
  senhaTemporaria?: string;
  url?: string;
}

export function FormularioNovaIgreja() {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [sucesso, setSucesso] = useState<EstadoSucesso | null>(null);
  const [status, setStatus] = useState<"TRIAL" | "ATIVO">("TRIAL");

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = new FormData(evento.currentTarget);

    setErro(null);
    setCampos({});

    iniciar(async () => {
      const resultado = await criarIgreja(Object.fromEntries(formulario));

      if (resultado.ok) {
        setSucesso({
          mensagem: resultado.mensagem,
          senhaTemporaria: resultado.senhaTemporaria,
          url: resultado.url,
        });
      } else {
        setErro(resultado.mensagem);
        setCampos(resultado.campos ?? {});
      }
    });
  }

  if (sucesso) {
    return (
      <section className="secao-painel">
        <div className="alerta alerta--sucesso" role="status">
          {sucesso.mensagem}
        </div>

        {sucesso.senhaTemporaria && (
          <div className="alerta alerta--aviso" style={{ marginTop: "1rem" }}>
            <p style={{ marginBottom: ".6rem" }}>
              <strong>Senha temporária do administrador</strong>
            </p>
            <p
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "1.05rem",
                wordBreak: "break-all",
                userSelect: "all",
              }}
            >
              {sucesso.senhaTemporaria}
            </p>
            <p style={{ marginTop: ".8rem", fontSize: ".82rem" }}>
              Entregue por um canal em que você confia e peça a troca no primeiro acesso. Esta senha
              não fica guardada em lugar nenhum em texto claro — nem no log, nem na auditoria — e não
              será exibida outra vez.
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: ".6rem", marginTop: "1.4rem", flexWrap: "wrap" }}>
          {sucesso.url && (
            <Link href={sucesso.url} className="btn btn--sm">
              Abrir a igreja
            </Link>
          )}
          <Link href="/plataforma/igrejas" className="btn btn--sm btn--ghost">
            Voltar para a lista
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={enviar} noValidate>
      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1.4rem" }}>
          {erro}
        </div>
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Identificação</h2>
        <p className="secao-painel__desc">
          O endereço é imutável depois de criado — ele vira o subdomínio da igreja e aparece em links
          já compartilhados. Deixe em branco para derivarmos do nome.
        </p>

        <div className="grid cols-2">
          <Campo rotulo="Nome da igreja" nome="nome" erros={campos.nome} obrigatorio>
            <input id="nome" name="nome" type="text" required maxLength={160} autoComplete="off" />
          </Campo>

          <Campo rotulo="Endereço (slug)" nome="slug" erros={campos.slug} ajuda="Ex.: videira-lajeado">
            <input
              id="slug"
              name="slug"
              type="text"
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoComplete="off"
              placeholder="derivado do nome"
            />
          </Campo>

          <Campo rotulo="Razão social" nome="razaoSocial" erros={campos.razaoSocial}>
            <input id="razaoSocial" name="razaoSocial" type="text" maxLength={200} autoComplete="off" />
          </Campo>

          <Campo rotulo="CNPJ" nome="cnpj" erros={campos.cnpj}>
            <input id="cnpj" name="cnpj" type="text" maxLength={18} inputMode="numeric" autoComplete="off" />
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Plano</h2>
        <p className="secao-painel__desc">
          Os limites do plano são aplicados na criação e podem ser ajustados depois, igreja a igreja.
        </p>

        <div className="grid cols-3">
          <Campo rotulo="Plano" nome="plano" erros={campos.plano}>
            <select id="plano" name="plano" defaultValue="ESSENCIAL">
              <option value="ESSENCIAL">Essencial — 5 usuários, 2.000 pessoas</option>
              <option value="CRESCIMENTO">Crescimento — 15 usuários, 10.000 pessoas</option>
              <option value="MULTISEDE">Multissede — 40 usuários, 50.000 pessoas</option>
            </select>
          </Campo>

          <Campo rotulo="Situação inicial" nome="status" erros={campos.status}>
            <select
              id="status"
              name="status"
              value={status}
              onChange={(evento) => setStatus(evento.target.value === "ATIVO" ? "ATIVO" : "TRIAL")}
            >
              <option value="TRIAL">Em avaliação</option>
              <option value="ATIVO">Ativa</option>
            </select>
          </Campo>

          <Campo
            rotulo="Dias de avaliação"
            nome="diasTrial"
            erros={campos.diasTrial}
            ajuda={status === "TRIAL" ? undefined : "Ignorado quando a igreja já nasce ativa."}
          >
            <input
              id="diasTrial"
              name="diasTrial"
              type="number"
              min={1}
              max={180}
              defaultValue={30}
              disabled={status !== "TRIAL"}
            />
          </Campo>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Administrador inicial</h2>
        <p className="secao-painel__desc">
          Recebe o papel ADMIN nesta igreja. Se o e-mail já tiver conta na plataforma (o mesmo pastor
          pode cuidar de duas igrejas), a conta existente é reaproveitada e a senha dela é preservada.
        </p>

        <div className="grid cols-3">
          <Campo rotulo="Nome" nome="adminNome" erros={campos.adminNome} obrigatorio>
            <input id="adminNome" name="adminNome" type="text" required maxLength={160} autoComplete="off" />
          </Campo>

          <Campo rotulo="E-mail" nome="adminEmail" erros={campos.adminEmail} obrigatorio>
            <input id="adminEmail" name="adminEmail" type="email" required maxLength={254} autoComplete="off" />
          </Campo>

          <Campo rotulo="Telefone" nome="adminTelefone" erros={campos.adminTelefone}>
            <input id="adminTelefone" name="adminTelefone" type="tel" maxLength={20} autoComplete="off" />
          </Campo>
        </div>
      </section>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <button type="submit" className="btn" disabled={pendente}>
          {pendente ? "Criando…" : "Criar igreja"}
        </button>
        <Link href="/plataforma/igrejas" className="btn btn--ghost">
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
