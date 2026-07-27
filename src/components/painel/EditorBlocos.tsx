"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROTULOS_BLOCO, type Bloco } from "@/lib/validation/blocos";
import { criarPagina, excluirPagina, salvarPagina } from "@/app/painel/paginas/acoes";
import { CampoUpload } from "@/components/painel/CampoUpload";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * Editor de páginas por BLOCOS.
 *
 * POR QUE BLOCOS E NÃO UM EDITOR DE TEXTO RICO
 * Um editor rich-text guarda HTML, e HTML vindo do usuário é XSS armazenado
 * esperando acontecer: o `<script>` colado por um pastor (de propósito ou por
 * ter copiado de um site infectado) executaria no domínio da igreja, com os
 * cookies dos visitantes. Sanitizar HTML é uma corrida armamentista que quem
 * defende precisa vencer todos os dias e quem ataca precisa vencer uma vez.
 *
 * Aqui o conteúdo é dado estruturado: blocos de tipo conhecido com campos de
 * texto puro. O React escapa tudo na renderização, o Zod recusa qualquer bloco
 * fora do catálogo, e não existe caminho por onde marcação do usuário vire
 * marcação da página.
 *
 * Este componente é a INTERFACE dessa decisão: ele nunca produz HTML, só um
 * array de objetos. Toda a validação que vale acontece na Server Action.
 */

const TEMAS = [
  { valor: "claro", rotulo: "Fundo claro" },
  { valor: "escuro", rotulo: "Fundo escuro" },
  { valor: "creme", rotulo: "Fundo creme" },
] as const;

const FORMULARIOS = [
  { valor: "visitante", rotulo: "Sou novo aqui" },
  { valor: "contato", rotulo: "Fale conosco" },
  { valor: "pedido-oracao", rotulo: "Pedido de oração" },
  { valor: "batismo", rotulo: "Quero ser batizado" },
  { valor: "quero-celula", rotulo: "Quero uma célula" },
] as const;

const TIPOS_DISPONIVEIS = Object.keys(ROTULOS_BLOCO) as Bloco["tipo"][];

const MAX_BLOCOS = 40;

/** Bloco novo já nasce com os campos obrigatórios do schema preenchidos. */
function blocoPadrao(tipo: Bloco["tipo"]): Bloco {
  switch (tipo) {
    case "hero":
      return { tipo: "hero", titulo: "" };
    case "texto":
      return { tipo: "texto", tema: "claro", corpo: "" };
    case "citacao":
      return { tipo: "citacao", tema: "creme", texto: "" };
    case "cards":
      return { tipo: "cards", tema: "claro", colunas: 3, itens: [{ titulo: "" }] };
    case "lista":
      return { tipo: "lista", tema: "claro", itens: [{ titulo: "" }] };
    case "imagem":
      return { tipo: "imagem", tema: "claro", imagemId: "", proporcao: "16/9" };
    case "video":
      return { tipo: "video", tema: "escuro", youtubeVideoId: "" };
    case "formulario":
      return { tipo: "formulario", tema: "claro", formulario: "contato" };
    case "cta":
      return { tipo: "cta", tema: "escuro", titulo: "", botaoTexto: "", botaoLink: "" };
    case "agenda":
      return { tipo: "agenda", tema: "claro" };
    case "campi":
      return { tipo: "campi", tema: "claro" };
    case "aoVivo":
      return { tipo: "aoVivo", tema: "escuro" };
  }
}

export interface ValoresPagina {
  titulo: string;
  seoTitulo: string;
  seoDescricao: string;
  publicada: boolean;
  mostrarMenu: boolean;
  ordemMenu: string;
  blocos: Bloco[];
}

export function EditorBlocos({
  paginaId,
  slug,
  inicial,
  podePublicar,
  podeExcluir,
}: {
  paginaId: string;
  slug: string;
  inicial: ValoresPagina;
  podePublicar: boolean;
  podeExcluir: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const [titulo, setTitulo] = useState(inicial.titulo);
  const [seoTitulo, setSeoTitulo] = useState(inicial.seoTitulo);
  const [seoDescricao, setSeoDescricao] = useState(inicial.seoDescricao);
  const [publicada, setPublicada] = useState(inicial.publicada);
  const [mostrarMenu, setMostrarMenu] = useState(inicial.mostrarMenu);
  const [ordemMenu, setOrdemMenu] = useState(inicial.ordemMenu);
  const [blocos, setBlocos] = useState<Bloco[]>(inicial.blocos);

  const [tipoNovo, setTipoNovo] = useState<Bloco["tipo"]>("texto");
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  /**
   * Os erros do Zod chegam com caminho ("blocos.3.titulo"). Agrupamos por
   * índice de bloco para mostrar a mensagem DENTRO do bloco problemático — uma
   * lista de erros no topo de uma página de 20 blocos não ajuda ninguém.
   */
  const errosPorBloco = useMemo(() => {
    const mapa = new Map<number, string[]>();
    for (const [caminho, mensagens] of Object.entries(campos)) {
      const m = caminho.match(/^blocos\.(\d+)/);
      if (!m?.[1]) continue;
      const indice = Number(m[1]);
      const campo = caminho.split(".").slice(2).join(".") || "conteúdo";
      const atual = mapa.get(indice) ?? [];
      for (const mensagem of mensagens) atual.push(`${campo}: ${mensagem}`);
      mapa.set(indice, atual);
    }
    return mapa;
  }, [campos]);

  function atualizarBloco(indice: number, mudanca: Record<string, unknown>) {
    setBlocos((atuais) =>
      atuais.map((b, i) => (i === indice ? ({ ...b, ...mudanca } as Bloco) : b)),
    );
  }

  function adicionar() {
    if (blocos.length >= MAX_BLOCOS) return;
    setBlocos((atuais) => [...atuais, blocoPadrao(tipoNovo)]);
  }

  function mover(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;
    if (destino < 0 || destino >= blocos.length) return;

    setBlocos((atuais) => {
      const copia = [...atuais];
      const atual = copia[indice];
      const outro = copia[destino];
      // `noUncheckedIndexedAccess`: o compilador não sabe que os índices são
      // válidos, e a guarda acima é para ele tanto quanto para nós.
      if (!atual || !outro) return atuais;
      copia[indice] = outro;
      copia[destino] = atual;
      return copia;
    });
  }

  function remover(indice: number) {
    setBlocos((atuais) => atuais.filter((_, i) => i !== indice));
  }

  function salvar() {
    setFeedback(null);
    setCampos({});

    iniciar(async () => {
      const resultado = await salvarPagina(paginaId, {
        titulo,
        seoTitulo,
        seoDescricao,
        publicada,
        mostrarMenu,
        ordemMenu: ordemMenu === "" ? undefined : ordemMenu,
        blocos,
      });

      setFeedback({ tipo: resultado.ok ? "ok" : "erro", texto: resultado.mensagem });
      setCampos(resultado.campos ?? {});
      if (resultado.ok) router.refresh();
    });
  }

  function excluir() {
    setFeedback(null);
    iniciar(async () => {
      const resultado = await excluirPagina(paginaId);
      if (resultado.ok) {
        router.push("/painel/paginas");
        router.refresh();
        return;
      }
      setFeedback({ tipo: "erro", texto: resultado.mensagem });
      setConfirmandoExclusao(false);
    });
  }

  return (
    <div>
      {feedback && (
        <div
          className={`alerta alerta--${feedback.tipo === "ok" ? "sucesso" : "erro"}`}
          role="alert"
          style={{ marginBottom: "1.4rem" }}
        >
          {feedback.texto}
        </div>
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Identificação da página</h2>
        <p className="secao-painel__desc">
          O endereço público é <strong>/{slug}</strong> e não muda por aqui — links já divulgados
          continuam funcionando.
        </p>

        <Campo rotulo="Título" nome="titulo" erros={campos.titulo} obrigatorio>
          <input
            id="titulo"
            type="text"
            maxLength={160}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
          />
        </Campo>

        <div className="grid cols-2">
          <Campo
            rotulo="Título para buscadores"
            nome="seoTitulo"
            erros={campos.seoTitulo}
            ajuda="Em branco, usa o título da página."
          >
            <input
              id="seoTitulo"
              type="text"
              maxLength={200}
              value={seoTitulo}
              onChange={(e) => setSeoTitulo(e.target.value)}
            />
          </Campo>

          <Campo
            rotulo="Ordem no menu"
            nome="ordemMenu"
            erros={campos.ordemMenu}
            ajuda="Menor número aparece antes."
          >
            <input
              id="ordemMenu"
              type="number"
              min={0}
              max={999}
              value={ordemMenu}
              onChange={(e) => setOrdemMenu(e.target.value)}
            />
          </Campo>
        </div>

        <Campo
          rotulo="Descrição para buscadores"
          nome="seoDescricao"
          erros={campos.seoDescricao}
          ajuda="Aparece no Google abaixo do título. Até 300 caracteres."
        >
          <textarea
            id="seoDescricao"
            rows={2}
            maxLength={300}
            value={seoDescricao}
            onChange={(e) => setSeoDescricao(e.target.value)}
          />
        </Campo>

        <div style={{ display: "grid", gap: ".5rem", marginTop: "1rem" }}>
          <div className="campo campo--checkbox">
            <input
              id="mostrarMenu"
              type="checkbox"
              checked={mostrarMenu}
              onChange={(e) => setMostrarMenu(e.target.checked)}
            />
            <label htmlFor="mostrarMenu">Mostrar esta página no menu do site</label>
          </div>

          <div className="campo campo--checkbox">
            <input
              id="publicada"
              type="checkbox"
              checked={publicada}
              disabled={!podePublicar}
              onChange={(e) => setPublicada(e.target.checked)}
            />
            <label htmlFor="publicada">
              Publicada — visível para qualquer visitante
              {!podePublicar && " (você pode editar, mas não publicar)"}
            </label>
          </div>
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Conteúdo</h2>
        <p className="secao-painel__desc">
          A página é montada com blocos prontos. Cada bloco tem campos de texto e imagem — não há
          edição de HTML, e é justamente isso que impede que um código colado por engano vá parar no
          site da igreja.
        </p>

        {blocos.length === 0 ? (
          <div className="vazio">Esta página ainda não tem nenhum bloco.</div>
        ) : (
          <div style={{ display: "grid", gap: "1rem" }}>
            {blocos.map((bloco, indice) => (
              <article
                key={`${bloco.tipo}-${indice}`}
                style={{
                  border: "1px solid var(--line-on-light)",
                  borderRadius: "var(--radius)",
                  padding: "1.1rem",
                }}
              >
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: ".6rem",
                    flexWrap: "wrap",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
                    <span className="etiqueta">{indice + 1}</span>
                    <strong style={{ fontSize: ".95rem" }}>{ROTULOS_BLOCO[bloco.tipo]}</strong>
                  </div>

                  <div style={{ display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => mover(indice, -1)}
                      disabled={indice === 0 || pendente}
                      aria-label={`Mover ${ROTULOS_BLOCO[bloco.tipo]} para cima`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => mover(indice, 1)}
                      disabled={indice === blocos.length - 1 || pendente}
                      aria-label={`Mover ${ROTULOS_BLOCO[bloco.tipo]} para baixo`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => remover(indice)}
                      disabled={pendente}
                      style={{ color: "#cf222e" }}
                    >
                      Remover
                    </button>
                  </div>
                </header>

                {errosPorBloco.get(indice)?.map((mensagem) => (
                  <p key={mensagem} className="campo__erro" role="alert">
                    {mensagem}
                  </p>
                ))}

                <CamposDoBloco
                  bloco={bloco}
                  indice={indice}
                  aoMudar={(mudanca) => atualizarBloco(indice, mudanca)}
                />
              </article>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            gap: ".6rem",
            alignItems: "flex-end",
            flexWrap: "wrap",
            marginTop: "1.4rem",
          }}
        >
          <div className="campo" style={{ marginBottom: 0, minWidth: 220 }}>
            <label className="campo__rotulo" htmlFor="tipoNovo">
              Adicionar bloco
            </label>
            <select
              id="tipoNovo"
              value={tipoNovo}
              onChange={(e) => setTipoNovo(e.target.value as Bloco["tipo"])}
            >
              {TIPOS_DISPONIVEIS.map((t) => (
                <option key={t} value={t}>
                  {ROTULOS_BLOCO[t]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={adicionar}
            disabled={pendente || blocos.length >= MAX_BLOCOS}
          >
            Adicionar
          </button>
          <span className="campo__ajuda">
            {blocos.length} de {MAX_BLOCOS} blocos
          </span>
        </div>
      </section>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="btn btn--lg" onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar página"}
        </button>
        <a href={`/${slug}`} target="_blank" rel="noopener noreferrer" className="btn btn--ghost">
          Ver no site
        </a>

        {podeExcluir && !confirmandoExclusao && (
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={pendente}
            style={{ marginLeft: "auto", color: "#cf222e" }}
          >
            Excluir página
          </button>
        )}
      </div>

      {podeExcluir && confirmandoExclusao && (
        <div className="alerta alerta--erro" style={{ marginTop: "1.4rem" }}>
          <p style={{ marginBottom: ".8rem" }}>
            <strong>Excluir esta página?</strong> O endereço /{slug} deixa de existir e quem tiver o
            link antigo verá &ldquo;página não encontrada&rdquo;. Para tirar do ar sem perder o
            conteúdo, desmarque &ldquo;Publicada&rdquo;.
          </p>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <button type="button" className="btn btn--sm" onClick={excluir} disabled={pendente}>
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
    </div>
  );
}

/**
 * Campos de cada tipo de bloco.
 *
 * O `switch` sobre `bloco.tipo` é o que dá ao TypeScript a narrowing da união
 * discriminada: dentro de cada `case`, só os campos daquele bloco existem. Se
 * um tipo novo for adicionado ao schema sem ganhar um `case` aqui, o
 * compilador acusa no `default` — o editor não fica silenciosamente incapaz de
 * editar um bloco que o site já renderiza.
 */
function CamposDoBloco({
  bloco,
  indice,
  aoMudar,
}: {
  bloco: Bloco;
  indice: number;
  aoMudar: (mudanca: Record<string, unknown>) => void;
}) {
  switch (bloco.tipo) {
    case "hero":
      return (
        <>
          <Texto rotulo="Texto pequeno acima" valor={bloco.eyebrow ?? ""} max={80} indice={indice} campo="eyebrow" aoMudar={aoMudar} />
          <Texto rotulo="Título" valor={bloco.titulo} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} obrigatorio />
          <Area rotulo="Subtítulo" valor={bloco.subtitulo ?? ""} max={400} indice={indice} campo="subtitulo" aoMudar={aoMudar} />
          <Imagem indice={indice} valor={bloco.imagemId} aoMudar={aoMudar} />
          <div className="grid cols-2">
            <Texto rotulo="Texto do botão" valor={bloco.ctaTexto ?? ""} max={60} indice={indice} campo="ctaTexto" aoMudar={aoMudar} />
            <Texto rotulo="Link do botão" valor={bloco.ctaLink ?? ""} max={200} indice={indice} campo="ctaLink" aoMudar={aoMudar} ajuda="Ex.: /contato" />
          </div>
        </>
      );

    case "texto":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <div className="grid cols-2">
            <Texto rotulo="Texto pequeno acima" valor={bloco.eyebrow ?? ""} max={80} indice={indice} campo="eyebrow" aoMudar={aoMudar} />
            <Texto rotulo="Título" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
          </div>
          <Area
            rotulo="Texto"
            valor={bloco.corpo}
            max={6000}
            linhas={8}
            indice={indice}
            campo="corpo"
            aoMudar={aoMudar}
            obrigatorio
            ajuda="Uma linha em branco separa parágrafos. Não use HTML — ele apareceria como texto."
          />
        </>
      );

    case "citacao":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <Area rotulo="Citação ou versículo" valor={bloco.texto} max={600} indice={indice} campo="texto" aoMudar={aoMudar} obrigatorio />
          <Texto rotulo="Autor / referência" valor={bloco.autor ?? ""} max={160} indice={indice} campo="autor" aoMudar={aoMudar} />
        </>
      );

    case "cards":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <div className="grid cols-3">
            <Texto rotulo="Texto pequeno acima" valor={bloco.eyebrow ?? ""} max={80} indice={indice} campo="eyebrow" aoMudar={aoMudar} />
            <Texto rotulo="Título da seção" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`colunas-${indice}`}>
                Colunas
              </label>
              <select
                id={`colunas-${indice}`}
                value={String(bloco.colunas)}
                onChange={(e) => aoMudar({ colunas: Number(e.target.value) })}
              >
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
              </select>
            </div>
          </div>

          <ListaDeItens
            indice={indice}
            itens={bloco.itens}
            max={12}
            comTextoLongo
            comLink
            comImagem
            aoMudar={(itens) => aoMudar({ itens })}
          />
        </>
      );

    case "lista":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <div className="grid cols-2">
            <Texto rotulo="Texto pequeno acima" valor={bloco.eyebrow ?? ""} max={80} indice={indice} campo="eyebrow" aoMudar={aoMudar} />
            <Texto rotulo="Título da seção" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
          </div>
          <ListaDeItens
            indice={indice}
            itens={bloco.itens}
            max={20}
            comTextoLongo
            aoMudar={(itens) => aoMudar({ itens })}
          />
        </>
      );

    case "imagem":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <Imagem indice={indice} valor={bloco.imagemId} aoMudar={aoMudar} obrigatorio />
          <div className="grid cols-2">
            <Texto rotulo="Legenda" valor={bloco.legenda ?? ""} max={200} indice={indice} campo="legenda" aoMudar={aoMudar} />
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`proporcao-${indice}`}>
                Proporção
              </label>
              <select
                id={`proporcao-${indice}`}
                value={bloco.proporcao}
                onChange={(e) => aoMudar({ proporcao: e.target.value })}
              >
                <option value="16/9">Paisagem (16/9)</option>
                <option value="4/3">Clássica (4/3)</option>
                <option value="1/1">Quadrada (1/1)</option>
                <option value="3/4">Retrato (3/4)</option>
              </select>
            </div>
          </div>
        </>
      );

    case "video":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <Texto rotulo="Título" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
          <Texto
            rotulo="Endereço do vídeo no YouTube"
            valor={bloco.youtubeVideoId}
            max={300}
            indice={indice}
            campo="youtubeVideoId"
            aoMudar={aoMudar}
            obrigatorio
            ajuda="Cole o link. Guardamos só o identificador do vídeo — o player é montado por nós."
          />
        </>
      );

    case "formulario":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <div className="grid cols-2">
            <Texto rotulo="Texto pequeno acima" valor={bloco.eyebrow ?? ""} max={80} indice={indice} campo="eyebrow" aoMudar={aoMudar} />
            <Texto rotulo="Título" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
          </div>
          <Area rotulo="Descrição" valor={bloco.descricao ?? ""} max={600} indice={indice} campo="descricao" aoMudar={aoMudar} />
          <div className="campo">
            <label className="campo__rotulo" htmlFor={`formulario-${indice}`}>
              Qual formulário
            </label>
            <select
              id={`formulario-${indice}`}
              value={bloco.formulario}
              onChange={(e) => aoMudar({ formulario: e.target.value })}
            >
              {FORMULARIOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
            <span className="campo__ajuda">
              A lista é fechada: cada opção corresponde a um formulário que já existe no sistema, com
              validação e antispam próprios.
            </span>
          </div>
        </>
      );

    case "cta":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <Texto rotulo="Título" valor={bloco.titulo} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} obrigatorio />
          <Area rotulo="Texto" valor={bloco.texto ?? ""} max={600} indice={indice} campo="texto" aoMudar={aoMudar} />
          <div className="grid cols-3">
            <Texto rotulo="Texto do botão" valor={bloco.botaoTexto} max={60} indice={indice} campo="botaoTexto" aoMudar={aoMudar} obrigatorio />
            <Texto rotulo="Link do botão" valor={bloco.botaoLink} max={200} indice={indice} campo="botaoLink" aoMudar={aoMudar} obrigatorio ajuda="Ex.: /contato" />
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`corFundo-${indice}`}>
                Cor de fundo
              </label>
              <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(bloco.corFundo ?? "") ? bloco.corFundo : "#0B0D11"}
                  onChange={(e) => aoMudar({ corFundo: e.target.value })}
                  aria-label="Seletor de cor de fundo"
                  style={{
                    width: 44,
                    height: 42,
                    padding: 2,
                    border: "1px solid var(--line-on-light)",
                    borderRadius: 4,
                    flex: "none",
                  }}
                />
                <input
                  id={`corFundo-${indice}`}
                  type="text"
                  maxLength={9}
                  spellCheck={false}
                  value={bloco.corFundo ?? ""}
                  onChange={(e) => aoMudar({ corFundo: e.target.value })}
                  placeholder="#0B0D11"
                />
              </div>
            </div>
          </div>
        </>
      );

    case "agenda":
    case "campi":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <div className="grid cols-2">
            <Texto rotulo="Texto pequeno acima" valor={bloco.eyebrow ?? ""} max={80} indice={indice} campo="eyebrow" aoMudar={aoMudar} />
            <Texto rotulo="Título" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
          </div>
          <p className="campo__ajuda">
            O conteúdo deste bloco vem do próprio sistema —{" "}
            {bloco.tipo === "agenda" ? "os itens da Agenda" : "os campi cadastrados"} — e se atualiza
            sozinho quando você mexe lá.
          </p>
        </>
      );

    case "aoVivo":
      return (
        <>
          <Tema valor={bloco.tema} indice={indice} aoMudar={aoMudar} />
          <Texto rotulo="Título" valor={bloco.titulo ?? ""} max={200} indice={indice} campo="titulo" aoMudar={aoMudar} />
          <Area rotulo="Descrição" valor={bloco.descricao ?? ""} max={600} indice={indice} campo="descricao" aoMudar={aoMudar} />
          <p className="campo__ajuda">
            A transmissão é configurada em Transmissão ao vivo. Este bloco só escolhe onde ela
            aparece na página.
          </p>
        </>
      );
  }
}

/** Itens repetidos dos blocos de cartões e de lista. */
function ListaDeItens({
  indice,
  itens,
  max,
  comTextoLongo = false,
  comLink = false,
  comImagem = false,
  aoMudar,
}: {
  indice: number;
  itens: { titulo: string; texto?: string; link?: string; linkTexto?: string; imagemId?: string }[];
  max: number;
  comTextoLongo?: boolean;
  comLink?: boolean;
  comImagem?: boolean;
  aoMudar: (itens: unknown[]) => void;
}) {
  function atualizar(i: number, mudanca: Record<string, unknown>) {
    aoMudar(itens.map((item, j) => (i === j ? { ...item, ...mudanca } : item)));
  }

  return (
    <div style={{ display: "grid", gap: ".9rem", marginTop: ".8rem" }}>
      {itens.map((item, i) => (
        <div
          key={i}
          style={{
            border: "1px dashed var(--line-on-light)",
            borderRadius: "var(--radius)",
            padding: ".9rem",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: ".6rem",
            }}
          >
            <strong style={{ fontSize: ".82rem" }}>Item {i + 1}</strong>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => aoMudar(itens.filter((_, j) => j !== i))}
              style={{ color: "#cf222e" }}
            >
              Remover item
            </button>
          </div>

          <div className="campo">
            <label className="campo__rotulo" htmlFor={`item-titulo-${indice}-${i}`}>
              Título<span className="obrigatorio">*</span>
            </label>
            <input
              id={`item-titulo-${indice}-${i}`}
              type="text"
              maxLength={120}
              value={item.titulo}
              onChange={(e) => atualizar(i, { titulo: e.target.value })}
            />
          </div>

          {comTextoLongo && (
            <div className="campo">
              <label className="campo__rotulo" htmlFor={`item-texto-${indice}-${i}`}>
                Texto
              </label>
              <textarea
                id={`item-texto-${indice}-${i}`}
                rows={3}
                maxLength={600}
                value={item.texto ?? ""}
                onChange={(e) => atualizar(i, { texto: e.target.value })}
              />
            </div>
          )}

          {comLink && (
            <div className="grid cols-2">
              <div className="campo">
                <label className="campo__rotulo" htmlFor={`item-link-${indice}-${i}`}>
                  Link
                </label>
                <input
                  id={`item-link-${indice}-${i}`}
                  type="text"
                  maxLength={200}
                  value={item.link ?? ""}
                  onChange={(e) => atualizar(i, { link: e.target.value })}
                  placeholder="/contato"
                />
              </div>
              <div className="campo">
                <label className="campo__rotulo" htmlFor={`item-linkTexto-${indice}-${i}`}>
                  Texto do link
                </label>
                <input
                  id={`item-linkTexto-${indice}-${i}`}
                  type="text"
                  maxLength={60}
                  value={item.linkTexto ?? ""}
                  onChange={(e) => atualizar(i, { linkTexto: e.target.value })}
                />
              </div>
            </div>
          )}

          {comImagem && (
            <CampoUpload
              nome={`item-imagem-${indice}-${i}`}
              rotulo="Imagem do item"
              publico
              valorInicial={
                item.imagemId
                  ? {
                      id: item.imagemId,
                      url: urlArquivoPublico(item.imagemId),
                      nome: "Imagem atual",
                      mimeType: "image/*",
                      tamanhoBytes: 0,
                    }
                  : null
              }
              aoEnviar={(arquivo) => atualizar(i, { imagemId: arquivo.id })}
              aoRemover={() => atualizar(i, { imagemId: undefined })}
            />
          )}
        </div>
      ))}

      <div>
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => aoMudar([...itens, { titulo: "" }])}
          disabled={itens.length >= max}
        >
          + Adicionar item
        </button>
        <span className="campo__ajuda" style={{ marginLeft: ".6rem" }}>
          {itens.length} de {max}
        </span>
      </div>
    </div>
  );
}

function Tema({
  valor,
  indice,
  aoMudar,
}: {
  valor: string;
  indice: number;
  aoMudar: (mudanca: Record<string, unknown>) => void;
}) {
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={`tema-${indice}`}>
        Fundo da seção
      </label>
      <select
        id={`tema-${indice}`}
        value={valor}
        onChange={(e) => aoMudar({ tema: e.target.value })}
      >
        {TEMAS.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.rotulo}
          </option>
        ))}
      </select>
    </div>
  );
}

function Imagem({
  indice,
  valor,
  aoMudar,
  obrigatorio = false,
}: {
  indice: number;
  valor?: string;
  aoMudar: (mudanca: Record<string, unknown>) => void;
  obrigatorio?: boolean;
}) {
  return (
    <CampoUpload
      nome={`imagem-${indice}`}
      rotulo="Imagem"
      publico
      obrigatorio={obrigatorio}
      valorInicial={
        valor
          ? {
              id: valor,
              url: urlArquivoPublico(valor),
              nome: "Imagem atual",
              mimeType: "image/*",
              tamanhoBytes: 0,
            }
          : null
      }
      aoEnviar={(arquivo) => aoMudar({ imagemId: arquivo.id })}
      aoRemover={() => aoMudar({ imagemId: undefined })}
    />
  );
}

function Texto({
  rotulo,
  valor,
  max,
  indice,
  campo,
  aoMudar,
  ajuda,
  obrigatorio,
}: {
  rotulo: string;
  valor: string;
  max: number;
  indice: number;
  campo: string;
  aoMudar: (mudanca: Record<string, unknown>) => void;
  ajuda?: string;
  obrigatorio?: boolean;
}) {
  const id = `${campo}-${indice}`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      <input
        id={id}
        type="text"
        maxLength={max}
        value={valor}
        onChange={(e) => aoMudar({ [campo]: e.target.value })}
      />
      {ajuda && <span className="campo__ajuda">{ajuda}</span>}
    </div>
  );
}

function Area({
  rotulo,
  valor,
  max,
  linhas = 3,
  indice,
  campo,
  aoMudar,
  ajuda,
  obrigatorio,
}: {
  rotulo: string;
  valor: string;
  max: number;
  linhas?: number;
  indice: number;
  campo: string;
  aoMudar: (mudanca: Record<string, unknown>) => void;
  ajuda?: string;
  obrigatorio?: boolean;
}) {
  const id = `${campo}-${indice}`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      <textarea
        id={id}
        rows={linhas}
        maxLength={max}
        value={valor}
        onChange={(e) => aoMudar({ [campo]: e.target.value })}
      />
      {ajuda && <span className="campo__ajuda">{ajuda}</span>}
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

/**
 * Criação de uma página nova.
 *
 * Fica neste arquivo por ser o mesmo assunto e pequeno demais para um
 * componente próprio. O slug é sugerido a partir do título, mas o usuário pode
 * ajustar — e o servidor revalida contra a lista de endereços reservados.
 */
export function FormularioNovaPagina() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string[]>>({});

  function mudarTitulo(valor: string) {
    setTitulo(valor);
    if (!slugEditado) setSlug(sugerirSlug(valor));
  }

  function criar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setCampos({});

    iniciar(async () => {
      const resultado = await criarPagina({ titulo, slug });
      if (resultado.ok && resultado.slug) {
        router.push(`/painel/paginas/${resultado.slug}`);
        return;
      }
      setCampos(resultado.campos ?? {});
      setErro(resultado.mensagem);
    });
  }

  return (
    <form onSubmit={criar} noValidate>
      {erro && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1rem" }}>
          {erro}
        </div>
      )}

      <div className="grid cols-2">
        <Campo rotulo="Título da página" nome="nova-titulo" erros={campos.titulo} obrigatorio>
          <input
            id="nova-titulo"
            type="text"
            maxLength={160}
            value={titulo}
            onChange={(e) => mudarTitulo(e.target.value)}
            placeholder="Quem somos"
          />
        </Campo>

        <Campo
          rotulo="Endereço"
          nome="nova-slug"
          erros={campos.slug}
          obrigatorio
          ajuda="Vira o endereço público da página. Não muda depois de criada."
        >
          <input
            id="nova-slug"
            type="text"
            maxLength={80}
            value={slug}
            spellCheck={false}
            onChange={(e) => {
              setSlugEditado(true);
              setSlug(e.target.value);
            }}
            placeholder="quem-somos"
          />
        </Campo>
      </div>

      <button type="submit" className="btn btn--sm" disabled={pendente}>
        {pendente ? "Criando…" : "Criar página"}
      </button>
    </form>
  );
}

/** Sugestão de slug no navegador. O servidor valida de novo, com regra própria. */
function sugerirSlug(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
