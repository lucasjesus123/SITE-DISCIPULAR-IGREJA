import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import {
  Campo,
  CampoMarcacao,
  CampoSelecao,
  CampoTexto,
  Formulario,
} from "@/components/site/Formulario";

/**
 * Escola Discipular — cursos e inscrição.
 *
 * COMO A INSCRIÇÃO CONTINUA INDO PRO BANCO
 * O formulário é o mesmo componente `Formulario` com `tipo="inscricao-curso"`,
 * que envia a inscrição (com token CSRF) para a secretaria da igreja. O curso
 * escolhido vai no campo `cursoId`, cujas opções são a lista fechada de cursos
 * ATIVOS E COM INSCRIÇÕES ABERTAS desta igreja, carregada do banco. O visitante
 * nunca digita um id; ele escolhe entre os cursos que já existem aqui — não há
 * como inscrever alguém num curso de outra igreja.
 *
 * NOTA DE ROTEAMENTO
 * Esta rota tem prioridade sobre a página `/escola` do editor whitelabel:
 * preço, vagas e status de inscrição precisam vir do banco, ao vivo.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Escola Discipular",
    description:
      `Cursos da ${config.nomeExibicao}: fundamentos sólidos para uma fé que sustenta a vida. ` +
      `Conheça as turmas e faça sua inscrição.`,
    alternates: { canonical: "/escola" },
    openGraph: {
      title: `Escola Discipular · ${config.nomeExibicao}`,
      description: "Formação bíblica para quem quer conhecer no que crê e por quê.",
    },
  };
}

const svgCheck = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export default async function PaginaEscola() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const { cursos } = dados;

  // Lista fechada: só um curso ativo e com inscrições abertas desta igreja pode
  // ser selecionado. O id sai do banco, nunca da URL.
  const abertos = cursos.filter((c) => c.inscricoesAbertas);

  return (
    <>
      {/* ------------------------------------------------------------- PAGE-HERO */}
      <section className="page-hero">
        <div className="container">
          <nav className="breadcrumb">
            <Link href="/">Início</Link>
            <span>/</span>
            <span>Escola Discipular</span>
          </nav>
          <p className="eyebrow">Escola Discipular</p>
          <h1 className="page-hero__title">
            Uma fé com <span className="serif-italic accent">fundamento.</span>
          </h1>
          <p className="lead">
            Seja bem-vindo à Escola Discipular. Cursos que aprofundam a Palavra e
            formam discípulos maduros.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------------- CURSOS */}
      <section className="section theme-light">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow--centered">Nossos cursos</p>
            <h2>
              Conhecer no que se <span className="serif-italic accent">crê — e por quê.</span>
            </h2>
            <p className="lead">
              Duas trilhas de formação para quem quer ir além na caminhada com Deus.
            </p>
          </div>

          <div className="grid cols-2">
            <article className="card">
              <p className="course__meta">Segundas-feira · 20h00</p>
              <h3 className="card__titulo">Teologia Discipular</h3>
              <p className="card__texto">
                Um mergulho consistente nas doutrinas da fé cristã — das Escrituras
                à vida prática. Ideal para quem deseja fundamentar a fé e responder
                o porquê daquilo em que crê.
              </p>
              <ul className="ticks">
                <li>
                  <span className="ic">{svgCheck}</span>
                  <span>Bases bíblicas e doutrinárias</span>
                </li>
                <li>
                  <span className="ic">{svgCheck}</span>
                  <span>Aplicação à vida e ao ministério</span>
                </li>
              </ul>
              <p className="course__price">
                R$ 49,90 <span>/ por mês</span>
              </p>
              <a href="#inscricao" className="btn btn--sm">
                Inscrever-me
              </a>
            </article>

            <article className="card">
              <p className="course__meta">Sextas-feira · 20h00</p>
              <h3 className="card__titulo">Trilha Discipular</h3>
              <p className="card__texto">
                O caminho do discipulado, passo a passo: uma trilha de estudo
                pensada para crescer em intimidade com Deus e maturidade cristã, do
                primeiro passo à liderança.
              </p>
              <ul className="ticks">
                <li>
                  <span className="ic">{svgCheck}</span>
                  <span>Discipulado prático e progressivo</span>
                </li>
                <li>
                  <span className="ic">{svgCheck}</span>
                  <span>Crescimento em caráter e serviço</span>
                </li>
              </ul>
              <p className="course__price">
                R$ 49,90 <span>/ por mês</span>
              </p>
              <a href="#inscricao" className="btn btn--sm">
                Inscrever-me
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- INSCRIÇÃO */}
      <section className="section theme-dark" id="inscricao">
        <div className="container split split--text-first">
          <div>
            <p className="eyebrow">Inscrição</p>
            <h2>
              Faça a sua <span className="serif-italic accent">inscrição.</span>
            </h2>
            <p className="lead">
              Preencha os dados ao lado. Ao enviar, sua inscrição é encaminhada
              direto para a secretaria da igreja — rápido e sem burocracia.
            </p>
            <ul className="ticks">
              <li>
                <span className="ic">{svgCheck}</span>
                <span>Aberto a membros e não-membros</span>
              </li>
              <li>
                <span className="ic">{svgCheck}</span>
                <span>Investimento de R$ 49,90/mês por curso</span>
              </li>
              <li>
                <span className="ic">{svgCheck}</span>
                <span>Dúvidas? (51) 99266-8095</span>
              </li>
            </ul>
          </div>

          <div className="split__media">
            {abertos.length > 0 ? (
              <Formulario tipo="inscricao-curso" textoBotao="Enviar inscrição">
                {/*
                  O id do curso NÃO vem da URL: as opções são os cursos com
                  inscrições abertas que acabamos de carregar do banco desta
                  igreja. O visitante só escolhe qual, entre os que já existem.
                */}
                <CampoSelecao
                  nome="cursoId"
                  rotulo="Curso"
                  obrigatorio
                  opcoes={abertos.map((c) => ({ valor: c.id, rotulo: c.nome }))}
                />

                <Campo
                  nome="nome"
                  rotulo="Nome completo"
                  obrigatorio
                  autoComplete="name"
                  maxLength={160}
                />

                <div className="grid cols-2" style={{ gap: "1.4rem" }}>
                  <Campo
                    nome="email"
                    rotulo="E-mail"
                    tipo="email"
                    obrigatorio
                    autoComplete="email"
                    maxLength={254}
                  />
                  <Campo
                    nome="telefone"
                    rotulo="WhatsApp"
                    tipo="tel"
                    obrigatorio
                    autoComplete="tel"
                    maxLength={20}
                  />
                </div>

                <Campo
                  nome="dataNascimento"
                  rotulo="Data de nascimento"
                  tipo="date"
                  autoComplete="bday"
                  ajuda="Ajuda a montar turmas e a identificar quem precisa de autorização."
                />

                <CampoMarcacao nome="jaEMembro" rotulo="Já sou membro desta igreja" />

                <CampoTexto
                  nome="observacoes"
                  rotulo="Alguma observação?"
                  linhas={3}
                  maxLength={600}
                />

                <CampoMarcacao
                  nome="consentimentoLgpd"
                  obrigatorio
                  rotulo="Autorizo o tratamento dos meus dados para efetivar a inscrição e receber informações da turma."
                />
              </Formulario>
            ) : (
              <div className="card">
                <p className="lead">
                  As inscrições do próximo semestre estão sendo abertas.{" "}
                  <Link href="/contato" className="accent">
                    Fale conosco
                  </Link>{" "}
                  para ser avisado assim que as turmas começarem.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
