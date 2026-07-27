"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agendarBatismo,
  marcarRealizado,
  mudarStatusBatismo,
  recusarBatismo,
  registrarAutorizacaoResponsavel,
} from "@/app/painel/batismos/acoes";

/**
 * Painel de decisões de uma solicitação de batismo.
 *
 * O bloqueio de menor sem autorização aparece aqui como botão desabilitado e
 * mensagem explícita. Isso é USABILIDADE — o operador entende por que não
 * consegue seguir. A garantia de verdade está na Server Action, que recusa a
 * aprovação mesmo se alguém chamar direto, sem passar por esta tela.
 */

type Painel = "nenhum" | "agendar" | "realizar" | "recusar" | "autorizar";

export function AcoesBatismo({
  batismoId,
  status,
  menor,
  autorizado,
  campi,
  dataAtual,
  horaAtual,
  turmaAtual,
  campusAtualId,
  responsavelNomeAtual,
  responsavelTelefoneAtual,
}: {
  batismoId: string;
  status: string;
  menor: boolean;
  autorizado: boolean;
  campi: { id: string; nome: string }[];
  dataAtual: string;
  horaAtual: string;
  turmaAtual: string;
  campusAtualId: string;
  responsavelNomeAtual: string;
  responsavelTelefoneAtual: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [painel, setPainel] = useState<Painel>("nenhum");
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Formulários
  const [data, setData] = useState(dataAtual);
  const [hora, setHora] = useState(horaAtual);
  const [campusId, setCampusId] = useState(campusAtualId);
  const [turma, setTurma] = useState(turmaAtual);
  const [motivo, setMotivo] = useState("");
  const [respNome, setRespNome] = useState(responsavelNomeAtual);
  const [respTelefone, setRespTelefone] = useState(responsavelTelefoneAtual);
  const [respConfirmado, setRespConfirmado] = useState(false);

  const travadoPorMenor = menor && !autorizado;
  const terminal = status === "REALIZADO";

  function executar(acao: () => Promise<{ ok: boolean; mensagem: string }>) {
    setErro(null);
    setSucesso(null);
    iniciar(async () => {
      const resultado = await acao();
      if (resultado.ok) {
        setPainel("nenhum");
        setSucesso(resultado.mensagem);
        router.refresh();
      } else {
        setErro(resultado.mensagem);
      }
    });
  }

  return (
    <section className="secao-painel" style={{ marginBottom: 0 }}>
      <h2 className="secao-painel__titulo">Decisões</h2>

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

      {travadoPorMenor && (
        <div className="alerta alerta--aviso" role="note" style={{ marginBottom: "1.2rem" }}>
          <strong>Menor de idade sem autorização do responsável.</strong> Aprovar, agendar ou
          registrar o batismo está bloqueado até a autorização ser registrada.
        </div>
      )}

      {terminal && (
        <div className="alerta alerta--sucesso" role="note" style={{ marginBottom: "1.2rem" }}>
          Batismo realizado. Este registro não muda mais de situação.
        </div>
      )}

      {!terminal && painel === "nenhum" && (
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          {travadoPorMenor && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => setPainel("autorizar")}
              disabled={pendente}
            >
              Registrar autorização do responsável
            </button>
          )}

          {(status === "SOLICITADO" || status === "APROVADO") && (
            <button
              type="button"
              className="btn btn--sm btn--outline-gold"
              onClick={() => executar(() => mudarStatusBatismo(batismoId, { status: "EM_PREPARO" }))}
              disabled={pendente}
            >
              Colocar em preparo
            </button>
          )}

          {(status === "SOLICITADO" || status === "EM_PREPARO") && (
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => executar(() => mudarStatusBatismo(batismoId, { status: "APROVADO" }))}
              disabled={pendente || travadoPorMenor}
              title={travadoPorMenor ? "Registre a autorização do responsável antes." : undefined}
            >
              Aprovar
            </button>
          )}

          {status !== "AGENDADO" && status !== "RECUSADO" && status !== "CANCELADO" && (
            <button
              type="button"
              className="btn btn--sm btn--outline-gold"
              onClick={() => setPainel("agendar")}
              disabled={pendente || travadoPorMenor}
              title={travadoPorMenor ? "Registre a autorização do responsável antes." : undefined}
            >
              Agendar data
            </button>
          )}

          {status === "AGENDADO" && (
            <>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => setPainel("realizar")}
                disabled={pendente || travadoPorMenor}
              >
                Marcar como realizado
              </button>
              <button
                type="button"
                className="btn btn--sm btn--outline-gold"
                onClick={() => setPainel("agendar")}
                disabled={pendente}
              >
                Remarcar
              </button>
            </>
          )}

          {status === "APROVADO" && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => setPainel("realizar")}
              disabled={pendente || travadoPorMenor}
            >
              Já aconteceu
            </button>
          )}

          {(status === "RECUSADO" || status === "CANCELADO") && (
            <button
              type="button"
              className="btn btn--sm btn--outline-gold"
              onClick={() => executar(() => mudarStatusBatismo(batismoId, { status: "SOLICITADO" }))}
              disabled={pendente}
            >
              Reabrir solicitação
            </button>
          )}

          {status !== "RECUSADO" && status !== "CANCELADO" && (
            <>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => executar(() => mudarStatusBatismo(batismoId, { status: "CANCELADO" }))}
                disabled={pendente}
                style={{ marginLeft: "auto" }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setPainel("recusar")}
                disabled={pendente}
                style={{ color: "#cf222e" }}
              >
                Recusar
              </button>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------- AUTORIZAÇÃO */}
      {painel === "autorizar" && (
        <div style={{ marginTop: "1.2rem" }}>
          <p className="secao-painel__desc">
            Registre quem autorizou e confirme que a autorização foi recebida. Seu nome fica na
            auditoria como quem afirmou isso.
          </p>

          <div className="grid cols-2">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="respNome">
                Nome do responsável
              </label>
              <input
                id="respNome"
                type="text"
                maxLength={160}
                value={respNome}
                onChange={(e) => setRespNome(e.target.value)}
              />
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="respTelefone">
                Telefone do responsável
              </label>
              <input
                id="respTelefone"
                type="tel"
                maxLength={20}
                value={respTelefone}
                onChange={(e) => setRespTelefone(e.target.value)}
              />
            </div>
          </div>

          <div className="campo campo--checkbox" style={{ marginTop: "1rem" }}>
            <input
              id="respConfirmado"
              type="checkbox"
              checked={respConfirmado}
              onChange={(e) => setRespConfirmado(e.target.checked)}
            />
            <label htmlFor="respConfirmado">
              Confirmo que a autorização do responsável foi recebida pela igreja.
            </label>
          </div>

          <BotoesPainel
            pendente={pendente}
            rotulo="Registrar autorização"
            desabilitado={!respConfirmado || respNome.trim().length < 3}
            onCancelar={() => setPainel("nenhum")}
            onConfirmar={() =>
              executar(() =>
                registrarAutorizacaoResponsavel(batismoId, {
                  responsavelNome: respNome,
                  responsavelTelefone: respTelefone,
                  autorizacaoRecebida: respConfirmado,
                }),
              )
            }
          />
        </div>
      )}

      {/* ---------------------------------------------------------- AGENDAR */}
      {painel === "agendar" && (
        <div style={{ marginTop: "1.2rem" }}>
          <div className="grid cols-2">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="dataBatismo">
                Data
              </label>
              <input
                id="dataBatismo"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="horaBatismo">
                Horário
              </label>
              <input
                id="horaBatismo"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="campusBatismo">
                Campus
              </label>
              <select
                id="campusBatismo"
                value={campusId}
                onChange={(e) => setCampusId(e.target.value)}
              >
                <option value="">Não definido</option>
                {campi.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="turmaBatismo">
                Turma preparatória
              </label>
              <input
                id="turmaBatismo"
                type="text"
                maxLength={120}
                value={turma}
                onChange={(e) => setTurma(e.target.value)}
                placeholder="Ex.: Turma de março"
              />
            </div>
          </div>

          <BotoesPainel
            pendente={pendente}
            rotulo="Confirmar agendamento"
            desabilitado={!data}
            onCancelar={() => setPainel("nenhum")}
            onConfirmar={() =>
              executar(() =>
                agendarBatismo(batismoId, {
                  data,
                  horario: hora,
                  campusId,
                  turmaPreparatoria: turma,
                }),
              )
            }
          />
        </div>
      )}

      {/* --------------------------------------------------------- REALIZADO */}
      {painel === "realizar" && (
        <div style={{ marginTop: "1.2rem" }}>
          <p className="secao-painel__desc">
            Ao confirmar, a ficha da pessoa passa a registrar que ela é batizada, com esta data. A
            situação não volta atrás depois.
          </p>

          <div className="grid cols-2">
            <div className="campo">
              <label className="campo__rotulo" htmlFor="dataRealizado">
                Data em que aconteceu
              </label>
              <input
                id="dataRealizado"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label className="campo__rotulo" htmlFor="horaRealizado">
                Horário
              </label>
              <input
                id="horaRealizado"
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
              />
            </div>
          </div>

          <BotoesPainel
            pendente={pendente}
            rotulo="Confirmar batismo realizado"
            desabilitado={!data}
            onCancelar={() => setPainel("nenhum")}
            onConfirmar={() => executar(() => marcarRealizado(batismoId, { data, horario: hora }))}
          />
        </div>
      )}

      {/* ----------------------------------------------------------- RECUSAR */}
      {painel === "recusar" && (
        <div style={{ marginTop: "1.2rem" }}>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="motivoRecusa">
              Motivo da recusa
            </label>
            <textarea
              id="motivoRecusa"
              rows={3}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique a decisão para quem for retomar este caso depois."
            />
          </div>

          <BotoesPainel
            pendente={pendente}
            rotulo="Recusar solicitação"
            desabilitado={motivo.trim().length < 5}
            onCancelar={() => setPainel("nenhum")}
            onConfirmar={() => executar(() => recusarBatismo(batismoId, { motivoRecusa: motivo }))}
          />
        </div>
      )}
    </section>
  );
}

function BotoesPainel({
  pendente,
  rotulo,
  desabilitado,
  onConfirmar,
  onCancelar,
}: {
  pendente: boolean;
  rotulo: string;
  desabilitado: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem", flexWrap: "wrap" }}>
      <button
        type="button"
        className="btn btn--sm"
        onClick={onConfirmar}
        disabled={pendente || desabilitado}
      >
        {pendente ? "Salvando…" : rotulo}
      </button>
      <button type="button" className="btn btn--sm btn--ghost" onClick={onCancelar} disabled={pendente}>
        Voltar
      </button>
    </div>
  );
}
