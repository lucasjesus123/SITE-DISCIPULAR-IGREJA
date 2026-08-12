import Link from "next/link";
import type { DadosSite } from "@/lib/services/site";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { urlMiniatura } from "@/lib/youtube/live";
import { formatarCnpj } from "@/lib/painel/formato";
import { horariosSemanais, proximosEventos, type ItemAgendaHome } from "@/lib/site/agenda-home";
import { FormWhatsAppInst } from "./FormWhatsAppInst";
import { PlayerMensagem } from "./PlayerMensagem";
import { HeroVideo } from "./HeroVideo";
import { RevelarAoRolar } from "./RevelarAoRolar";
import { CreditoConexao } from "@/components/CreditoConexao";

/**
 * Home Institucional — direção TECH/JOVEM: fundo animado, verde neon com glow,
 * glassmorphism e vídeo, alternando seções ESCURAS (mostram o fundo em
 * movimento) e CLARAS (opacas). Todo o conteúdo continua vindo do banco/CMS.
 * CSS em src/app/(site)/home-tech.css, escopado em `.tk`.
 */

interface Props {
  dados: DadosSite;
  live: { aoVivo: boolean; videoId: string | null; titulo: string | null };
  ultimaMsgVideoId: string | null;
  ultimaMsgTitulo: string | null;
  logoUrl: string | null;
  /** Vídeo do topo (config da igreja ou padrão do tenant-âncora). */
  heroVideoId?: string | null;
}

export function HomeInstitucional({ dados, live, ultimaMsgVideoId, ultimaMsgTitulo, logoUrl, heroVideoId = null }: Props) {
  const { config, campi } = dados;
  const bv = config.boasVindas;
  const sec = config.secoes;
  const nome = config.nomeExibicao || "Igreja";
  const logo = logoUrl;

  const fotoComunidade = config.fotoComunidadeId ? urlArquivoPublico(config.fotoComunidadeId) : null;
  const canalYoutube = config.youtube?.trim() || null;
  const msgVideoId = live.aoVivo && live.videoId ? live.videoId : ultimaMsgVideoId;
  const msgTitulo = live.aoVivo && live.titulo ? live.titulo : ultimaMsgTitulo?.trim() || "A fé que move montanhas";
  const heroImagem = config.heroImagemId ? urlArquivoPublico(config.heroImagemId) : null;
  const pixDisplay = formatarCnpj(config.pixChave) ?? config.pixChave;
  const thumb = live.aoVivo && live.videoId ? urlMiniatura(live.videoId) : ultimaMsgVideoId ? urlMiniatura(ultimaMsgVideoId) : null;
  const linkVivo = canalYoutube ?? "#mensagem";
  // Vídeo do topo: ao vivo tem prioridade; senão o vídeo definido no painel;
  // senão a última mensagem. Toca embutido (HeroVideo).
  const heroVid = live.aoVivo && live.videoId ? live.videoId : heroVideoId ?? ultimaMsgVideoId;
  const heroThumb = heroVid ? urlMiniatura(heroVid) : null;
  // Botão 1 do hero: link vazio = destino dinâmico (ao vivo). Externo abre em nova aba.
  const heroB1 = sec.heroBtn1Link || linkVivo;
  const heroB1Ext = /^https?:/.test(heroB1);

  const campusPrincipal = campi[0];
  const endereco = campusPrincipal
    ? [campusPrincipal.logradouro, campusPrincipal.numero].filter(Boolean).join(", ") +
      (campusPrincipal.bairro ? ` — ${campusPrincipal.bairro}` : "") +
      (campusPrincipal.cidade ? `, ${campusPrincipal.cidade}` : "") +
      (campusPrincipal.uf ? `/${campusPrincipal.uf}` : "")
    : "Rua da Igreja, 100 — Centro";
  const telefone = config.telefoneContato ?? campusPrincipal?.telefone ?? "(00) 90000-0000";
  const email = config.emailContato ?? "";
  const mapaBusca = encodeURIComponent(`${nome} ${endereco}`);
  const mapaEmbedSrc =
    campusPrincipal?.mapaEmbedUrl && /^https:\/\/(www\.)?google\.com\/maps\/embed/.test(campusPrincipal.mapaEmbedUrl)
      ? campusPrincipal.mapaEmbedUrl
      : `https://maps.google.com/maps?q=${mapaBusca}&z=15&output=embed`;

  const itensAgenda: ItemAgendaHome[] = (dados.agenda ?? []).map((a) => ({
    tipo: a.tipo, titulo: a.titulo, descricao: a.descricao,
    diaSemana: a.diaSemana, horario: a.horario,
    dataHoraMs: a.dataHora ? new Date(a.dataHora).getTime() : null,
  }));
  const horariosDin = horariosSemanais(itensAgenda);
  const horarios = horariosDin.length > 0 ? horariosDin : [
    { dia: "Domingo", hora: "19h00", titulo: "Celebração da Família" },
    { dia: "Quinta", hora: "20h00", titulo: "Trilha do Discípulo" },
    { dia: "Sábado", hora: "20h00", titulo: "Culto de Jovens" },
  ];
  const eventosDin = proximosEventos(itensAgenda, Date.now());
  const eventos = eventosDin.length > 0 ? eventosDin : [
    { dia: "—", mes: "", titulo: "Nenhum evento agendado", sub: "Volte em breve" },
  ];

  // Ticker: rótulos + nomes dos ministérios da igreja.
  const ticker = ["Adoração", ...config.ministerios.map((m) => m.titulo), "Ao vivo", "Batismo", "Células", "Kids", "Jovens"];
  const heroCulto = horarios[0];

  const Marca = ({ classe = "tk-brand" }: { classe?: string }) => (
    <Link href="/" className={classe}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={nome} className="tk-brand__logo" />
      ) : (
        <><span className="tk-brand__mk">{nome.charAt(0)}</span>{nome}</>
      )}
    </Link>
  );

  return (
    <div className="tk">
      <RevelarAoRolar />

      {/* FUNDO ANIMADO */}
      <div className="tk-bg" aria-hidden="true">
        <div className="tk-bg__grid" />
        <span className="tk-orb a" /><span className="tk-orb b" /><span className="tk-orb c" />
      </div>

      {/* NAV */}
      <nav className="tk-nav"><div className="wrap">
        <Marca />
        <ul className="tk-menu">
          {sec.menu.map((m, i) => (<li key={i}><a href={m.href}>{m.label}</a></li>))}
        </ul>
        <div className="tk-nav__cta">
          <a href={linkVivo} target={canalYoutube ? "_blank" : undefined} rel={canalYoutube ? "noopener noreferrer" : undefined} className="tk-live"><span className="tk-dot" />Ao vivo</a>
          <Link href="/app" className="tk-btn tk-btn--verde">Baixar o app</Link>
        </div>
      </div></nav>

      {/* HERO */}
      <header className="tk-hero" id="inicio">
        <div className="wrap">
          <div>
            <span className="tk-tag"><span className="tk-dot" />{config.heroEyebrow || "Casa de Discípulos"}</span>
            <h1>{config.heroTitulo ? config.heroTitulo : <>A fé que <span className="gr">move</span> a sua geração.</>}</h1>
            <p>{config.heroSubtitulo ?? config.tagline ?? "Uma igreja viva, jovem e conectada. Assista aos cultos ao vivo, entre numa célula e viva algo real — presencialmente ou pelo app."}</p>
            <div className="tk-acts">
              <a href={heroB1} target={heroB1Ext ? "_blank" : undefined} rel={heroB1Ext ? "noopener noreferrer" : undefined} className="tk-btn tk-btn--verde">{sec.heroBtn1Texto}</a>
              <Link href={sec.heroBtn2Link || "/app"} className="tk-btn tk-btn--glass">{sec.heroBtn2Texto}</Link>
            </div>
            <div className="tk-verse">{bv.versiculo}</div>
          </div>
          <HeroVideo
            videoId={heroVid}
            thumb={heroThumb}
            aoVivo={live.aoVivo}
            titulo={msgTitulo}
            sub={heroCulto ? `${heroCulto.dia} · ${heroCulto.hora} · toque para assistir` : "Toque para assistir"}
            hrefFallback={linkVivo}
          />
        </div>
      </header>

      {/* MARQUEE */}
      <div className="tk-mq" aria-hidden="true"><div className="tk-mq__row">
        {[...ticker, ...ticker].map((t, i) => (
          <span key={i} className={i % 2 ? "g" : ""}>{t}<span className="s">&nbsp;&nbsp;/&nbsp;&nbsp;</span></span>
        ))}
      </div></div>

      {/* HORÁRIOS (bem definidos) */}
      <section className="tk-sec" id="horarios"><div className="wrap">
        <div className="tk-head"><span className="tk-tag">Programe-se</span><h2>Horários dos <span className="gr">encontros</span></h2><p className="tk-lead">Toda semana, a casa aberta pra você.</p></div>
        <div className="tk-hgrid">
          {horarios.map((h, i) => (
            <div className="tk-hcard" key={i}>
              <div className="dia">{h.dia}</div>
              <div className="hora">{h.hora}</div>
              <div className="nome">{h.titulo}</div>
            </div>
          ))}
        </div>
      </div></section>

      {/* NOVO (CLARO) */}
      <section className="tk-sec tk-sec--light tk-novo" id="novo"><div className="wrap"><div className="grid">
        <div>
          <span className="tk-tag">Novo por aqui</span>
          <h2>{bv.titulo}</h2>
          <p className="tk-lead">{bv.lead}</p>
          <div className="tk-expect">
            {bv.cards.map((c, i) => (
              <div className="tk-ex" key={i}>
                <div className="n">{String(i + 1).padStart(2, "0")}</div>
                <div><b>{c.titulo}</b><p>{c.texto}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="tk-artcard" style={fotoComunidade ? { backgroundImage: `linear-gradient(180deg, rgba(10,22,16,.25), rgba(10,22,16,.9)), url(${fotoComunidade})` } : undefined}>
          <div className="q">{bv.frase}</div>
          <div className="sig">Bem-vindo à família</div>
        </div>
      </div></div></section>

      {/* MENSAGEM (ESCURO) */}
      <section className="tk-sec tk-msg" id="mensagem"><div className="wrap"><div className="grid">
        <PlayerMensagem videoId={msgVideoId} thumb={thumb ?? fotoComunidade ?? heroImagem} aoVivo={live.aoVivo} hrefFallback={linkVivo} />
        <div>
          <span className="tk-tag">Última mensagem</span>
          <h2>{msgTitulo}</h2>
          <p className="tk-lead">{sec.mensagemLead}</p>
          <div className="tk-acts" style={{ marginTop: 22 }}><Link href={sec.mensagemBtnLink || "/mensagens"} className="tk-btn tk-btn--verde">{sec.mensagemBtnTexto}</Link></div>
        </div>
      </div></div></section>

      {/* APP (ESCURO) */}
      <section className="tk-sec tk-app" id="app"><div className="wrap"><div className="grid">
        <div>
          <span className="tk-tag">No seu bolso</span>
          <h2>{sec.appTitulo ? sec.appTitulo : <>A igreja <span className="gr">na palma</span> da mão.</>}</h2>
          <p className="tk-lead">{sec.appLead}</p>
          <ul className="tk-feats">
            {sec.appRecursos.map((r, i) => (<li key={i}><span className="ck">✓</span>{r}</li>))}
          </ul>
          <div className="tk-acts"><Link href={sec.appBtnLink || "/app"} className="tk-btn tk-btn--verde">{sec.appBtnTexto}</Link></div>
        </div>
        <div className="tk-phone"><div className="tk-phone__glow" /><div className="tk-phone__ui">
          <div className="hi">Paz! 👋</div><div className="t">Início</div>
          <div className="bn" /><div className="tl"><i /><i /><i /><i /></div>
        </div></div>
      </div></div></section>

      {/* MINISTÉRIOS (CLARO) */}
      <section className="tk-sec tk-sec--light2" id="minis"><div className="wrap">
        <div className="tk-head"><span className="tk-tag">Faça parte</span><h2>{sec.minisTitulo}</h2><p className="tk-lead">{sec.minisLead}</p></div>
        <div className="tk-grid3">
          {config.ministerios.map((m, i) => (
            <div className="tk-card" key={i}>
              <div className="tk-card__ic">{m.icone || m.titulo.charAt(0)}</div>
              <h3>{m.titulo}</h3>
              <p>{m.descricao}</p>
              <Link href={sec.minisBtnLink || "/quem-somos"} className="tk-card__go">{sec.minisBtnTexto}</Link>
            </div>
          ))}
        </div>
      </div></section>

      {/* PASSOS (ESCURO) */}
      <section className="tk-sec" id="passos"><div className="wrap">
        <div className="tk-head"><span className="tk-tag">Cresça na fé</span><h2>{sec.passosTitulo} <span className="gr"></span></h2><p className="tk-lead">{sec.passosLead}</p></div>
        <div className="tk-steps">
          {sec.passos.map((p, i) => (
            <div className="tk-st" key={i}><div className="n">{String(i + 1).padStart(2, "0")}</div><b>{p.titulo}</b><small>{p.texto}</small></div>
          ))}
        </div>
      </div></section>

      {/* CÉLULAS (FAIXA) */}
      <section className="tk-band"><div className="wrap">
        <div><h2>{sec.celulasTitulo}</h2><p>{sec.celulasTexto}</p></div>
        <Link href={sec.celulasBtnLink || "/celulas"} className="tk-btn tk-btn--glass" style={{ background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>{sec.celulasBtnTexto}</Link>
      </div></section>

      {/* DEPOIMENTOS (CLARO) */}
      <section className="tk-sec tk-sec--light"><div className="wrap">
        <div className="tk-head"><span className="tk-tag">Vidas transformadas</span><h2>{sec.depoimentosTitulo}</h2></div>
        <div className="tk-grid3">
          {config.depoimentos.map((d, i) => (
            <div className="tk-card" key={i}>
              <div className="tk-card__ic" style={{ fontFamily: "var(--disp)", fontWeight: 700 }}>”</div>
              <p style={{ fontSize: 15, color: "var(--tk-tinta)" }}>{d.texto}</p>
              <div style={{ marginTop: 8, fontFamily: "var(--disp)", fontWeight: 700, color: "var(--tk-tinta)" }}>{d.nome}</div>
              <small style={{ color: "var(--tk-tinta-suave)" }}>{d.papel}</small>
            </div>
          ))}
        </div>
      </div></section>

      {/* CONTRIBUA (ESCURO) */}
      <section className="tk-sec tk-give" id="give"><div className="wrap">
        <div style={{ maxWidth: 460 }}><span className="tk-tag">Generosidade</span><h2>{sec.contribuaTitulo}</h2><p className="tk-lead">{sec.contribuaTexto}</p></div>
        <div className="tk-pix">
          <div className="l">Chave PIX{pixDisplay?.includes("/") ? " · CNPJ" : ""}</div>
          <div className="k">{pixDisplay ?? "Configure a chave PIX no painel"}</div>
          <Link href={sec.contribuaBtnLink || "/contribua"} className="tk-btn tk-btn--verde">{sec.contribuaBtnTexto}</Link>
        </div>
      </div></section>

      {/* AGENDA (CLARO) */}
      <section className="tk-sec tk-sec--light2" id="agenda"><div className="wrap">
        <div className="tk-head"><span className="tk-tag">Programe-se</span><h2>{sec.agendaTitulo}</h2></div>
        <div className="tk-grid3">
          {eventos.map((ev, i) => (
            <Link className="tk-card" href="/agenda" key={i}>
              <div className="tk-card__ic" style={{ fontFamily: "var(--disp)", fontWeight: 700, fontSize: 18 }}>{ev.dia}{ev.mes ? `/${ev.mes}` : ""}</div>
              <h3 style={{ fontSize: 20 }}>{ev.titulo}</h3>
              <p>{ev.sub}</p>
              <span className="tk-card__go">Ver na agenda →</span>
            </Link>
          ))}
        </div>
      </div></section>

      {/* ORAÇÃO (FAIXA) */}
      <section className="tk-band" style={{ background: "linear-gradient(120deg,#0d3324,#0a1610)" }}><div className="wrap">
        <div><h2>{sec.oracaoTitulo}</h2><p>{sec.oracaoLead}</p></div>
        <Link href={sec.oracaoBtnLink || "/oracao"} className="tk-btn tk-btn--verde">{sec.oracaoBtnTexto}</Link>
      </div></section>

      {/* CONTATO (CLARO) */}
      <section className="tk-sec tk-sec--light tk-contato" id="contato"><div className="wrap"><div className="grid">
        <div>
          <span className="tk-tag">Fale conosco</span>
          <h2>{sec.contatoTitulo}</h2>
          <p className="tk-lead" style={{ marginBottom: 18 }}>{sec.contatoLead}</p>
          <p className="info">📍 {endereco}<br />📞 {telefone}{email && <><br />✉ {email}</>}</p>
          {campusPrincipal && (
            <div className="tk-map"><iframe title="Localização no Google Maps" src={mapaEmbedSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen /></div>
          )}
        </div>
        <FormWhatsAppInst numero={config.whatsapp} />
      </div></div></section>

      {/* NEWSLETTER (ESCURO) */}
      <section className="tk-sec" style={{ textAlign: "center" }}><div className="wrap">
        <div className="tk-head" style={{ margin: "0 auto 18px" }}><span className="tk-tag">Fique por dentro</span><h2>{sec.newsletterTitulo}</h2><p className="tk-lead" style={{ margin: "0 auto" }}>{sec.newsletterTexto}</p></div>
        <form className="tk-acts" action="/contato" style={{ justifyContent: "center", marginTop: 20 }}>
          <input name="email" type="email" placeholder="seu@email.com" style={{ background: "var(--tk-glass)", border: "1px solid var(--tk-linha)", borderRadius: 14, height: 52, padding: "0 18px", color: "#fff", minWidth: 240, fontFamily: "inherit" }} />
          <button type="submit" className="tk-btn tk-btn--verde">Inscrever</button>
        </form>
      </div></section>

      {/* FOOTER */}
      <footer className="tk-foot"><div className="wrap">
        <div className="tk-foot__top">
          <Marca classe="tk-brand" />
          <div className="tk-foot__cols">
            <div><h4>Igreja</h4><a href="#novo">Novo por aqui</a><a href="#minis">Ministérios</a><a href="#agenda">Agenda</a></div>
            <div><h4>Participe</h4><a href="#mensagem">Mensagens</a><a href="#give">Contribua</a><a href="#passos">Próximos passos</a></div>
            <div><h4>Redes</h4>
              {config.instagram && <a href={config.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
              {config.youtube && <a href={config.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>}
              {config.whatsapp && <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            </div>
          </div>
        </div>
        <div className="tk-foot__copy">
          <span className="tk-foot__cred">© 2026 {nome}. Todos os direitos reservados. · <CreditoConexao /></span>
          <Link href="/login" className="tk-foot__login">Entrar no sistema →</Link>
        </div>
      </div></footer>
    </div>
  );
}
