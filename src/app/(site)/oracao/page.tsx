import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Pedido de oração",
  description: "Compartilhe seu pedido. Nossa equipe de intercessão vai orar por você.",
};

export const dynamic = "force-dynamic";

export default async function PaginaOracao() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  // Garante que o cookie CSRF existe antes de o formulário ser renderizado.
  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const sec = dados.config.secoes;

  return (
    <>
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Intercessão</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            {sec.formOracaoTitulo} <span className="serif-italic gold">{sec.formOracaoDestaque}</span>?
          </h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            {sec.formOracaoLead}
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container container--narrow">
          <div
            className="alerta alerta--aviso"
            style={{ marginBottom: "2.5rem" }}
            role="note"
          >
            <strong>Sua privacidade.</strong> Por padrão, seu pedido é visto apenas pela equipe
            pastoral. Ele só aparece para outras pessoas se você escolher isso abaixo.
          </div>

          <Formulario tipo="pedido-oracao" textoBotao="Enviar pedido">
            <CampoMarcacao
              nome="anonimo"
              rotulo="Quero enviar de forma anônima (não vamos registrar seu nome nem seu contato)"
            />

            <Campo
              nome="nome"
              rotulo="Seu nome"
              autoComplete="name"
              maxLength={160}
              ajuda="Deixe em branco se marcou a opção anônima acima."
            />

            <div className="grid cols-2" style={{ gap: "1.4rem" }}>
              <Campo nome="telefone" rotulo="Telefone / WhatsApp" tipo="tel" autoComplete="tel" maxLength={20} />
              <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" maxLength={254} />
            </div>

            <CampoSelecao
              nome="categoria"
              rotulo="Sobre o que é o pedido"
              opcoes={[
                { valor: "SAUDE", rotulo: "Saúde" },
                { valor: "FAMILIA", rotulo: "Família" },
                { valor: "FINANCEIRO", rotulo: "Financeiro" },
                { valor: "TRABALHO", rotulo: "Trabalho / estudos" },
                { valor: "ESPIRITUAL", rotulo: "Vida espiritual" },
                { valor: "LUTO", rotulo: "Luto" },
                { valor: "GRATIDAO", rotulo: "Gratidão / testemunho" },
                { valor: "GERAL", rotulo: "Outro" },
              ]}
            />

            <Campo nome="titulo" rotulo="Resumo em poucas palavras" maxLength={160} />

            <CampoTexto
              nome="pedido"
              rotulo="Seu pedido"
              obrigatorio
              linhas={7}
              maxLength={3000}
              ajuda="Escreva com liberdade. Até 3.000 caracteres."
            />

            <CampoMarcacao nome="urgente" rotulo="É urgente" />

            <CampoSelecao
              nome="visibilidade"
              rotulo="Quem pode ver este pedido"
              opcoes={[
                { valor: "PRIVADO", rotulo: "Somente a equipe pastoral (recomendado)" },
                { valor: "MURAL_MEMBROS", rotulo: "Membros da igreja, no aplicativo" },
                { valor: "PUBLICO", rotulo: "Mural público do site" },
              ]}
              ajuda="Se não escolher, seu pedido fica visível apenas para a equipe pastoral."
            />

            <CampoMarcacao
              nome="querContatoPastoral"
              rotulo="Gostaria de receber um contato pastoral"
            />

            <CampoMarcacao
              nome="consentimentoLgpd"
              obrigatorio
              rotulo="Autorizo o tratamento dos meus dados para que a igreja possa orar e, se eu pedir, entrar em contato."
            />
          </Formulario>
        </div>
      </section>
    </>
  );
}
