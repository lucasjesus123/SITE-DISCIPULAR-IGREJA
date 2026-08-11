"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarConfigSite } from "@/app/painel/site/acoes";
import { CampoUpload, type ArquivoEnviado } from "@/components/painel/CampoUpload";

export interface DadosSiteForm {
  nomeExibicao: string;
  tagline: string;
  descricaoSeo: string;
  corAcento: string;
  corAcentoClara: string;
  corTinta: string;
  corPapel: string;
  fonteTitulo: string;
  fonteTexto: string;
  heroEyebrow: string;
  heroTitulo: string;
  heroSubtitulo: string;
  heroCtaTexto: string;
  heroCtaLink: string;
  heroImagemId: string;
  fundoImagemId: string;
  fotoPastorId: string;
  fotoPastoraId: string;
  fotoComunidadeId: string;
  emailContato: string;
  telefoneContato: string;
  whatsapp: string;
  instagram: string;
  facebook: string;
  youtube: string;
  spotify: string;
  pixChave: string;
  pixTitular: string;
  pixDescricao: string;
  pwaNome: string;
  pwaNomeCurto: string;
  pwaCorTema: string;
}

/**
 * Editor whitelabel com prévia ao vivo das cores.
 *
 * A prévia usa as cores diretamente num `style` inline do React — e o React
 * trata valores de style como dados, não como CSS bruto, então mesmo um valor
 * inválido digitado aqui não escapa para a folha de estilo. A validação de
 * verdade continua sendo a do servidor.
 */
export function EditorSite({
  inicial,
  fontes,
  heroImagemInicial,
  fundoImagemInicial,
  fotoPastorInicial,
  fotoPastoraInicial,
  fotoComunidadeInicial,
}: {
  inicial: DadosSiteForm;
  fontes: string[];
  heroImagemInicial?: ArquivoEnviado | null;
  fundoImagemInicial?: ArquivoEnviado | null;
  fotoPastorInicial?: ArquivoEnviado | null;
  fotoPastoraInicial?: ArquivoEnviado | null;
  fotoComunidadeInicial?: ArquivoEnviado | null;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [dados, setDados] = useState<DadosSiteForm>(inicial);
  const [bancarios, setBancarios] = useState("");
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [erros, setErros] = useState<Record<string, string[]>>({});

  function campo<K extends keyof DadosSiteForm>(chave: K) {
    return {
      value: dados[chave],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setDados((d) => ({ ...d, [chave]: e.target.value })),
    };
  }

  function salvar() {
    setFeedback(null);
    setErros({});

    iniciar(async () => {
      const r = await salvarConfigSite({
        ...dados,
        // Campo em branco = não alterar. Assim salvar o formulário não apaga
        // o que já estava gravado.
        dadosBancarios: bancarios || undefined,
      });

      setFeedback({ tipo: r.ok ? "ok" : "erro", texto: r.mensagem });
      if (r.campos) setErros(r.campos);
      if (r.ok) {
        setBancarios("");
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: "1.5rem", alignItems: "start" }}>
      <div>
        {feedback && (
          <div
            className={`alerta alerta--${feedback.tipo === "ok" ? "sucesso" : "erro"}`}
            role="alert"
            style={{ marginBottom: "1.5rem" }}
          >
            {feedback.texto}
          </div>
        )}

        <Secao titulo="Identidade" desc="Nome e descrição usados no site, no app e nos buscadores.">
          <Texto rotulo="Nome da igreja" erro={erros.nomeExibicao} {...campo("nomeExibicao")} maxLength={120} obrigatorio />
          <Texto rotulo="Frase de apresentação" erro={erros.tagline} {...campo("tagline")} maxLength={200} />
          <AreaTexto
            rotulo="Descrição para buscadores"
            erro={erros.descricaoSeo}
            {...campo("descricaoSeo")}
            maxLength={300}
            ajuda="Aparece no Google abaixo do título. Até 300 caracteres."
          />
        </Secao>

        <Secao titulo="Cores" desc="Mude estas quatro cores e o site inteiro se ajusta.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: "1rem" }}>
            <Cor rotulo="Cor de destaque" erro={erros.corAcento} {...campo("corAcento")} />
            <Cor rotulo="Destaque claro" erro={erros.corAcentoClara} {...campo("corAcentoClara")} />
            <Cor rotulo="Fundo escuro" erro={erros.corTinta} {...campo("corTinta")} />
            <Cor rotulo="Fundo claro" erro={erros.corPapel} {...campo("corPapel")} />
          </div>
        </Secao>

        <Secao titulo="Fontes" desc="Escolhidas de uma lista testada para leitura em tela.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Selecao rotulo="Fonte dos títulos" opcoes={fontes} erro={erros.fonteTitulo} {...campo("fonteTitulo")} />
            <Selecao rotulo="Fonte dos textos" opcoes={fontes} erro={erros.fonteTexto} {...campo("fonteTexto")} />
          </div>
        </Secao>

        <Secao titulo="Destaque da página inicial" desc="A primeira coisa que o visitante vê.">
          <Texto rotulo="Texto pequeno acima do título" {...campo("heroEyebrow")} maxLength={80} />
          <Texto rotulo="Título" {...campo("heroTitulo")} maxLength={200} />
          <AreaTexto rotulo="Subtítulo" {...campo("heroSubtitulo")} maxLength={400} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Texto rotulo="Texto do botão" {...campo("heroCtaTexto")} maxLength={60} />
            <Texto rotulo="Link do botão" {...campo("heroCtaLink")} maxLength={200} ajuda="Ex.: /quem-somos" />
          </div>
          <CampoUpload
            nome="heroImagemId"
            rotulo="Imagem de fundo da capa"
            publico
            valorInicial={heroImagemInicial ?? null}
            ajuda="Foto que aparece atrás do título, no topo do site. Ideal: larga (16:9), JPG/PNG/WEBP. Fotos escuras funcionam melhor."
            aoEnviar={(a) => setDados((d) => ({ ...d, heroImagemId: a.id }))}
            aoRemover={() => setDados((d) => ({ ...d, heroImagemId: "" }))}
          />
          <CampoUpload
            nome="fundoImagemId"
            rotulo="Imagem de fundo do site (bem transparente)"
            publico
            valorInicial={fundoImagemInicial ?? null}
            ajuda="Foto exibida bem apagada atrás de todo o site, como textura. Fotos de louvor/congregação ficam ótimas. Deixe vazio para não usar."
            aoEnviar={(a) => setDados((d) => ({ ...d, fundoImagemId: a.id }))}
            aoRemover={() => setDados((d) => ({ ...d, fundoImagemId: "" }))}
          />
          <CampoUpload
            nome="fotoComunidadeId"
            rotulo="Foto da comunidade (card “Você foi feito para fazer parte”)"
            publico
            valorInicial={fotoComunidadeInicial ?? null}
            ajuda="Foto da igreja reunida (louvor, congregação). Aparece no card ao lado do “Novo por aqui” na home. Deixe vazio para usar o fundo padrão."
            aoEnviar={(a) => setDados((d) => ({ ...d, fotoComunidadeId: a.id }))}
            aoRemover={() => setDados((d) => ({ ...d, fotoComunidadeId: "" }))}
          />
        </Secao>

        <Secao titulo="Fotos dos pastores" desc="Aparecem na home e na página Pastores, no lugar dos placeholders.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <CampoUpload
              nome="fotoPastorId"
              rotulo="Foto do Pastor (Tiago)"
              publico
              valorInicial={fotoPastorInicial ?? null}
              ajuda="Retrato em pé (vertical) fica melhor."
              aoEnviar={(a) => setDados((d) => ({ ...d, fotoPastorId: a.id }))}
              aoRemover={() => setDados((d) => ({ ...d, fotoPastorId: "" }))}
            />
            <CampoUpload
              nome="fotoPastoraId"
              rotulo="Foto da Pastora (Cássia)"
              publico
              valorInicial={fotoPastoraInicial ?? null}
              ajuda="Retrato em pé (vertical) fica melhor."
              aoEnviar={(a) => setDados((d) => ({ ...d, fotoPastoraId: a.id }))}
              aoRemover={() => setDados((d) => ({ ...d, fotoPastoraId: "" }))}
            />
          </div>
        </Secao>

        <Secao titulo="Contato" desc="Aparece no rodapé e na página de contato.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Texto rotulo="E-mail" tipo="email" erro={erros.emailContato} {...campo("emailContato")} maxLength={254} />
            <Texto rotulo="Telefone" tipo="tel" erro={erros.telefoneContato} {...campo("telefoneContato")} maxLength={20} />
          </div>
          <Texto rotulo="WhatsApp" tipo="tel" erro={erros.whatsapp} {...campo("whatsapp")} maxLength={20} ajuda="Só números, com DDD." />
        </Secao>

        <Secao titulo="Redes sociais" desc="Endereços completos, começando com https://">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Texto rotulo="Instagram" erro={erros.instagram} {...campo("instagram")} maxLength={200} />
            <Texto rotulo="YouTube" erro={erros.youtube} {...campo("youtube")} maxLength={200} />
            <Texto rotulo="Facebook" erro={erros.facebook} {...campo("facebook")} maxLength={200} />
            <Texto rotulo="Spotify" erro={erros.spotify} {...campo("spotify")} maxLength={200} />
          </div>
        </Secao>

        <Secao titulo="Contribuição" desc="Chave PIX e dados para as ofertas.">
          <Texto rotulo="Chave PIX" {...campo("pixChave")} maxLength={200} ajuda="Publicada no site — use a chave institucional da igreja (CNPJ)." />
          <Texto rotulo="Titular da chave" {...campo("pixTitular")} maxLength={160} />
          <AreaTexto rotulo="Texto sobre contribuir" {...campo("pixDescricao")} maxLength={1000} />

          <div className="campo">
            <label className="campo__rotulo" htmlFor="bancarios">
              Dados bancários completos
            </label>
            <textarea
              id="bancarios"
              value={bancarios}
              onChange={(e) => setBancarios(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Banco, agência, conta, titular…"
            />
            <p className="campo__ajuda">
              Guardado criptografado e <strong>não publicado no site</strong>. Deixe em branco para
              manter o que já está salvo.
            </p>
          </div>
        </Secao>

        <Secao titulo="Aplicativo" desc="Como o app aparece na tela inicial do celular.">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <Texto rotulo="Nome do app" {...campo("pwaNome")} maxLength={60} />
            <Texto rotulo="Nome curto (ícone)" {...campo("pwaNomeCurto")} maxLength={20} ajuda="Até 12 caracteres funcionam melhor." />
          </div>
          <Cor rotulo="Cor da barra do app" {...campo("pwaCorTema")} />
        </Secao>

        <button type="button" className="btn btn--lg" onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>

      {/* ------------------------------------------------------------ PRÉVIA */}
      <aside style={{ position: "sticky", top: "1.5rem" }}>
        <div className="secao-painel" style={{ marginBottom: 0, padding: 0, overflow: "hidden" }}>
          <p className="cartao__rotulo" style={{ padding: "1rem 1rem 0" }}>
            Prévia
          </p>

          <div style={{ padding: "1.6rem 1.2rem", background: dados.corTinta, color: "#F5F1E8", marginTop: ".8rem" }}>
            <p
              style={{
                fontSize: ".64rem",
                letterSpacing: ".22em",
                textTransform: "uppercase",
                color: dados.corAcento,
                fontWeight: 600,
              }}
            >
              {dados.heroEyebrow || "Seja bem-vindo"}
            </p>
            <p
              style={{
                fontFamily: `"${dados.fonteTitulo}", Georgia, serif`,
                fontSize: "1.7rem",
                lineHeight: 1.05,
                marginTop: ".7rem",
              }}
            >
              {dados.heroTitulo || dados.nomeExibicao || "Nome da igreja"}
            </p>
            <p style={{ fontSize: ".82rem", opacity: 0.72, marginTop: ".7rem", fontFamily: `"${dados.fonteTexto}", sans-serif` }}>
              {dados.heroSubtitulo || dados.tagline || "Uma casa de discípulos."}
            </p>
            <span
              style={{
                display: "inline-block",
                marginTop: "1.2rem",
                padding: ".6em 1.3em",
                background: dados.corAcento,
                color: dados.corTinta,
                borderRadius: 100,
                fontSize: ".7rem",
                fontWeight: 600,
                letterSpacing: ".1em",
                textTransform: "uppercase",
              }}
            >
              {dados.heroCtaTexto || "Conheça mais"}
            </span>
          </div>

          <div style={{ padding: "1.4rem 1.2rem", background: dados.corPapel, color: "#14171E" }}>
            <p style={{ fontFamily: `"${dados.fonteTitulo}", Georgia, serif`, fontSize: "1.15rem" }}>
              Uma casa de discípulos.
            </p>
            <p style={{ fontSize: ".8rem", opacity: 0.66, marginTop: ".5rem", fontFamily: `"${dados.fonteTexto}", sans-serif` }}>
              Assim o texto vai aparecer nas seções claras do site.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Secao({ titulo, desc, children }: { titulo: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="secao-painel">
      <h2 className="secao-painel__titulo">{titulo}</h2>
      <p className="secao-painel__desc">{desc}</p>
      <div className="stack" style={{ "--flow": "1.2rem" } as React.CSSProperties}>
        {children}
      </div>
    </section>
  );
}

function Texto({
  rotulo,
  tipo = "text",
  ajuda,
  erro,
  obrigatorio,
  ...resto
}: {
  rotulo: string;
  tipo?: string;
  ajuda?: string;
  erro?: string[];
  obrigatorio?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `campo-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
        {obrigatorio && <span className="obrigatorio">*</span>}
      </label>
      <input id={id} type={tipo} aria-invalid={erro ? true : undefined} {...resto} />
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
      {erro?.[0] && (
        <p className="campo__erro" role="alert">
          {erro[0]}
        </p>
      )}
    </div>
  );
}

function AreaTexto({
  rotulo,
  ajuda,
  erro,
  ...resto
}: { rotulo: string; ajuda?: string; erro?: string[] } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = `campo-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <textarea id={id} rows={3} aria-invalid={erro ? true : undefined} {...resto} />
      {ajuda && <p className="campo__ajuda">{ajuda}</p>}
      {erro?.[0] && (
        <p className="campo__erro" role="alert">
          {erro[0]}
        </p>
      )}
    </div>
  );
}

function Cor({
  rotulo,
  erro,
  value,
  onChange,
}: {
  rotulo: string;
  erro?: string[];
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = `cor-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <div style={{ display: "flex", gap: ".6rem", alignItems: "center" }}>
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
          onChange={onChange}
          style={{ width: 44, height: 42, padding: 2, border: "1px solid var(--line-on-light)", borderRadius: 4, flex: "none" }}
          aria-label={`${rotulo} — seletor`}
        />
        <input id={id} type="text" value={value} onChange={onChange} maxLength={9} spellCheck={false} />
      </div>
      {erro?.[0] && (
        <p className="campo__erro" role="alert">
          {erro[0]}
        </p>
      )}
    </div>
  );
}

function Selecao({
  rotulo,
  opcoes,
  erro,
  ...resto
}: { rotulo: string; opcoes: string[]; erro?: string[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  const id = `sel-${rotulo.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="campo">
      <label className="campo__rotulo" htmlFor={id}>
        {rotulo}
      </label>
      <select id={id} {...resto}>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {erro?.[0] && (
        <p className="campo__erro" role="alert">
          {erro[0]}
        </p>
      )}
    </div>
  );
}
