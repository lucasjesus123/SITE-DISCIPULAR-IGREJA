"use client";

import { Campo, CampoMarcacao, CampoTexto, Formulario } from "@/components/site/Formulario";

/**
 * Formulário embutido em bloco de página.
 *
 * O `tipo` vem de um `z.enum` no schema do bloco, então já é um dos cinco
 * valores conhecidos — não há como o editor apontar para um endpoint
 * arbitrário. O `switch` abaixo é exaustivo sobre esse enum.
 */
export function FormularioPorTipo({
  tipo,
}: {
  tipo: "visitante" | "contato" | "pedido-oracao" | "batismo" | "quero-celula";
}) {
  switch (tipo) {
    case "contato":
      return (
        <Formulario tipo="contato" textoBotao="Enviar mensagem">
          <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />
          <Campo nome="email" rotulo="E-mail" tipo="email" obrigatorio autoComplete="email" maxLength={254} />
          <Campo nome="telefone" rotulo="Telefone" tipo="tel" autoComplete="tel" maxLength={20} />
          <Campo nome="assunto" rotulo="Assunto" obrigatorio maxLength={160} />
          <CampoTexto nome="mensagem" rotulo="Mensagem" obrigatorio linhas={5} maxLength={3000} />
          <CampoMarcacao nome="consentimentoLgpd" obrigatorio rotulo="Autorizo o tratamento dos meus dados." />
        </Formulario>
      );

    case "pedido-oracao":
      return (
        <Formulario tipo="pedido-oracao" textoBotao="Enviar pedido">
          <CampoMarcacao nome="anonimo" rotulo="Enviar de forma anônima" />
          <Campo nome="nome" rotulo="Seu nome" autoComplete="name" maxLength={160} />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" autoComplete="tel" maxLength={20} />
          <CampoTexto nome="pedido" rotulo="Seu pedido" obrigatorio linhas={5} maxLength={3000} />
          <CampoMarcacao nome="urgente" rotulo="É urgente" />
          <CampoMarcacao nome="consentimentoLgpd" obrigatorio rotulo="Autorizo o tratamento dos meus dados." />
        </Formulario>
      );

    case "batismo":
      return (
        <Formulario tipo="batismo" textoBotao="Enviar solicitação">
          <Campo nome="nome" rotulo="Nome completo" obrigatorio autoComplete="name" maxLength={160} />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" obrigatorio autoComplete="tel" maxLength={20} />
          <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" maxLength={254} />
          <CampoMarcacao nome="aceitouJesus" obrigatorio rotulo="Já entreguei minha vida a Jesus" />
          <CampoTexto nome="testemunho" rotulo="Seu testemunho" obrigatorio linhas={5} maxLength={2000} />
          <CampoMarcacao nome="menorIdade" rotulo="Sou menor de 18 anos" />
          <Campo nome="responsavelNome" rotulo="Nome do responsável (se menor)" maxLength={160} />
          <Campo nome="responsavelTelefone" rotulo="Telefone do responsável" tipo="tel" maxLength={20} />
          <CampoMarcacao nome="autorizacaoResponsavel" rotulo="Meu responsável autoriza o batismo" />
          <CampoMarcacao nome="consentimentoLgpd" obrigatorio rotulo="Autorizo o tratamento dos meus dados." />
        </Formulario>
      );

    case "quero-celula":
      return (
        <Formulario tipo="quero-celula" textoBotao="Quero participar">
          <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" obrigatorio autoComplete="tel" maxLength={20} />
          <Campo nome="bairro" rotulo="Seu bairro" maxLength={100} />
          <Campo nome="cidade" rotulo="Sua cidade" maxLength={100} />
          <CampoTexto nome="observacoes" rotulo="Observações" linhas={3} maxLength={600} />
          <CampoMarcacao nome="consentimentoLgpd" obrigatorio rotulo="Autorizo o tratamento dos meus dados." />
        </Formulario>
      );

    case "visitante":
    default:
      return (
        <Formulario tipo="visitante" textoBotao="Avisar que vou visitar">
          <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" obrigatorio autoComplete="tel" maxLength={20} />
          <Campo nome="email" rotulo="E-mail" tipo="email" autoComplete="email" maxLength={254} />
          <CampoTexto nome="mensagem" rotulo="Quer nos contar algo?" linhas={3} maxLength={1000} />
          <CampoMarcacao nome="consentimentoLgpd" obrigatorio rotulo="Autorizo o tratamento dos meus dados." />
        </Formulario>
      );
  }
}
