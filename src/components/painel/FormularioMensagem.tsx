"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  atualizarMensagem,
  criarMensagem,
  excluirMensagem,
} from "@/app/painel/mensagens/acoes";
import { CampoUpload, type ArquivoEnviado } from "@/components/painel/CampoUpload";

/**
 * Formulário de mensagem / pregação.
 *
 * O CAMPO DE VÍDEO ACEITA QUALQUER COISA — E GUARDA SÓ O ID.
 * O usuário cola o endereço que copiou do YouTube (watch, youtu.be, live,
 * shorts) e o servidor extrai os 11 caracteres do vídeo. A prévia aqui do lado
 * usa esse mesmo ID já extraído no navegador, para o usuário conferir que
 * acertou o vídeo antes de publicar. Repare que o `src` do iframe é montado a
 * partir do ID, nunca da string colada: é a mesma regra do servidor, aplicada
 * também na prévia para não abrir uma exceção justamente onde seria fácil.
 */

export interface ValoresMensagem {
  titulo: string;
  slug: string;
  descricao: string;
  preletor: string;
  serie: string;
  video: string;
  duracaoMinutos: string;
  data: string;
  publicado: boolean;
  destaque: boolean;
}

const VAZIO: ValoresMensagem = {
  titulo: "",
  slug: "",
  descricao: "",
  preletor: "",
  serie: "",
  video: "",
  duracaoMinutos: "",
  data: "",
  publicado: false,
  destaque: false,
};

/** Mesmos padrões do schema `youtubeVideoId` do servidor, só para a prévia. */
function extrairVideoId(bruto: string): string | null {
  const v = bruto.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;

  const padroes = [
    /(?:youtube\.com\/watch\?[^#]*\bv=)([A-Za-z0-9_-]{11})/,
    /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([A-Za-z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of padroes) {
    const m = v.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function FormularioMensagem({
  modo,
  mensagemId,
  inicial,
  capaInicial = null,
}: {
  modo: "criar" | "editar";
  mensagemId?: string;
  inicial?: Partial<ValoresMensagem>;
  capaInicial?: ArquivoEnviado | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const v: ValoresMensagem = { ...VAZIO, ...inicial };

  const [video, setVideo] = useState(v.video);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const videoId = video ? extrairVideoId(video) : null;

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = Object.fromEntries(new FormData(evento.currentTarget));

    setErro(null);
    setSucesso(null);
    setCampos({});

    iniciar(async () => {
      const resultado =
        modo === "criar"
          ? await criarMensagem(dados)
          : await atualizarMensagem(mensagemId ?? "", dados);

      if (resultado.ok) {
        if (modo === "criar" && resultado.mensagemId) {
          router.push(`/painel/mensagens/${resultado.mensagemId}`);
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
      const resultado = await excluirMensagem(mensagemId ?? "");
      if (resultado.ok) {
        router.push("/painel/mensagens");
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
        <h2 className="secao-painel__titulo">A mensagem</h2>
        <p className="secao-painel__desc">
          Título e vídeo já bastam para publicar. O resto ajuda quem procura uma pregação antiga.
        </p>

        <Campo rotulo="Título" nome="titulo" erros={campos.titulo} obrigatorio>
          <input
            id="titulo"
            name="titulo"
            type="text"
            required
            maxLength={200}
            defaultValue={v.titulo}
            autoComplete="off"
          />
        </Campo>

        <div className="grid cols-3">
          <Campo rotulo="Preletor" nome="preletor" erros={campos.preletor}>
            <input
              id="preletor"
              name="preletor"
              type="text"
              maxLength={160}
              defaultValue={v.preletor}
              autoComplete="off"
            />
          </Campo>

          <Campo
            rotulo="Série"
            nome="serie"
            erros={campos.serie}
            ajuda="Agrupa mensagens do mesmo estudo."
          >
            <input
              id="serie"
              name="serie"
              type="text"
              maxLength={120}
              defaultValue={v.serie}
              autoComplete="off"
            />
          </Campo>

          <Campo rotulo="Data da pregação" nome="data" erros={campos.data}>
            <input id="data" name="data" type="date" defaultValue={v.data} />
          </Campo>
        </div>

        <Campo
          rotulo="Descrição"
          nome="descricao"
          erros={campos.descricao}
          ajuda="Um resumo do que foi falado, os textos bíblicos, o convite final."
        >
          <textarea
            id="descricao"
            name="descricao"
            rows={5}
            maxLength={5000}
            defaultValue={v.descricao}
          />
        </Campo>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Vídeo</h2>
        <p className="secao-painel__desc">
          Cole o endereço do YouTube. Guardamos apenas o identificador do vídeo — o player é montado
          por nós, então nenhum outro conteúdo consegue entrar no lugar dele.
        </p>

        <div className="grid cols-2">
          <div>
            <Campo
              rotulo="Endereço ou ID do vídeo"
              nome="video"
              erros={campos.video}
              ajuda="Ex.: https://www.youtube.com/watch?v=XXXXXXXXXXX"
            >
              <input
                id="video"
                name="video"
                type="text"
                maxLength={300}
                value={video}
                onChange={(e) => setVideo(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
            </Campo>

            {video && !videoId && (
              <p className="campo__erro" role="alert">
                Não reconhecemos um vídeo do YouTube neste endereço.
              </p>
            )}
            {videoId && (
              <p className="campo__ajuda">
                Identificador reconhecido: <strong>{videoId}</strong>
              </p>
            )}

            <Campo
              rotulo="Duração (minutos)"
              nome="duracaoMinutos"
              erros={campos.duracaoMinutos}
              ajuda="Opcional. Aparece na lista de mensagens do site."
            >
              <input
                id="duracaoMinutos"
                name="duracaoMinutos"
                type="number"
                min={0}
                max={600}
                defaultValue={v.duracaoMinutos}
              />
            </Campo>
          </div>

          <div>
            <p className="cartao__rotulo">Prévia</p>
            {videoId ? (
              <div className="frame" style={{ marginTop: ".6rem" }}>
                <iframe
                  // O `src` é MONTADO a partir do ID validado, nunca da string
                  // que o usuário colou.
                  src={`https://www.youtube-nocookie.com/embed/${videoId}`}
                  title="Prévia do vídeo"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                />
              </div>
            ) : (
              <div className="vazio" style={{ marginTop: ".6rem" }}>
                A prévia aparece assim que o endereço for reconhecido.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Capa</h2>
        <p className="secao-painel__desc">
          Imagem usada na lista de mensagens e no compartilhamento. Se não enviar nenhuma, o site usa
          a miniatura do próprio vídeo.
        </p>

        <CampoUpload
          nome="capaArquivoId"
          rotulo="Imagem de capa"
          publico
          valorInicial={capaInicial}
          ajuda="JPG, PNG ou WEBP. O ideal é uma imagem larga (16:9)."
        />
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Publicação</h2>

        <div style={{ display: "grid", gap: ".5rem" }}>
          <div className="campo campo--checkbox">
            <input
              id="publicado"
              name="publicado"
              type="checkbox"
              value="on"
              defaultChecked={v.publicado}
            />
            <label htmlFor="publicado">
              Publicada — visível no site e no aplicativo. Desmarcada, a mensagem fica só aqui.
            </label>
          </div>

          <div className="campo campo--checkbox">
            <input
              id="destaque"
              name="destaque"
              type="checkbox"
              value="on"
              defaultChecked={v.destaque}
            />
            <label htmlFor="destaque">Destacar na página inicial</label>
          </div>
        </div>

        {modo === "editar" && (
          <Campo
            rotulo="Endereço da mensagem"
            nome="slug"
            erros={campos.slug}
            ajuda="Muda a URL pública. Links já compartilhados param de funcionar — só altere se precisar mesmo."
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
      </section>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="btn" disabled={pendente}>
          {pendente ? "Salvando…" : modo === "criar" ? "Criar mensagem" : "Salvar alterações"}
        </button>
        <Link href="/painel/mensagens" className="btn btn--ghost">
          Voltar
        </Link>

        {modo === "editar" && !confirmandoExclusao && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={pendente}
            style={{ marginLeft: "auto", color: "#cf222e" }}
          >
            Excluir mensagem
          </button>
        )}
      </div>

      {modo === "editar" && confirmandoExclusao && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.4rem" }}>
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Excluir esta mensagem?</strong> O registro é apagado de verdade e o endereço
            público deixa de existir. Para apenas tirar do ar, desmarque &ldquo;Publicada&rdquo;.
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
