"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Campo de upload do painel.
 *
 * O QUE ELE FAZ
 * Seleção por clique ou por arrastar, prévia imediata, barra de progresso real
 * e mensagens de erro que dizem o que fazer. Ao concluir, guarda o `id` do
 * arquivo num input oculto, para que o formulário que o contém envie apenas
 * esse identificador — nunca o binário de novo.
 *
 * O QUE ELE NÃO FAZ: SEGURANÇA.
 * Toda validação daqui é CONVENIÊNCIA. Ela existe para o usuário descobrir em
 * 50 ms que o arquivo tem 40 MB, em vez de esperar o upload inteiro para
 * receber um 413. Nada disso é controle: quem quiser burlar não usa este
 * componente, usa `curl`. As decisões reais — tamanho, tipo por magic bytes,
 * cota da igreja, permissão, CSRF — estão todas em /api/upload, no servidor.
 *
 * Usamos XMLHttpRequest e não `fetch` por um motivo único: `fetch` ainda não
 * expõe progresso de ENVIO de forma amplamente suportada, e uma barra que só
 * pula de 0% a 100% não informa nada a quem está numa conexão lenta de
 * celular — que é a realidade de boa parte das igrejas.
 */

/** Espelho da allowlist do servidor. O servidor continua sendo quem decide. */
const TIPOS_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "application/pdf",
] as const;

const EXTENSOES_AMIGAVEIS = "JPG, PNG, WEBP, AVIF, GIF ou PDF";

/** Espelha o padrão de MAX_UPLOAD_BYTES. Sobrescrevível pela prop `maxBytes`. */
const MAX_PADRAO = 25 * 1024 * 1024;

export interface ArquivoEnviado {
  id: string;
  url: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
}

export function CampoUpload({
  nome,
  rotulo,
  ajuda,
  publico = false,
  maxBytes = MAX_PADRAO,
  valorInicial = null,
  obrigatorio = false,
  aoEnviar,
  aoRemover,
}: {
  /** Nome do input oculto que carrega o id do arquivo no formulário. */
  nome: string;
  rotulo: string;
  ajuda?: string;
  /** true = arquivo servível sem sessão (logo, banner do site). */
  publico?: boolean;
  maxBytes?: number;
  valorInicial?: ArquivoEnviado | null;
  obrigatorio?: boolean;
  aoEnviar?: (arquivo: ArquivoEnviado) => void;
  aoRemover?: () => void;
}) {
  const [arquivo, setArquivo] = useState<ArquivoEnviado | null>(valorInicial);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [previaLocal, setPreviaLocal] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const requisicaoRef = useRef<XMLHttpRequest | null>(null);

  const idCampo = `upload-${nome}`;
  const enviando = progresso !== null;

  // A URL de objeto aponta para um blob mantido em memória pelo navegador.
  // Sem o revoke, trocar de arquivo dez vezes deixa dez blobs vivos até a
  // aba fechar.
  useEffect(() => {
    return () => {
      if (previaLocal) URL.revokeObjectURL(previaLocal);
    };
  }, [previaLocal]);

  // Se o componente sair da tela no meio de um envio, aborta a requisição em
  // vez de deixá-la terminar e chamar `setState` num componente desmontado.
  useEffect(() => {
    return () => requisicaoRef.current?.abort();
  }, []);

  function selecionar(lista: FileList | null) {
    const escolhido = lista?.item(0);
    if (!escolhido) return;

    setErro(null);

    // ---- Validação local (conveniência)
    if (escolhido.size === 0) {
      setErro("Este arquivo está vazio.");
      return;
    }
    if (escolhido.size > maxBytes) {
      setErro(
        `O arquivo tem ${formatarTamanho(escolhido.size)} e o limite é ${formatarTamanho(maxBytes)}. ` +
          `Reduza a imagem antes de enviar.`,
      );
      return;
    }
    // O `type` vem do sistema operacional e é apenas um palpite — por isso a
    // mensagem é um aviso amigável, e a recusa de verdade acontece no servidor.
    if (escolhido.type && !(TIPOS_ACEITOS as readonly string[]).includes(escolhido.type)) {
      setErro(`Formato não aceito. Envie um arquivo ${EXTENSOES_AMIGAVEIS}.`);
      return;
    }

    if (previaLocal) URL.revokeObjectURL(previaLocal);
    setPreviaLocal(escolhido.type.startsWith("image/") ? URL.createObjectURL(escolhido) : null);

    enviar(escolhido);
  }

  function enviar(escolhido: File) {
    const dados = new FormData();
    dados.append("arquivo", escolhido);
    dados.append("publico", publico ? "true" : "false");
    // O servidor aceita o token por header OU por campo do formulário. Mandamos
    // pelos dois: o header cobre o caso normal, o campo cobre navegadores que
    // bloqueiam a leitura do cookie por extensão de privacidade.
    const csrf = lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "";
    dados.append("_csrf", csrf);

    const xhr = new XMLHttpRequest();
    requisicaoRef.current = xhr;

    setProgresso(0);

    xhr.upload.addEventListener("progress", (evento) => {
      if (!evento.lengthComputable) return;
      // Trava em 99% até o servidor responder: os últimos bytes saírem da
      // máquina não significa que o arquivo foi aceito.
      setProgresso(Math.min(99, Math.round((evento.loaded / evento.total) * 100)));
    });

    xhr.addEventListener("load", () => {
      requisicaoRef.current = null;
      setProgresso(null);

      const corpo = interpretarResposta(xhr.responseText);
      const idRecebido = texto(corpo, "id");

      if (xhr.status >= 200 && xhr.status < 300 && idRecebido) {
        const salvo: ArquivoEnviado = {
          id: idRecebido,
          url: texto(corpo, "url") ?? "",
          nome: texto(corpo, "nome") ?? escolhido.name,
          mimeType: texto(corpo, "mimeType") ?? "",
          tamanhoBytes: numero(corpo, "tamanhoBytes") ?? escolhido.size,
        };
        setArquivo(salvo);
        aoEnviar?.(salvo);
        return;
      }

      // A mensagem exibida é SEMPRE a que o servidor redigiu (campo `erro`).
      // Ela é inserida como TEXTO pelo React, nunca como HTML — não há
      // `dangerouslySetInnerHTML` em lugar nenhum deste componente.
      setErro(texto(corpo, "erro") ?? mensagemPorStatus(xhr.status));
      limparPrevia();
    });

    xhr.addEventListener("error", () => {
      requisicaoRef.current = null;
      setProgresso(null);
      setErro("Falha de conexão. Verifique a internet e tente novamente.");
      limparPrevia();
    });

    xhr.addEventListener("abort", () => {
      requisicaoRef.current = null;
      setProgresso(null);
      limparPrevia();
    });

    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("x-csrf-token", csrf);
    xhr.setRequestHeader("accept", "application/json");
    // Sem `Content-Type` manual: o navegador precisa gerar o boundary do
    // multipart. Defini-lo à mão quebra o parse no servidor.
    xhr.withCredentials = true;
    xhr.send(dados);
  }

  function limparPrevia() {
    if (previaLocal) URL.revokeObjectURL(previaLocal);
    setPreviaLocal(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remover() {
    requisicaoRef.current?.abort();
    limparPrevia();
    setArquivo(null);
    setErro(null);
    aoRemover?.();
    // O arquivo continua no servidor de propósito: remover o vínculo aqui é
    // uma edição de formulário, e apagar o binário é uma ação destrutiva que
    // precisa de confirmação e auditoria próprias.
  }

  const previaExibida = previaLocal ?? (ehImagem(arquivo?.mimeType) ? arquivo?.url : null);

  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={idCampo}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio">*</span>}
      </label>

      {/* O id do arquivo é o que o formulário envia. O binário já está no
          servidor neste ponto. */}
      <input type="hidden" name={nome} value={arquivo?.id ?? ""} />

      <input
        ref={inputRef}
        id={idCampo}
        type="file"
        accept={TIPOS_ACEITOS.join(",")}
        onChange={(e) => selecionar(e.target.files)}
        disabled={enviando}
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!enviando) setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (!enviando) selecionar(e.dataTransfer.files);
        }}
        style={{
          border: `1px dashed ${arrastando ? "var(--gold)" : "var(--line-on-light)"}`,
          borderRadius: "10px",
          padding: "1.1rem",
          background: arrastando ? "rgb(var(--gold-rgb) / 0.06)" : "transparent",
          transition: "border-color .15s ease, background .15s ease",
        }}
      >
        {previaExibida ? (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a origem
                é /api/arquivos, que não passa pelo otimizador de imagem. */}
            <img
              src={previaExibida}
              alt={arquivo ? `Prévia de ${arquivo.nome}` : "Prévia do arquivo selecionado"}
              style={{
                width: 96,
                height: 96,
                objectFit: "cover",
                borderRadius: "8px",
                border: "1px solid var(--line-on-light)",
                opacity: enviando ? 0.5 : 1,
              }}
            />
            <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
              <p style={{ fontSize: "0.86rem", wordBreak: "break-word" }}>
                {arquivo?.nome ?? "Enviando…"}
              </p>
              {arquivo && (
                <p style={{ fontSize: "0.78rem", color: "var(--graphite-dim)" }}>
                  {formatarTamanho(arquivo.tamanhoBytes)}
                </p>
              )}
            </div>
          </div>
        ) : arquivo ? (
          <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="etiqueta">{rotuloDeTipo(arquivo.mimeType)}</span>
            <div style={{ minWidth: 0, flex: "1 1 12rem" }}>
              <p style={{ fontSize: "0.86rem", wordBreak: "break-word" }}>{arquivo.nome}</p>
              <p style={{ fontSize: "0.78rem", color: "var(--graphite-dim)" }}>
                {formatarTamanho(arquivo.tamanhoBytes)}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ fontSize: "0.86rem", color: "var(--graphite-dim)" }}>
            Arraste um arquivo aqui ou escolha do computador.
          </p>
        )}

        {enviando && (
          <div style={{ marginTop: "0.9rem" }}>
            <div
              role="progressbar"
              aria-valuenow={progresso ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso do envio"
              style={{
                height: 6,
                borderRadius: 999,
                background: "var(--paper-2)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progresso ?? 0}%`,
                  height: "100%",
                  background: "var(--gold)",
                  transition: "width .2s ease",
                }}
              />
            </div>
            <p style={{ marginTop: ".4rem", fontSize: "0.78rem", color: "var(--graphite-dim)" }}>
              Enviando… {progresso}%
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: ".6rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn--sm btn--outline-gold"
            onClick={() => inputRef.current?.click()}
            disabled={enviando}
          >
            {arquivo ? "Trocar arquivo" : "Escolher arquivo"}
          </button>

          {enviando && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => requisicaoRef.current?.abort()}
            >
              Cancelar envio
            </button>
          )}

          {arquivo && !enviando && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={remover}>
              Remover
            </button>
          )}
        </div>
      </div>

      {/* `aria-live` para que quem usa leitor de tela saiba do erro sem
          precisar navegar até ele. */}
      <div aria-live="polite">
        {erro && (
          <p className="campo__erro" role="alert" style={{ marginTop: ".5rem" }}>
            {erro}
          </p>
        )}
      </div>

      <p className="campo__ajuda">
        {ajuda ? `${ajuda} ` : ""}
        Aceita {EXTENSOES_AMIGAVEIS}, até {formatarTamanho(maxBytes)}.
        {publico
          ? " Este arquivo ficará visível no site público da igreja."
          : " Este arquivo só poderá ser aberto por quem tem acesso ao painel."}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function ehImagem(mime: string | undefined): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function rotuloDeTipo(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.startsWith("image/")) return mime.slice(6).toUpperCase();
  return "Arquivo";
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${(mb >= 10 ? Math.round(mb) : Number(mb.toFixed(1))).toString().replace(".", ",")} MB`;
}

/** Nunca deixa um corpo malformado virar exceção no meio do handler. */
function interpretarResposta(bruto: string): Record<string, unknown> | null {
  try {
    const valor: unknown = JSON.parse(bruto);
    if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
      return valor as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Extratores tipados: a resposta do servidor é tratada como dado não confiável. */
function texto(corpo: Record<string, unknown> | null, chave: string): string | null {
  const valor = corpo?.[chave];
  return typeof valor === "string" && valor.length > 0 ? valor : null;
}

function numero(corpo: Record<string, unknown> | null, chave: string): number | null {
  const valor = corpo?.[chave];
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/**
 * Texto de reserva para quando a resposta não traz `erro` (proxy no meio,
 * corpo cortado). Nunca expomos o status cru nem o corpo bruto.
 */
function mensagemPorStatus(status: number): string {
  if (status === 0) return "Envio interrompido.";
  if (status === 401) return "Sua sessão expirou. Recarregue a página e entre novamente.";
  if (status === 403) return "Você não tem permissão para enviar arquivos.";
  if (status === 413) return "Arquivo grande demais para o espaço disponível.";
  if (status === 415) return `Formato não aceito. Envie um arquivo ${EXTENSOES_AMIGAVEIS}.`;
  if (status === 429) return "Muitos envios seguidos. Aguarde um instante e tente de novo.";
  return "Não foi possível enviar o arquivo. Tente novamente.";
}

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}
