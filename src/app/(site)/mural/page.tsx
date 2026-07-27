import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, carregarMuralPublico } from "@/lib/services/site";

/**
 * Mural público de oração.
 *
 * =============================================================================
 * POR QUE ESTA PÁGINA NÃO MOSTRA O TEXTO DO PEDIDO — leia antes de "melhorar"
 * =============================================================================
 *
 * `carregarMuralPublico` já filtra três vezes (visibilidade PUBLICO, não
 * anônimo, status não arquivado) e nem sequer traz o campo `pedido` no
 * `select`. Esta página fecha o círculo mostrando apenas TÍTULO e CATEGORIA.
 *
 * A razão não é jurídica, é humana. Pedido de oração é o dado mais sensível do
 * sistema: fala de câncer, desemprego, separação, filho preso, luto. Quem
 * escreve "meu marido me traiu, preciso de forças" ao pedir oração não está
 * publicando um post — está desabafando com a igreja. Marcar a caixinha
 * "mural público" no formulário não significa que a pessoa previu aquele texto
 * indexado pelo Google, aparecendo na busca pelo nome dela, e permanecendo lá
 * anos depois de a crise ter passado.
 *
 * O título é o campo que a pessoa escreve sabendo que é resumo. É ele que vai
 * ao ar. O corpo do pedido fica com a equipe pastoral, que é para quem ele foi
 * escrito.
 *
 * O NOME também não é renderizado, mesmo estando disponível. "Fulana de Tal —
 * Saúde" já é uma revelação sobre a saúde de uma pessoa identificável: a
 * categoria, colada ao nome, entrega o que o texto escondido protegia.
 *
 * Quem quiser interagir com o pedido (o botão "estou orando", o nome de quem
 * pediu) encontra isso no aplicativo, atrás de autenticação — e não numa
 * página aberta a qualquer buscador.
 */

export const dynamic = "force-dynamic";

/** Teto de itens. O serviço já limita a 50; 24 é o que cabe numa leitura. */
const LIMITE = 24;

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Mural de oração",
    description:
      `Motivos de oração compartilhados pela comunidade da ${config.nomeExibicao}. ` +
      `Ore por eles — e envie o seu.`,
    alternates: { canonical: "/mural" },
    openGraph: {
      title: `Mural de oração · ${config.nomeExibicao}`,
      description: "Uma igreja que ora junta.",
    },
  };
}

export default async function PaginaMural() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [{ config }, pedidos] = await Promise.all([
    carregarDadosSite(tenant.id),
    carregarMuralPublico(tenant.id, LIMITE),
  ]);

  return (
    <>
      {/* ------------------------------------------------------------- ABERTURA */}
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Mural de oração</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            Ninguém ora <span className="serif-italic gold">sozinho</span>.
          </h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            Estes são motivos que irmãos da {config.nomeExibicao} escolheram compartilhar
            publicamente. Você não precisa conhecer a história inteira para orar por ela.
          </p>
          <div style={{ marginTop: "2.2rem" }}>
            <Link href="/oracao" className="btn">
              Enviar meu pedido
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- OS ITENS */}
      <section className="section theme-light">
        <div className="container">
          <div
            className="alerta alerta--aviso"
            role="note"
            style={{ marginBottom: "clamp(2.5rem, 5vw, 3.5rem)" }}
          >
            <strong>Só o essencial aparece aqui.</strong> Publicamos apenas o resumo e o assunto do
            pedido — nunca o texto completo, nunca o nome de quem pediu, nunca contato. O detalhe
            fica com a equipe pastoral, que é para quem ele foi escrito.
          </div>

          {pedidos.length === 0 ? (
            <div className="vazio">
              <p>
                Nenhum pedido público no momento.{" "}
                <Link href="/oracao" className="gold">
                  Envie o seu
                </Link>{" "}
                — e escolha se quer que ele apareça aqui.
              </p>
            </div>
          ) : (
            <ul
              className="grid cols-3"
              style={{ listStyle: "none", padding: 0, margin: 0 }}
            >
              {pedidos.map((pedido) => (
                <li className="card" key={pedido.id}>
                  <p className="index-tag">{rotuloCategoria(pedido.categoria)}</p>

                  {/* Só o título. O corpo do pedido não chega até esta página. */}
                  <p className="card__titulo" style={{ fontSize: "var(--step-1)" }}>
                    {pedido.titulo?.trim() || "Um motivo de oração"}
                  </p>

                  <div
                    style={{
                      marginTop: "auto",
                      paddingTop: "1.2rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: ".8rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <span className={`etiqueta ${classeStatus(pedido.status)}`}>
                      {rotuloStatus(pedido.status)}
                    </span>
                    <span className="card__texto">
                      <time dateTime={pedido.criadoEm.toISOString()}>
                        {tempoDecorrido(pedido.criadoEm)}
                      </time>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------- CONVITE */}
      <section className="section section--tight theme-cream">
        <div className="container container--narrow centro stack">
          <p className="pullquote">
            &ldquo;Levai as <span className="accent">cargas</span> uns dos outros e, assim,
            cumprireis a lei de Cristo.&rdquo;
          </p>
          <p className="pullquote__by">Gálatas 6.2</p>
          <div
            style={{
              marginTop: "2rem",
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link href="/oracao" className="btn">
              Enviar um pedido
            </Link>
            <Link href="/celulas" className="btn btn--ghost">
              Orar junto numa célula
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------
// Rótulos
// -----------------------------------------------------------------------------

/**
 * `categoria` é VarChar no schema, não enum: um valor antigo ou importado pode
 * não estar no mapa. O fallback devolve "Oração" em vez de despejar a constante
 * crua na tela — e nunca lança.
 */
const CATEGORIAS: Record<string, string> = {
  SAUDE: "Saúde",
  FAMILIA: "Família",
  FINANCEIRO: "Financeiro",
  TRABALHO: "Trabalho",
  ESPIRITUAL: "Vida espiritual",
  LUTO: "Luto",
  GRATIDAO: "Gratidão",
  GERAL: "Oração",
};

function rotuloCategoria(categoria: string): string {
  return CATEGORIAS[categoria] ?? "Oração";
}

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  RECEBIDO: { rotulo: "Recebido", classe: "etiqueta--novo" },
  ORANDO: { rotulo: "Estamos orando", classe: "etiqueta--andamento" },
  RESPONDIDO: { rotulo: "Deus respondeu", classe: "etiqueta--concluido" },
};

function rotuloStatus(status: string): string {
  return STATUS[status]?.rotulo ?? "Recebido";
}

function classeStatus(status: string): string {
  return STATUS[status]?.classe ?? "etiqueta--novo";
}

/**
 * Tempo relativo, arredondado para cima em dias.
 *
 * Data e hora exatas diriam a que horas da madrugada a pessoa escreveu — um
 * detalhe pequeno que, num pedido sobre crise ou luto, conta mais do que
 * deveria. "Há 3 dias" cumpre a função de mostrar que o mural está vivo sem
 * expor o momento.
 */
function tempoDecorrido(data: Date): string {
  const dias = Math.floor((Date.now() - data.getTime()) / 86_400_000);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 30) return `Há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "Há um mês" : `Há ${meses} meses`;
}
