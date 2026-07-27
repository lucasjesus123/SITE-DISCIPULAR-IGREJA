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
  title: "Quero ser batizado",
  description: "Dê o passo do batismo. Preencha o formulário e nossa equipe entrará em contato.",
};

export const dynamic = "force-dynamic";

export default async function PaginaBatismo() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);

  return (
    <>
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Batismo</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            Um passo de <span className="serif-italic gold">obediência</span>.
          </h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            O batismo é o testemunho público de uma decisão que já aconteceu no coração. Conte um
            pouco da sua história e caminharemos com você até esse dia.
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container container--narrow">
          <Formulario tipo="batismo" textoBotao="Enviar solicitação">
            <Campo nome="nome" rotulo="Nome completo" obrigatorio autoComplete="name" maxLength={160} />

            <div className="grid cols-2" style={{ gap: "1.4rem" }}>
              <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" obrigatorio autoComplete="tel" maxLength={20} />
              <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" maxLength={254} />
            </div>

            <Campo nome="dataNascimento" rotulo="Data de nascimento" tipo="date" autoComplete="bday" />

            <hr className="rule" />

            <CampoMarcacao
              nome="aceitouJesus"
              obrigatorio
              rotulo="Já entreguei minha vida a Jesus e quero seguir a Ele"
            />

            <Campo nome="dataConversao" rotulo="Quando isso aconteceu (aproximadamente)" tipo="date" />

            <CampoTexto
              nome="testemunho"
              rotulo="Conte um pouco do seu testemunho"
              obrigatorio
              linhas={7}
              minLength={20}
              maxLength={2000}
              ajuda="Como você conheceu Jesus e o que mudou desde então. Mínimo de 20 caracteres."
            />

            <CampoMarcacao nome="jaFoiBatizado" rotulo="Já fui batizado antes, em outra igreja" />
            <Campo nome="ondeFoiBatizado" rotulo="Se sim, onde e quando" maxLength={200} />

            <CampoMarcacao nome="participaCelula" rotulo="Participo de uma célula" />

            {dados.campi.length > 1 && (
              <CampoSelecao
                nome="campusId"
                rotulo="Onde você congrega"
                opcoes={dados.campi.map((c) => ({ valor: c.id, rotulo: c.nome }))}
              />
            )}

            <hr className="rule" />

            <p className="campo__rotulo">Menores de 18 anos</p>
            <CampoMarcacao nome="menorIdade" rotulo="Sou menor de 18 anos" />

            <div className="grid cols-2" style={{ gap: "1.4rem" }}>
              <Campo nome="responsavelNome" rotulo="Nome do responsável" maxLength={160} />
              <Campo nome="responsavelTelefone" rotulo="Telefone do responsável" tipo="tel" maxLength={20} />
            </div>

            <CampoMarcacao
              nome="autorizacaoResponsavel"
              rotulo="Declaro que meu responsável está ciente e autoriza o batismo"
            />

            <CampoTexto nome="observacoes" rotulo="Algo mais que queira nos contar" linhas={3} maxLength={1000} />

            <CampoMarcacao
              nome="consentimentoLgpd"
              obrigatorio
              rotulo="Autorizo o tratamento dos meus dados para o processo de batismo."
            />
          </Formulario>
        </div>
      </section>
    </>
  );
}
