import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { Campo, CampoMarcacao, CampoTexto, Formulario } from "@/components/site/Formulario";

export const metadata: Metadata = {
  title: "Contato",
  description: "Fale com a gente. Responderemos assim que possível.",
};

export const dynamic = "force-dynamic";

const WHATSAPP_PADRAO = { href: "https://wa.me/5551992668095", texto: "(51) 99266-8095" };
const EMAIL_PADRAO = "contato@discipularigreja.com.br";
const INSTAGRAM_PADRAO = { href: "https://www.instagram.com/discipularigreja/", texto: "@discipularigreja" };

const CAMPI_PADRAO = [
  {
    idx: "01",
    nome: "Sede Lajeado",
    endereco: "RSC-453, 1186 – pv 04 – Floresta, Lajeado/RS",
  },
  {
    idx: "02",
    nome: "Campus Vera Cruz",
    endereco: "R. Jacob Schneider, 111 – Centro, Vera Cruz/RS",
  },
] as const;

const O_QUE_ESPERAR = [
  {
    titulo: "Venha como está",
    texto:
      "Sem código de vestimenta, sem julgamentos. Aqui você é recebido de braços abertos.",
  },
  {
    titulo: "Chegue tranquilo",
    texto:
      "Chegue uns minutos antes e procure a recepção — teremos alguém pronto para te receber.",
  },
  {
    titulo: "Traga a família",
    texto:
      "Um ambiente para todas as idades. Seu próximo passo pode começar em família.",
  },
] as const;

function linkMapa(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

export default async function PaginaContato() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const { config, campi } = dados;

  const whatsappHref = config.whatsapp
    ? `https://wa.me/${config.whatsapp.replace(/\D/g, "")}`
    : WHATSAPP_PADRAO.href;
  const whatsappTexto = config.whatsapp ?? WHATSAPP_PADRAO.texto;
  const emailContato = config.emailContato ?? EMAIL_PADRAO;
  const instagramHref = config.instagram ?? INSTAGRAM_PADRAO.href;
  const instagramTexto = config.instagram
    ? config.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//, "@").replace(/\/$/, "")
    : INSTAGRAM_PADRAO.texto;

  const enderecos =
    campi.length > 0
      ? campi.map((campus, i) => ({
          idx: String(i + 1).padStart(2, "0"),
          nome: campus.nome,
          endereco: [
            [campus.logradouro, campus.numero].filter(Boolean).join(", "),
            [campus.bairro, campus.cidade, campus.uf].filter(Boolean).join(", "),
          ]
            .filter(Boolean)
            .join(" – "),
        }))
      : CAMPI_PADRAO.map((c) => ({ idx: c.idx, nome: c.nome, endereco: c.endereco }));

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb">
            <Link href="/">Início</Link>
            <span>/</span>
            <span>Contato</span>
          </nav>
          <p className="eyebrow">Fale conosco</p>
          <h1 className="page-hero__title">
            Vamos nos <span className="serif-italic accent">conhecer.</span>
          </h1>
          <p className="lead">
            Estamos em Lajeado e Vera Cruz, de portas abertas. Planeje sua visita
            ou mande uma mensagem — será um prazer receber você.
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container split split--text-first">
          <div>
            <p className="eyebrow">Canais</p>
            <h2>
              Como falar <span className="serif-italic accent">com a gente.</span>
            </h2>

            <div className="info-line">
              <div className="ic" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="k">WhatsApp</p>
                <p className="v">
                  <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                    {whatsappTexto}
                  </a>
                </p>
                <p className="sub">O jeito mais rápido de falar conosco.</p>
              </div>
            </div>

            <div className="info-line">
              <div className="ic" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <p className="k">E-mail</p>
                <p className="v">
                  <a href={`mailto:${emailContato}`}>{emailContato}</a>
                </p>
              </div>
            </div>

            <div className="info-line">
              <div className="ic" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div>
                <p className="k">Redes sociais</p>
                <p className="v">
                  <a href={instagramHref} target="_blank" rel="noopener noreferrer">
                    {instagramTexto}
                  </a>
                </p>
                <p className="sub">Instagram &amp; YouTube</p>
              </div>
            </div>
          </div>

          <div className="split__media">
            <p className="eyebrow">Envie uma mensagem</p>
            <Formulario tipo="contato" textoBotao="Enviar mensagem">
              <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />
              <Campo nome="email" rotulo="E-mail" tipo="email" obrigatorio autoComplete="email" maxLength={254} />
              <Campo nome="telefone" rotulo="Telefone" tipo="tel" autoComplete="tel" maxLength={20} />
              <Campo nome="assunto" rotulo="Assunto" obrigatorio maxLength={160} />
              <CampoTexto nome="mensagem" rotulo="Mensagem" obrigatorio linhas={6} maxLength={3000} />
              <CampoMarcacao
                nome="consentimentoLgpd"
                obrigatorio
                rotulo="Autorizo o tratamento dos meus dados para responder este contato."
              />
            </Formulario>
          </div>
        </div>
      </section>

      <section className="section theme-dark">
        <div className="container">
          <p className="eyebrow">Onde estamos</p>
          <h2>
            Uma igreja, <span className="serif-italic accent">dois lugares.</span>
          </h2>
          <p className="lead">
            Você é bem-vindo em qualquer um dos nossos endereços. Venha como você
            está.
          </p>
          <div className="grid cols-2">
            {enderecos.map((local) => (
              <div className="card" key={local.idx}>
                <p className="index-tag">{local.idx}</p>
                <h3 className="card__titulo">{local.nome}</h3>
                <p className="card__texto">{local.endereco}</p>
                <a
                  className="link"
                  href={linkMapa(local.endereco)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Como chegar
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section theme-cream">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Primeira vez?</p>
            <h2>
              O que <span className="serif-italic accent">esperar.</span>
            </h2>
          </div>
          <div className="grid cols-3">
            {O_QUE_ESPERAR.map((item) => (
              <div className="card" key={item.titulo}>
                <h3 className="card__titulo">{item.titulo}</h3>
                <p className="card__texto">{item.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
