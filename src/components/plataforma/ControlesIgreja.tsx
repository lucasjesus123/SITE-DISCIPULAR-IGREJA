"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ajustarLimites,
  alterarPlano,
  alterarStatusIgreja,
  encerrarImpersonacao,
  iniciarImpersonacao,
} from "@/app/plataforma/acoes";

type Tom = "sucesso" | "erro";
type Status = "TRIAL" | "ATIVO" | "SUSPENSO" | "CANCELADO";
type Plano = "ESSENCIAL" | "CRESCIMENTO" | "MULTISEDE";

export interface ControlesIgrejaProps {
  tenantId: string;
  slug: string;
  nome: string;
  status: Status;
  plano: Plano;
  limiteUsuarios: number;
  limitePessoas: number;
  limiteStorageMb: number;
  /** Quantas sessões de suporte deste super admin estão abertas agora. */
  sessoesSuporteAbertas: number;
}

/**
 * Controles administrativos de uma igreja.
 *
 * Cada bloco fala com uma Server Action diferente, e cada uma delas repete o
 * ciclo completo no servidor (autorização, rate limit, Zod, auditoria). Este
 * componente não guarda nem decide nada: ele coleta o que o operador quer e
 * mostra o que o servidor respondeu.
 */
export function ControlesIgreja(props: ControlesIgrejaProps) {
  return (
    <>
      <BlocoSituacao {...props} />
      <BlocoPlano {...props} />
      <BlocoLimites {...props} />
      <BlocoSuporte {...props} />
    </>
  );
}

// -----------------------------------------------------------------------------

function BlocoSituacao({ tenantId, slug, status }: ControlesIgrejaProps) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novoStatus, setNovoStatus] = useState<Status>(status);
  const [motivo, setMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [aviso, setAviso] = useState<{ tom: Tom; texto: string } | null>(null);

  const cancelando = novoStatus === "CANCELADO";

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(null);

    iniciar(async () => {
      const resultado = await alterarStatusIgreja(tenantId, {
        status: novoStatus,
        motivo,
        confirmacao,
      });
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      if (resultado.ok) {
        setConfirmacao("");
        setMotivo("");
        router.refresh();
      }
    });
  }

  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">Situação</h2>
      <p className="secao-painel__desc">
        Suspender tira o site do ar e bloqueia o painel, mas não apaga nada — é cobrança, não
        punição. Cancelar começa o descarte: o endereço deixa de resolver.
      </p>

      <form onSubmit={salvar} style={{ display: "grid", gap: "1rem" }}>
        <div className="grid cols-2">
          <div className="campo">
            <label className="campo__rotulo" htmlFor="situacao">
              Nova situação
            </label>
            <select
              id="situacao"
              value={novoStatus}
              onChange={(evento) => setNovoStatus(evento.target.value as Status)}
            >
              <option value="TRIAL">Em avaliação</option>
              <option value="ATIVO">Ativa</option>
              <option value="SUSPENSO">Suspensa</option>
              <option value="CANCELADO">Cancelada</option>
            </select>
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor="motivo">
              Motivo (fica na auditoria)
            </label>
            <input
              id="motivo"
              type="text"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              maxLength={300}
              placeholder="Ex.: inadimplência há 45 dias"
            />
          </div>
        </div>

        {(novoStatus === "SUSPENSO" || cancelando) && (
          <div className="alerta alerta--aviso">
            As sessões abertas desta igreja serão revogadas na hora. Quem estiver no painel agora cai
            no próximo clique — do contrário, uma igreja &ldquo;suspensa&rdquo; continuaria operando
            por horas.
          </div>
        )}

        {cancelando && (
          <div className="campo">
            <label className="campo__rotulo" htmlFor="confirmacao">
              Digite <code>{slug}</code> para confirmar o cancelamento
              <span className="obrigatorio">*</span>
            </label>
            <input
              id="confirmacao"
              type="text"
              value={confirmacao}
              onChange={(evento) => setConfirmacao(evento.target.value)}
              maxLength={63}
              autoComplete="off"
            />
            <span className="campo__ajuda">
              Confirmação por digitação porque todas as linhas da lista parecem iguais, e o clique
              errado aqui tira uma igreja do ar.
            </span>
          </div>
        )}

        {aviso && (
          <div className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`} role="status">
            {aviso.texto}
          </div>
        )}

        <div>
          <button
            type="submit"
            className="btn btn--sm"
            disabled={pendente || novoStatus === status || (cancelando && confirmacao !== slug)}
          >
            {pendente ? "Salvando…" : "Alterar situação"}
          </button>
        </div>
      </form>
    </section>
  );
}

// -----------------------------------------------------------------------------

function BlocoPlano({ tenantId, plano }: ControlesIgrejaProps) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novoPlano, setNovoPlano] = useState<Plano>(plano);
  const [aplicarLimites, setAplicarLimites] = useState(true);
  const [aviso, setAviso] = useState<{ tom: Tom; texto: string } | null>(null);

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(null);

    iniciar(async () => {
      const resultado = await alterarPlano(tenantId, {
        plano: novoPlano,
        aplicarLimitesDoPlano: aplicarLimites,
      });
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">Plano</h2>
      <p className="secao-painel__desc">
        Trocar o plano não mexe em nenhum dado da igreja — só nos tetos de uso.
      </p>

      <form onSubmit={salvar} style={{ display: "grid", gap: "1rem" }}>
        <div className="campo" style={{ maxWidth: "420px" }}>
          <label className="campo__rotulo" htmlFor="plano">
            Plano
          </label>
          <select
            id="plano"
            value={novoPlano}
            onChange={(evento) => setNovoPlano(evento.target.value as Plano)}
          >
            <option value="ESSENCIAL">Essencial</option>
            <option value="CRESCIMENTO">Crescimento</option>
            <option value="MULTISEDE">Multissede</option>
          </select>
        </div>

        <div className="campo campo--checkbox">
          <input
            id="aplicarLimites"
            type="checkbox"
            checked={aplicarLimites}
            onChange={(evento) => setAplicarLimites(evento.target.checked)}
          />
          <label htmlFor="aplicarLimites">
            Realinhar os limites com os valores padrão do plano. Desmarque para preservar ajustes
            feitos caso a caso.
          </label>
        </div>

        {aviso && (
          <div className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`} role="status">
            {aviso.texto}
          </div>
        )}

        <div>
          <button type="submit" className="btn btn--sm" disabled={pendente || novoPlano === plano}>
            {pendente ? "Salvando…" : "Alterar plano"}
          </button>
        </div>
      </form>
    </section>
  );
}

// -----------------------------------------------------------------------------

function BlocoLimites({
  tenantId,
  limiteUsuarios,
  limitePessoas,
  limiteStorageMb,
}: ControlesIgrejaProps) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [usuarios, setUsuarios] = useState(String(limiteUsuarios));
  const [pessoas, setPessoas] = useState(String(limitePessoas));
  const [storage, setStorage] = useState(String(limiteStorageMb));
  const [aviso, setAviso] = useState<{ tom: Tom; texto: string } | null>(null);

  function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setAviso(null);

    iniciar(async () => {
      const resultado = await ajustarLimites(tenantId, {
        limiteUsuarios: usuarios,
        limitePessoas: pessoas,
        limiteStorageMb: storage,
      });
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">Limites</h2>
      <p className="secao-painel__desc">
        A plataforma roda numa infraestrutura compartilhada: estes tetos são o que impede uma igreja
        de consumir o disco e o banco das outras.
      </p>

      <form onSubmit={salvar} style={{ display: "grid", gap: "1rem" }}>
        <div className="grid cols-3">
          <div className="campo">
            <label className="campo__rotulo" htmlFor="limiteUsuarios">
              Usuários
            </label>
            <input
              id="limiteUsuarios"
              type="number"
              min={1}
              max={500}
              value={usuarios}
              onChange={(evento) => setUsuarios(evento.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="limitePessoas">
              Pessoas
            </label>
            <input
              id="limitePessoas"
              type="number"
              min={1}
              max={500000}
              value={pessoas}
              onChange={(evento) => setPessoas(evento.target.value)}
            />
          </div>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="limiteStorageMb">
              Armazenamento (MB)
            </label>
            <input
              id="limiteStorageMb"
              type="number"
              min={64}
              max={102400}
              value={storage}
              onChange={(evento) => setStorage(evento.target.value)}
            />
          </div>
        </div>

        {aviso && (
          <div className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`} role="status">
            {aviso.texto}
          </div>
        )}

        <div>
          <button type="submit" className="btn btn--sm" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar limites"}
          </button>
        </div>
      </form>
    </section>
  );
}

// -----------------------------------------------------------------------------

/**
 * Sessão de suporte ("entrar como").
 *
 * A tela é deliberadamente desconfortável: texto longo, botão fantasma, aviso
 * do que vai acontecer. Não é excesso de zelo — é a única funcionalidade do
 * sistema em que o fornecedor abre os dados pessoais do cliente, incluindo
 * pedidos de oração sobre saúde e família. Fricção aqui é recurso de projeto.
 */
function BlocoSuporte({ tenantId, nome, status, sessoesSuporteAbertas }: ControlesIgrejaProps) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<{ tom: Tom; texto: string } | null>(null);
  const [destino, setDestino] = useState<string | null>(null);

  const bloqueada = status === "SUSPENSO" || status === "CANCELADO";

  function entrar() {
    setAviso(null);
    iniciar(async () => {
      const resultado = await iniciarImpersonacao(tenantId);
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      setDestino(resultado.ok ? (resultado.url ?? null) : null);
      setConfirmando(false);
      if (resultado.ok) router.refresh();
    });
  }

  function encerrar() {
    setAviso(null);
    iniciar(async () => {
      const resultado = await encerrarImpersonacao();
      setAviso({ tom: resultado.ok ? "sucesso" : "erro", texto: resultado.mensagem });
      setDestino(null);
      if (resultado.ok) router.refresh();
    });
  }

  return (
    <section className="secao-painel" style={{ borderColor: "rgb(207 34 46 / .35)" }}>
      <h2 className="secao-painel__titulo">Sessão de suporte</h2>
      <p className="secao-painel__desc">
        Abre o painel de <strong>{nome}</strong> com os seus olhos, não com os seus poderes de
        plataforma. Enquanto durar, uma faixa vermelha fica visível em todas as telas com o seu
        e-mail, e cada ação é gravada na auditoria da igreja marcada como feita por você.
      </p>

      {bloqueada && (
        <div className="alerta alerta--aviso" style={{ marginBottom: "1rem" }}>
          O painel desta igreja está bloqueado pela situação atual. Reative-a antes de entrar.
        </div>
      )}

      {sessoesSuporteAbertas > 0 && (
        <div className="alerta alerta--erro" style={{ marginBottom: "1rem" }}>
          Você tem {sessoesSuporteAbertas}{" "}
          {sessoesSuporteAbertas === 1 ? "sessão de suporte aberta" : "sessões de suporte abertas"}.
          Encerre quando terminar — sessão de suporte esquecida é acesso permanente com outro nome.
        </div>
      )}

      {aviso && (
        <div className={`alerta alerta--${aviso.tom === "sucesso" ? "sucesso" : "erro"}`} role="status" style={{ marginBottom: "1rem" }}>
          {aviso.texto}
        </div>
      )}

      {destino && (
        <p style={{ marginBottom: "1rem", fontSize: ".88rem" }}>
          Abra o painel da igreja em{" "}
          <a className="link" href={destino} rel="noreferrer">
            {destino}
          </a>
          .
        </p>
      )}

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        {!confirmando ? (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmando(true)}
            disabled={pendente || bloqueada}
          >
            Entrar como esta igreja
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--sm"
              onClick={entrar}
              disabled={pendente}
              style={{ background: "#cf222e", borderColor: "#cf222e" }}
            >
              {pendente ? "Abrindo…" : "Confirmo: abrir sessão de suporte"}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setConfirmando(false)}
              disabled={pendente}
            >
              Cancelar
            </button>
          </>
        )}

        {sessoesSuporteAbertas > 0 && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={encerrar} disabled={pendente}>
            Encerrar sessões de suporte
          </button>
        )}
      </div>
    </section>
  );
}
