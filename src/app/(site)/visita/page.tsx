import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, nomeDia } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import {
  Campo,
  CampoMarcacao,
  CampoSelecao,
  CampoTexto,
  Formulario,
} from "@/components/site/Formulario";

export const metadata: Metadata = {
  title: "Quero visitar",
  description: "Venha nos conhecer. Você é bem-vindo exatamente como está.",
};

export const dynamic = "force-dynamic";

export default async function PaginaVisita() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const { campi, agenda } = dados;
  const sec = dados.config.secoes;

  return (
    <>
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Primeira visita</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            {sec.formVisitaTitulo} <span className="serif-italic gold">{sec.formVisitaDestaque}</span>.
          </h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            {sec.formVisitaLead}
          </p>
        </div>
      </section>

      {agenda.length > 0 && (
        <section className="section section--tight theme-cream">
          <div className="container">
            <p className="eyebrow">Horários</p>
            <h2 style={{ marginTop: "1rem", marginBottom: "2rem" }}>Escolha o melhor dia.</h2>
            {agenda.slice(0, 6).map((item) => (
              <div className="info-line" key={item.id}>
                <div className="ic" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p className="k">{nomeDia(item.diaSemana)}</p>
                  <p className="v">{item.titulo}</p>
                  <p className="sub">
                    {[item.horario, item.campusNome].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section theme-light">
        <div className="container container--narrow">
          <p className="eyebrow">Avise que você vem</p>
          <h2 style={{ marginTop: "1rem", marginBottom: "2.5rem" }}>Seja bem-vindo.</h2>

          <Formulario tipo="visitante" textoBotao="Avisar que vou visitar">
            <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />

            <div className="grid cols-2" style={{ gap: "1.4rem" }}>
              <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" obrigatorio autoComplete="tel" maxLength={20} />
              <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" maxLength={254} />
            </div>

            {campi.length > 1 && (
              <CampoSelecao
                nome="campusId"
                rotulo="Onde pretende vir"
                opcoes={campi.map((c) => ({ valor: c.id, rotulo: `${c.nome}${c.cidade ? ` — ${c.cidade}` : ""}` }))}
              />
            )}

            <CampoSelecao
              nome="comoConheceu"
              rotulo="Como conheceu a igreja"
              opcoes={[
                { valor: "AMIGO", rotulo: "Um amigo me convidou" },
                { valor: "REDES_SOCIAIS", rotulo: "Redes sociais" },
                { valor: "PASSANDO", rotulo: "Passei em frente" },
                { valor: "EVANGELISMO", rotulo: "Evangelismo" },
                { valor: "CELULA", rotulo: "Por uma célula" },
                { valor: "OUTRO", rotulo: "Outro" },
              ]}
            />

            <CampoSelecao
              nome="faixaEtaria"
              rotulo="Faixa etária"
              opcoes={[
                { valor: "CRIANCA", rotulo: "Criança" },
                { valor: "ADOLESCENTE", rotulo: "Adolescente" },
                { valor: "JOVEM", rotulo: "Jovem" },
                { valor: "ADULTO", rotulo: "Adulto" },
                { valor: "IDOSO", rotulo: "Melhor idade" },
              ]}
            />

            <CampoTexto
              nome="mensagem"
              rotulo="Quer nos contar algo antes de vir?"
              linhas={4}
              maxLength={1000}
            />

            <CampoMarcacao nome="querVisitaPastoral" rotulo="Gostaria de receber uma visita pastoral" />

            <CampoMarcacao
              nome="consentimentoLgpd"
              obrigatorio
              rotulo="Autorizo o tratamento dos meus dados para que a igreja possa entrar em contato comigo."
            />
          </Formulario>
        </div>
      </section>
    </>
  );
}
