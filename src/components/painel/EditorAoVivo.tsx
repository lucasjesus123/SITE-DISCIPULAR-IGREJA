"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alternarAoVivo, salvarConfigLive } from "@/app/painel/site/acoes";

interface Janela {
  diaSemana: number;
  inicio: string;
  fim: string;
}

interface DadosLive {
  modo: "AUTO" | "MANUAL" | "AGENDA";
  youtubeChannelId: string;
  youtubeVideoIdManual: string;
  forcarAoVivo: boolean;
  janelas: Janela[];
  fusoHorario: string;
  mensagemAoVivo: string;
  exibirNoSite: boolean;
  exibirNoApp: boolean;
}

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function EditorAoVivo({
  inicial,
  aoVivoAgora,
  autoDisponivel,
}: {
  inicial: DadosLive;
  aoVivoAgora: boolean;
  autoDisponivel: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [dados, setDados] = useState<DadosLive>(inicial);
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string[]>>({});

  function salvar() {
    setFeedback(null);
    setErros({});
    iniciar(async () => {
      const r = await salvarConfigLive(dados);
      setFeedback({ tipo: r.ok ? "ok" : "erro", texto: r.mensagem });
      if (r.campos) setErros(r.campos);
      if (r.ok) router.refresh();
    });
  }

  function alternar(ligar: boolean) {
    iniciar(async () => {
      const r = await alternarAoVivo(ligar);
      setFeedback({ tipo: r.ok ? "ok" : "erro", texto: r.mensagem });
      if (r.ok) {
        setDados((d) => ({ ...d, forcarAoVivo: ligar }));
        router.refresh();
      }
    });
  }

  function adicionarJanela() {
    setDados((d) => ({
      ...d,
      janelas: [...d.janelas, { diaSemana: 0, inicio: "18:00", fim: "21:00" }],
    }));
  }

  function atualizarJanela(indice: number, patch: Partial<Janela>) {
    setDados((d) => ({
      ...d,
      janelas: d.janelas.map((j, i) => (i === indice ? { ...j, ...patch } : j)),
    }));
  }

  function removerJanela(indice: number) {
    setDados((d) => ({ ...d, janelas: d.janelas.filter((_, i) => i !== indice) }));
  }

  return (
    <>
      {feedback && (
        <div
          className={`alerta alerta--${feedback.tipo === "ok" ? "sucesso" : "erro"}`}
          role="alert"
          style={{ marginBottom: "1.5rem" }}
        >
          {feedback.texto}
        </div>
      )}

      {/* ------------------------------------------------- BOTÃO DE EMERGÊNCIA */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Controle rápido</h2>
        <p className="secao-painel__desc">
          Use durante o culto se a detecção automática falhar. Vale em qualquer modo.
        </p>
        <div style={{ display: "flex", gap: ".8rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => alternar(true)}
            disabled={pendente || dados.forcarAoVivo}
          >
            Estamos ao vivo
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => alternar(false)}
            disabled={pendente || !dados.forcarAoVivo}
          >
            Encerrar transmissão
          </button>
          {aoVivoAgora && (
            <span className="etiqueta etiqueta--urgente" style={{ alignSelf: "center" }}>
              <span className="ao-vivo__ponto" aria-hidden="true" style={{ background: "#cf222e" }} />
              No ar agora
            </span>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------- MODO */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Como detectar a transmissão</h2>
        <p className="secao-painel__desc">Escolha o modo que combina com a rotina da sua igreja.</p>

        <div style={{ display: "grid", gap: ".8rem" }}>
          <ModoOpcao
            valor="AUTO"
            atual={dados.modo}
            desabilitado={!autoDisponivel}
            aoMudar={(v) => setDados((d) => ({ ...d, modo: v }))}
            titulo="Automático"
            desc="Consultamos o YouTube e acendemos a luz sozinhos quando a live começa."
          />
          <ModoOpcao
            valor="AGENDA"
            atual={dados.modo}
            desabilitado={!autoDisponivel}
            aoMudar={(v) => setDados((d) => ({ ...d, modo: v }))}
            titulo="Automático dentro dos horários de culto"
            desc="Igual ao automático, mas só verifica nas janelas configuradas abaixo. Evita falso alarme com vídeos de ensaio."
          />
          <ModoOpcao
            valor="MANUAL"
            atual={dados.modo}
            aoMudar={(v) => setDados((d) => ({ ...d, modo: v }))}
            titulo="Manual"
            desc="Você liga e desliga pelo botão acima. Funciona mesmo sem YouTube."
          />
        </div>
      </section>

      {/* --------------------------------------------------------- YOUTUBE */}
      {dados.modo !== "MANUAL" && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Canal do YouTube</h2>
          <p className="secao-painel__desc">
            Precisamos do ID do canal (não do @nome). Ele começa com <code>UC</code> e tem 24
            caracteres. Você encontra em Configurações do canal → Configurações avançadas.
          </p>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="canal">
              ID do canal
            </label>
            <input
              id="canal"
              type="text"
              value={dados.youtubeChannelId}
              onChange={(e) => setDados((d) => ({ ...d, youtubeChannelId: e.target.value.trim() }))}
              placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
              maxLength={40}
              spellCheck={false}
              aria-invalid={erros.youtubeChannelId ? true : undefined}
            />
            {erros.youtubeChannelId?.[0] && (
              <p className="campo__erro" role="alert">
                {erros.youtubeChannelId[0]}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Vídeo para o modo manual</h2>
        <p className="secao-painel__desc">
          Cole o link da transmissão. Guardamos apenas o identificador do vídeo.
        </p>
        <div className="campo">
          <label className="campo__rotulo" htmlFor="videoManual">
            Link ou ID do vídeo
          </label>
          <input
            id="videoManual"
            type="text"
            value={dados.youtubeVideoIdManual}
            onChange={(e) => setDados((d) => ({ ...d, youtubeVideoIdManual: e.target.value.trim() }))}
            placeholder="https://youtube.com/live/..."
            maxLength={200}
            spellCheck={false}
          />
          {erros.youtubeVideoIdManual?.[0] && (
            <p className="campo__erro" role="alert">
              {erros.youtubeVideoIdManual[0]}
            </p>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- JANELAS */}
      {dados.modo === "AGENDA" && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Horários de culto</h2>
          <p className="secao-painel__desc">
            Fora destas janelas nem consultamos o YouTube. Isso economiza a cota da integração e
            evita acender a luz por engano.
          </p>

          <div style={{ display: "grid", gap: ".8rem" }}>
            {dados.janelas.map((janela, i) => (
              <div key={i} style={{ display: "flex", gap: ".6rem", alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={janela.diaSemana}
                  onChange={(e) => atualizarJanela(i, { diaSemana: Number(e.target.value) })}
                  aria-label="Dia da semana"
                  style={{ minWidth: 130 }}
                >
                  {DIAS.map((d, idx) => (
                    <option key={idx} value={idx}>
                      {d}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={janela.inicio}
                  onChange={(e) => atualizarJanela(i, { inicio: e.target.value })}
                  aria-label="Início"
                />
                <span className="dim">até</span>
                <input
                  type="time"
                  value={janela.fim}
                  onChange={(e) => atualizarJanela(i, { fim: e.target.value })}
                  aria-label="Término"
                />
                <button
                  type="button"
                  onClick={() => removerJanela(i)}
                  className="btn btn--sm btn--ghost"
                  aria-label={`Remover janela de ${DIAS[janela.diaSemana]}`}
                >
                  Remover
                </button>
              </div>
            ))}

            {erros.janelas?.[0] && (
              <p className="campo__erro" role="alert">
                {erros.janelas[0]}
              </p>
            )}

            <button type="button" className="btn btn--sm btn--outline-gold" onClick={adicionarJanela}>
              + Adicionar horário
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- APRESENTAÇÃO */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Como aparece</h2>
        <div className="stack" style={{ "--flow": "1.1rem" } as React.CSSProperties}>
          <div className="campo">
            <label className="campo__rotulo" htmlFor="mensagem">
              Texto da faixa
            </label>
            <input
              id="mensagem"
              type="text"
              value={dados.mensagemAoVivo}
              onChange={(e) => setDados((d) => ({ ...d, mensagemAoVivo: e.target.value }))}
              placeholder="Estamos ao vivo agora"
              maxLength={120}
            />
          </div>

          <div className="campo campo--checkbox">
            <input
              id="noSite"
              type="checkbox"
              checked={dados.exibirNoSite}
              onChange={(e) => setDados((d) => ({ ...d, exibirNoSite: e.target.checked }))}
            />
            <label htmlFor="noSite">Mostrar no site</label>
          </div>

          <div className="campo campo--checkbox">
            <input
              id="noApp"
              type="checkbox"
              checked={dados.exibirNoApp}
              onChange={(e) => setDados((d) => ({ ...d, exibirNoApp: e.target.checked }))}
            />
            <label htmlFor="noApp">Mostrar no aplicativo dos membros</label>
          </div>
        </div>
      </section>

      <button type="button" className="btn btn--lg" onClick={salvar} disabled={pendente}>
        {pendente ? "Salvando…" : "Salvar configuração"}
      </button>
    </>
  );
}

function ModoOpcao({
  valor,
  atual,
  aoMudar,
  titulo,
  desc,
  desabilitado,
}: {
  valor: "AUTO" | "MANUAL" | "AGENDA";
  atual: string;
  aoMudar: (v: "AUTO" | "MANUAL" | "AGENDA") => void;
  titulo: string;
  desc: string;
  desabilitado?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: ".8rem",
        alignItems: "flex-start",
        padding: "1rem",
        border: "1px solid",
        borderColor: atual === valor ? "var(--gold)" : "var(--line-on-light)",
        background: atual === valor ? "rgb(var(--gold-rgb) / .06)" : "#fff",
        borderRadius: "var(--radius)",
        cursor: desabilitado ? "not-allowed" : "pointer",
        opacity: desabilitado ? 0.55 : 1,
      }}
    >
      <input
        type="radio"
        name="modoLive"
        value={valor}
        checked={atual === valor}
        disabled={desabilitado}
        onChange={() => aoMudar(valor)}
        style={{ marginTop: ".25rem" }}
      />
      <span>
        <strong style={{ display: "block" }}>{titulo}</strong>
        <span className="dim" style={{ fontSize: ".85rem" }}>
          {desc}
        </span>
      </span>
    </label>
  );
}
