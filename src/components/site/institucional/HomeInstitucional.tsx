import Link from "next/link";
import type { DadosSite } from "@/lib/services/site";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { urlMiniatura } from "@/lib/youtube/live";
import { formatarCnpj } from "@/lib/painel/formato";
import { FormWhatsAppInst } from "./FormWhatsAppInst";

/**
 * Home Institucional (Direção 3 — grafite + verde). Porte fiel do design
 * aprovado, com os campos editáveis vindos do banco (hero, PIX, YouTube,
 * WhatsApp, endereço). CSS em src/app/(site)/institucional.css, escopado sob
 * `.inst-site` para não afetar os outros tenants.
 *
 * Nenhum azul, nenhum emoji nos ícones de conteúdo: os ícones são SVG de traço
 * grafite (herdam --ink), exatamente como na referência.
 */

interface Props {
  dados: DadosSite;
  live: { aoVivo: boolean; videoId: string | null; titulo: string | null };
  ultimaMsgVideoId: string | null;
}

export function HomeInstitucional({ dados, live, ultimaMsgVideoId }: Props) {
  const { config, campi } = dados;
  const nome = config.nomeExibicao || "Discipular";
  // Logo do topo: o que a igreja enviou no painel, ou a marca oficial da
  // Discipular (esta home só roda para o tenant-âncora).
  const logo = config.logoClaroId ? urlArquivoPublico(config.logoClaroId) : "/marca/logo-white.png";
  const heroImagem = config.heroImagemId ? urlArquivoPublico(config.heroImagemId) : null;
  const pixDisplay = formatarCnpj(config.pixChave) ?? config.pixChave;
  const thumb = live.aoVivo && live.videoId ? urlMiniatura(live.videoId) : ultimaMsgVideoId ? urlMiniatura(ultimaMsgVideoId) : null;
  const linkMensagens = config.youtube ?? "/mensagens";

  const campusPrincipal = campi[0];
  const endereco = campusPrincipal
    ? [campusPrincipal.logradouro, campusPrincipal.numero].filter(Boolean).join(", ") +
      (campusPrincipal.bairro ? ` — ${campusPrincipal.bairro}` : "") +
      (campusPrincipal.cidade ? `, ${campusPrincipal.cidade}` : "") +
      (campusPrincipal.uf ? `/${campusPrincipal.uf}` : "")
    : "Rua da Igreja, 100 — Centro";
  const telefone = config.telefoneContato ?? campusPrincipal?.telefone ?? "(00) 90000-0000";
  const email = config.emailContato ?? "contato@discipular.com.br";
  const mapaBusca = encodeURIComponent(`${nome} ${endereco}`);

  return (
    <div className="inst-site">
      {/* NAV */}
      <nav className="nav"><div className="wrap">
        <Link href="/" className="brand">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={nome} className="brand__logo" />
          ) : (
            <>
              <div className="logo">D</div>
              <b>{nome}</b>
            </>
          )}
        </Link>
        <ul className="menu">
          <li><a href="#novo">Novo por aqui</a></li>
          <li><a href="#mensagem">Mensagens</a></li>
          <li><a href="#minis">Ministérios</a></li>
          <li><a href="#app">App</a></li>
          <li><a href="#passos">Próximos Passos</a></li>
          <li><a href="#give">Contribua</a></li>
          <li><a href="#agenda">Agenda</a></li>
        </ul>
        <div className="nav-cta">
          {/* "Acesse o App" sai do topo: já existe o item "App" no menu e a seção
              dedicada. Mantemos só o AO VIVO, que é ação de urgência. */}
          <a href="#mensagem" className="live-btn"><span className="dot" />AO VIVO</a>
        </div>
      </div></nav>

      {/* HERO */}
      <header className="hero" id="inicio">
        {heroImagem && <div className="hero-photo" style={{ backgroundImage: `url(${heroImagem})` }} />}
        <div className="hero-overlay" />
        <div className="wrap">
          <a href="#novo" className="chip">✦ <b>Novo por aqui?</b> Planeje sua primeira visita →</a>
          <h1>{config.heroTitulo ? config.heroTitulo : <>Um lugar para<br /><span>pertencer</span> e crescer</>}</h1>
          <p>{config.heroSubtitulo ?? config.tagline ?? "Uma igreja viva, acolhedora e comprometida com Jesus. Venha adorar com a gente — presencialmente, no site ou pelo nosso app."}</p>
          <div className="cta">
            <Link href="/app" className="btn pri">Acesse o app da igreja</Link>
            <a href="#mensagem" className="btn gh">▶ Assista ao vivo</a>
          </div>
          <div className="hero-verse">&ldquo;Alegrei-me quando me disseram: Vamos à casa do Senhor.&rdquo; — Salmos 122:1</div>
        </div>
      </header>

      {/* HORÁRIOS */}
      <section className="horarios"><div className="wrap">
        <div className="hcard"><div className="d">Domingo</div><div className="h">18h00</div><div className="n">Culto da Família</div></div>
        <div className="hcard"><div className="d">Quarta</div><div className="h">20h00</div><div className="n">Culto de Ensino</div></div>
        <div className="hcard"><div className="d">Sexta</div><div className="h">20h00</div><div className="n">Noite de Louvor</div></div>
      </div></section>

      {/* NOVO POR AQUI */}
      <section className="sec novo" id="novo"><div className="wrap"><div className="grid">
        <div>
          <div className="eyebrow">Novo por aqui</div>
          <h2>Sua primeira vez? Relaxa.</h2>
          <p className="lead" style={{ marginBottom: 22 }}>A gente preparou tudo pra você se sentir em casa desde o primeiro momento. Veja o que esperar:</p>
          <div className="expect">
            <div className="ex"><div className="i"><IcoCoracao /></div><b>Acolhimento</b><p>Nossa equipe te recebe e acompanha na chegada.</p></div>
            <div className="ex"><div className="i"><IcoRelogio /></div><b>Duração</b><p>Os cultos duram cerca de 1h30.</p></div>
            <div className="ex"><div className="i"><IcoCamiseta /></div><b>Vestimenta</b><p>Venha como estiver — o coração é o que importa.</p></div>
            <div className="ex"><div className="i"><IcoRosto /></div><b>Kids</b><p>Espaço seguro e divertido para as crianças.</p></div>
          </div>
          <div className="cta"><a href="#contato" className="btn grn">Planejar minha visita</a></div>
        </div>
        <div className="novo-visual"><div className="eyebrow on-dark">Bem-vindo</div><div className="q">Você foi<br />feito para<br />fazer parte.</div></div>
      </div></div></section>

      {/* MENSAGEM / AO VIVO */}
      <section className="sec msg" id="mensagem"><div className="wrap"><div className="grid">
        <a className="player" href={linkMensagens} target={linkMensagens.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
          {thumb && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="Última mensagem" />
          )}
          {live.aoVivo && <span className="tag"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff", display: "inline-block" }} /> AO VIVO</span>}
          <span className="play">▶</span>
        </a>
        <div>
          <div className="eyebrow on-dark">Última mensagem</div>
          <h2>{live.aoVivo && live.titulo ? live.titulo : "A fé que move montanhas"}</h2>
          <p className="lead">Assista à palavra de domingo e acompanhe todas as transmissões ao vivo pelo nosso canal. A última mensagem fica sempre aqui na frente.</p>
          <div className="cta"><Link href="/mensagens" className="btn pri">Ver todas as mensagens</Link></div>
        </div>
      </div></div></section>

      {/* APP DA IGREJA */}
      <section className="sec app" id="app"><div className="wrap"><div className="grid">
        <div>
          <div className="eyebrow on-dark">Leve a igreja no bolso</div>
          <h2>Acesse o app<br />da {nome}</h2>
          <p className="lead">Tudo o que você vive na igreja, agora na palma da mão. Assista aos cultos, contribua, acompanhe sua célula e muito mais — em um só lugar, do seu jeito.</p>
          <ul className="feats">
            <li><span className="ck">✓</span> Cultos e mensagens ao vivo</li>
            <li><span className="ck">✓</span> Dízimos e ofertas por PIX</li>
            <li><span className="ck">✓</span> Minha célula e grupos</li>
            <li><span className="ck">✓</span> Kids ao vivo dos seus filhos</li>
            <li><span className="ck">✓</span> Agenda e inscrições</li>
            <li><span className="ck">✓</span> Avisos e devocional diário</li>
          </ul>
          <div className="stores">
            <Link href="/app" className="store"><span className="ic" aria-hidden="true"><IcoApple /></span><span><small>Baixar na</small><b>App Store</b></span></Link>
            <Link href="/app" className="store"><span className="ic" aria-hidden="true"><IcoPlay /></span><span><small>Disponível no</small><b>Google Play</b></span></Link>
            <Link href="/app" className="store ghost"><span className="ic" aria-hidden="true"><IcoGlobo /></span><span><small>Ou entre pelo</small><b>Navegador</b></span></Link>
          </div>
        </div>
        <div className="appphone"><div className="sc">
          <div className="apn" />
          <div className="apbar"><div className="hi">Paz! 👋</div><div className="nm">Início</div></div>
          <div className="apbody">
            <div className="apbanner"><span className="lv">● AO VIVO</span><b>Culto da Família</b><span style={{ fontSize: 10, opacity: 0.85 }}>Agora · toque para assistir</span></div>
            <div className="aptiles">
              <div className="aptile"><span className="i">♡</span>Contribuir</div>
              <div className="aptile"><span className="i">▶</span>Palavra</div>
              <div className="aptile"><span className="i">◎</span>Minha Célula</div>
              <div className="aptile"><span className="i">☺</span>Meus Kids</div>
            </div>
          </div>
          <div className="aptab"><span className="on">⌂</span><span>▶</span><span>♡</span><span>▤</span><span>☰</span></div>
        </div></div>
      </div></div></section>

      {/* MINISTÉRIOS */}
      <section className="sec minis" id="minis"><div className="wrap">
        <div className="eyebrow">Faça parte</div>
        <h2>Nossos ministérios</h2>
        <p className="lead">Há um lugar para você servir, crescer e viver em comunidade.</p>
        <div className="cards3">
          <div className="mcard"><div className="ic">♪</div><h3>Louvor</h3><p>Uma equipe que conduz a igreja à presença de Deus com excelência e coração.</p><Link href="/quem-somos">Conhecer →</Link></div>
          <div className="mcard"><div className="ic">☺</div><h3>Kids</h3><p>Um espaço seguro, lúdico e cheio de amor onde as crianças aprendem sobre Jesus.</p><Link href="/quem-somos">Conhecer →</Link></div>
          <div className="mcard"><div className="ic">◎</div><h3>Células</h3><p>Grupos pequenos nos lares para cultivar comunhão, cuidado e crescimento.</p><Link href="/celulas">Conhecer →</Link></div>
        </div>
      </div></section>

      {/* PRÓXIMOS PASSOS */}
      <section className="sec steps" id="passos"><div className="wrap center">
        <div className="eyebrow">Cresça na fé</div>
        <h2>Próximos passos</h2>
        <p className="lead">Um caminho simples para você avançar na sua jornada com Cristo.</p>
        <div className="stepgrid" style={{ textAlign: "center" }}>
          <div className="step"><div className="n">01</div><div className="ic"><IcoCruz /></div><b>Aceitei Jesus</b><small>Deu o primeiro passo? Conte pra gente.</small></div>
          <div className="step"><div className="n">02</div><div className="ic"><IcoGota /></div><b>Batismo</b><small>Inscreva-se no próximo batismo.</small></div>
          <div className="step"><div className="n">03</div><div className="ic"><IcoGrupo /></div><b>Célula</b><small>Encontre um grupo perto de você.</small></div>
          <div className="step"><div className="n">04</div><div className="ic"><IcoLivro /></div><b>Discipulado</b><small>Cursos e trilhos de crescimento.</small></div>
          <div className="step"><div className="n">05</div><div className="ic"><IcoMao /></div><b>Servir</b><small>Faça parte de um ministério.</small></div>
        </div>
      </div></section>

      {/* CÉLULAS BAND */}
      <section className="sec cells"><div className="wrap">
        <div>
          <div className="eyebrow on-dark">Comunhão</div>
          <h2>Encontre uma célula</h2>
          <p>Ninguém foi feito para caminhar sozinho. Achamos um grupo perto de você para viver a fé em comunidade.</p>
        </div>
        <Link href="/celulas" className="btn pri">Buscar grupo perto de mim</Link>
      </div></section>

      {/* DEPOIMENTOS */}
      <section className="sec depo"><div className="wrap">
        <div className="eyebrow">Vidas transformadas</div>
        <h2>Histórias da nossa família</h2>
        <div className="cards3">
          <div className="quote"><div className="mark">”</div><p>Cheguei quebrado e fui acolhido como filho. Hoje sirvo no louvor e minha família foi restaurada.</p><div className="who"><div className="av">R</div><div><b>Rafael M.</b><small>Membro há 3 anos</small></div></div></div>
          <div className="quote"><div className="mark">”</div><p>Minha célula virou minha segunda casa. Encontrei amigos verdadeiros e um propósito.</p><div className="who"><div className="av">C</div><div><b>Carla S.</b><small>Líder de célula</small></div></div></div>
          <div className="quote"><div className="mark">”</div><p>Meus filhos amam o Kids e pedem pra vir todo domingo. Que segurança de coração!</p><div className="who"><div className="av">J</div><div><b>Juliana P.</b><small>Mãe e voluntária</small></div></div></div>
        </div>
      </div></section>

      {/* CONTRIBUA */}
      <section className="sec give" id="give"><div className="wrap">
        <div>
          <div className="eyebrow on-dark">Generosidade</div>
          <h2>Contribua com<br />a obra</h2>
          <p>Sua oferta e dízimo sustentam a missão e abençoam vidas. Pelo site ou direto no app.</p>
        </div>
        <div className="pixbox">
          <div className="lbl">Chave PIX{pixDisplay?.includes("/") ? " · CNPJ" : ""}</div>
          <div className="key">{pixDisplay ?? "contato@discipular.com.br"}</div>
          <Link href="/contribua" className="btn pri" style={{ width: "100%", justifyContent: "center" }}>Contribuir com PIX</Link>
        </div>
      </div></section>

      {/* AGENDA */}
      <section className="sec agenda" id="agenda"><div className="wrap">
        <div className="eyebrow">Programe-se</div>
        <h2>Próximos eventos</h2>
        <div className="rows">
          <Link className="arow" href="/batismo"><div className="date">17/08</div><div className="info"><b>Batismo nas Águas</b><small>Domingo · 9h · Sede</small></div><div className="go">→</div></Link>
          <Link className="arow" href="/contato"><div className="date">22/08</div><div className="info"><b>Encontro de Casais</b><small>Sexta · 20h</small></div><div className="go">→</div></Link>
          <Link className="arow" href="/contato"><div className="date">30/08</div><div className="info"><b>Ação Social no Bairro</b><small>Sábado · 14h · Voluntários</small></div><div className="go">→</div></Link>
        </div>
      </div></section>

      {/* ORAÇÃO */}
      <section className="sec pray"><div className="wrap"><div className="box">
        <div className="eyebrow on-dark">Estamos com você</div>
        <h2>Podemos orar por você?</h2>
        <p className="lead">Envie seu pedido de oração. Nossa equipe de intercessão vai clamar por você em particular.</p>
        <div className="cta" style={{ justifyContent: "center" }}>
          <Link href="/oracao" className="btn pri">Enviar pedido de oração</Link>
        </div>
      </div></div></section>

      {/* CONTATO */}
      <section className="sec contato" id="contato"><div className="wrap"><div className="grid">
        <div>
          <div className="eyebrow">Fale conosco</div>
          <h2>Venha nos<br />visitar</h2>
          <p className="lead" style={{ marginBottom: 20 }}>Estamos de portas abertas. Envie sua mensagem — ela chega direto no nosso WhatsApp.</p>
          <p style={{ fontWeight: 600, lineHeight: 1.9 }}>📍 {endereco}<br />📞 {telefone}<br />✉ {email}</p>
          <a className="map" href={`https://www.google.com/maps/search/?api=1&query=${mapaBusca}`} target="_blank" rel="noopener noreferrer">🗺️ Ver no mapa</a>
        </div>
        <FormWhatsAppInst numero={config.whatsapp} />
      </div></div></section>

      {/* NEWSLETTER */}
      <section className="sec footcta"><div className="wrap">
        <div className="eyebrow on-dark">Fique por dentro</div>
        <h2>Receba as novidades</h2>
        <p>Devocional, avisos e eventos direto no seu e-mail.</p>
        <form className="news" action="/contato"><input className="f" name="email" type="email" placeholder="seu@email.com" /><button type="submit" className="btn pri">Inscrever</button></form>
      </div></section>

      {/* FOOTER */}
      <footer><div className="wrap">
        <div className="grid">
          <Link href="/" className="brand">{logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={nome} className="brand__logo" />
          ) : (<><div className="logo">D</div><b>{nome}</b></>)}</Link>
          <div className="cols">
            <div><h4>Igreja</h4><a href="#novo">Novo por aqui</a><a href="#minis">Ministérios</a><a href="#agenda">Agenda</a></div>
            <div><h4>Participe</h4><a href="#mensagem">Mensagens</a><a href="#give">Contribua</a><a href="#passos">Próximos passos</a></div>
            <div><h4>App</h4><Link href="/app">App Store</Link><Link href="/app">Google Play</Link><Link href="/login">Área do membro</Link></div>
            <div><h4>Redes</h4>
              {config.instagram && <a href={config.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>}
              {config.youtube && <a href={config.youtube} target="_blank" rel="noopener noreferrer">YouTube</a>}
              {config.whatsapp && <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            </div>
          </div>
        </div>
        <div className="copy"><span>© 2026 {nome}. Todos os direitos reservados.</span><span>Feito com fé 🖤</span></div>
      </div></footer>
    </div>
  );
}

/* ---- Ícones de traço grafite (herdam --ink via stroke no CSS .ex .i svg) ---- */
function IcoCoracao() { return <svg viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9.2-9.2A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5.8C19 16.5 12 21 12 21z" /></svg>; }
function IcoRelogio() { return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>; }
function IcoCamiseta() { return <svg viewBox="0 0 24 24"><path d="M8.5 3.5 4 6l2 3 2.2-1.2V20.5h7.6V7.8L18 9l2-3-4.5-2.5a3.5 3.5 0 0 1-7 0z" /></svg>; }
function IcoRosto() { return <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01" /><path d="M8.5 14a4.5 4.5 0 0 0 7 0" /></svg>; }
function IcoCruz() { return <svg viewBox="0 0 24 24"><path d="M12 3v18M7.5 8h9" /></svg>; }
function IcoGota() { return <svg viewBox="0 0 24 24"><path d="M12 3s6.5 6.5 6.5 10.5a6.5 6.5 0 0 1-13 0C5.5 9.5 12 3 12 3z" /></svg>; }
function IcoGrupo() { return <svg viewBox="0 0 24 24"><circle cx="6" cy="8" r="2.5" /><circle cx="18" cy="8" r="2.5" /><circle cx="12" cy="16" r="2.5" /><path d="M8 9.6l2.6 4.4M16 9.6l-2.6 4.4" /></svg>; }
function IcoLivro() { return <svg viewBox="0 0 24 24"><path d="M12 5v15M12 5a3 3 0 0 0-3-2H4v14h5a3 3 0 0 1 3 2M12 5a3 3 0 0 1 3-2h5v14h-5a3 3 0 0 0-3 2" /></svg>; }
function IcoMao() { return <svg viewBox="0 0 24 24"><path d="M7 11V6a1.6 1.6 0 0 1 3.2 0v4M10.2 10V4.6a1.6 1.6 0 0 1 3.2 0V10M13.4 10V6a1.6 1.6 0 0 1 3.2 0v5.5M16.6 9.2a1.6 1.6 0 0 1 3.2 0v3.3a7 7 0 0 1-7 7 6.2 6.2 0 0 1-5.1-2.6L4.5 15" /></svg>; }
function IcoApple() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 1c.1 1-.3 2-.9 2.7-.6.7-1.6 1.3-2.5 1.2-.1-1 .4-2 .9-2.6C14.1 1.5 15.2 1 16 1zm2.7 7.3c-1.5.9-1.9 2.9-.5 4.4.4.9 1 1.5 1.8 1.9-.3.9-.7 1.7-1.3 2.5-.8 1.1-1.6 2.2-2.9 2.2s-1.6-.7-3-.7-1.8.7-3 .7-2.1-1.1-2.9-2.2C1.4 16.3.9 13 2.6 10.6c.8-1.2 2.2-1.9 3.6-1.9 1.2 0 2 .8 3 .8s1.6-.8 3-.8c.5 0 2 .1 3 1.4-.1.1-.4.3-.5.5z" /></svg>; }
function IcoPlay() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 3.5 20 12 4 20.5z" /></svg>; }
function IcoGlobo() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" /></svg>; }
