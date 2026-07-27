import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, formatarPreco, nomeDia } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { Campo, CampoMarcacao, CampoTexto, Formulario } from "@/components/site/Formulario";

/**
 * Escola de discipulado — cursos e inscrição.
 *
 * POR QUE UM FORMULÁRIO SÓ, E NÃO UM POR CARTÃO
 * A tentação é renderizar um formulário embaixo de cada curso. O problema é
 * concreto: `Campo` usa o nome do campo como `id`, e cinco formulários na
 * mesma página produziriam cinco `id="nome"`. IDs repetidos quebram a ligação
 * `<label for>` → input, e o leitor de tela passa a anunciar o rótulo errado —
 * exatamente para quem mais depende dele.
 *
 * Então o curso escolhido vem por query string (`?curso=<slug>`), é validado
 * contra a lista fechada de cursos ATIVOS E COM INSCRIÇÕES ABERTAS desta
 * igreja, e o `cursoId` correspondente vai num campo oculto. O visitante nunca
 * digita um id; ele escolhe um slug que ou existe nesta igreja, ou é
 * descartado. Como o id sai do banco e não da URL, também não há como inscrever
 * alguém num curso de outra igreja.
 *
 * NOTA DE ROTEAMENTO
 * Esta rota tem prioridade sobre a página `/escola` do editor whitelabel:
 * preço, vagas e status de inscrição precisam vir do banco, ao vivo.
 */

export const dynamic = "force-dynamic";

const esquemaFiltros = z.object({
  curso: z.string().trim().max(80).default(""),
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Escola",
    description:
      `Cursos da ${config.nomeExibicao}: fundamentos sólidos para uma fé que sustenta a vida. ` +
      `Conheça as turmas e faça sua inscrição.`,
    alternates: { canonical: "/escola" },
    openGraph: {
      title: `Escola · ${config.nomeExibicao}`,
      description: "Formação bíblica para quem quer conhecer no que crê e por quê.",
    },
  };
}

export default async function PaginaEscola({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const { config, cursos } = dados;

  const analise = esquemaFiltros.safeParse(await searchParams);
  const slugPedido = analise.success ? analise.data.curso : "";

  const abertos = cursos.filter((c) => c.inscricoesAbertas);
  // Lista fechada: só um curso já carregado do banco desta igreja pode ser
  // selecionado. Slug desconhecido cai em `undefined` e a página mostra a
  // escolha de turmas, sem erro.
  const selecionado = abertos.find((c) => c.slug === slugPedido);

  return (
    <>
      {/* ------------------------------------------------------------- ABERTURA */}
      <section className="section theme-dark">
        <div className="container">
          <p className="eyebrow">Escola</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            Uma fé que <span className="serif-italic gold">sustenta</span> a vida.
          </h1>
          <p className="lead measure" style={{ marginTop: "1.4rem" }}>
            Fé não é sentimento sem conteúdo. Aqui você aprende no que crê, por que crê e como isso
            muda a segunda-feira de manhã — com professores da casa e turmas pequenas o bastante
            para perguntar.
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------------- TURMAS */}
      <section className="section theme-light" id="turmas">
        <div className="container">
          <p className="eyebrow">Turmas</p>
          <h2 style={{ marginTop: "1.2rem" }}>O que está aberto agora.</h2>

          {cursos.length === 0 ? (
            <div className="vazio" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
              <p>
                As turmas do próximo semestre estão sendo montadas.{" "}
                <Link href="/contato" className="gold">
                  Fale conosco
                </Link>{" "}
                para ser avisado quando as inscrições abrirem.
              </p>
            </div>
          ) : (
            <div className="grid cols-2" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
              {cursos.map((curso) => {
                const preco = formatarPreco(curso.precoCentavos, curso.periodicidade);
                const horario = [nomeDia(curso.diaSemana), curso.horario]
                  .filter((p) => !!p)
                  .join(" · ");

                return (
                  <article
                    className="card"
                    key={curso.id}
                    id={`curso-${curso.slug}`}
                    // Destaque discreto no curso escolhido: quem chegou de um
                    // link direto precisa reconhecer de onde a inscrição veio.
                    style={
                      selecionado?.id === curso.id
                        ? { borderColor: "var(--gold)" }
                        : undefined
                    }
                  >
                    {horario && <p className="index-tag">{horario}</p>}
                    <h3 className="card__titulo">{curso.nome}</h3>
                    {curso.resumo && <p className="card__texto">{curso.resumo}</p>}

                    <div
                      style={{
                        marginTop: "auto",
                        paddingTop: "1.4rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span className="gold" style={{ fontWeight: 600, fontSize: ".9rem" }}>
                        {preco ?? "Gratuito"}
                      </span>

                      {curso.inscricoesAbertas ? (
                        <Link
                          href={`/escola?curso=${encodeURIComponent(curso.slug)}#inscricao`}
                          className="btn btn--sm"
                        >
                          Inscrever-me
                        </Link>
                      ) : (
                        <span className="etiqueta etiqueta--concluido">Inscrições fechadas</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------- INSCRIÇÃO */}
      {abertos.length > 0 && (
        <section className="section theme-cream" id="inscricao">
          <div className="container container--narrow">
            <p className="eyebrow">Inscrição</p>

            {selecionado ? (
              <>
                <h2 style={{ marginTop: "1.2rem" }}>{selecionado.nome}</h2>

                <p className="dim" style={{ marginTop: "1rem", fontSize: ".95rem" }}>
                  {[
                    [nomeDia(selecionado.diaSemana), selecionado.horario]
                      .filter((p) => !!p)
                      .join(" · "),
                    formatarPreco(selecionado.precoCentavos, selecionado.periodicidade) ??
                      "Gratuito",
                  ]
                    .filter((p) => !!p)
                    .join(" — ")}
                </p>

                {selecionado.descricao && (
                  <div className="measure dim" style={{ marginTop: "1.8rem" }}>
                    <Paragrafos texto={selecionado.descricao} />
                  </div>
                )}

                <div style={{ marginTop: "2.5rem" }}>
                  <Formulario tipo="inscricao-curso" textoBotao="Confirmar inscrição">
                    {/*
                      O id do curso NÃO vem da URL: vem do registro que
                      acabamos de carregar do banco desta igreja. A URL só
                      escolhe qual, entre os cursos que já existem aqui.
                    */}
                    <input type="hidden" name="cursoId" defaultValue={selecionado.id} />

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
                </div>

                <p className="campo__ajuda" style={{ marginTop: "1.4rem" }}>
                  Escolheu a turma errada?{" "}
                  <Link href="/escola#turmas" className="gold">
                    Voltar para a lista
                  </Link>
                  .
                </p>
              </>
            ) : (
              <>
                <h2 style={{ marginTop: "1.2rem" }}>Escolha a sua turma.</h2>
                <p className="lead" style={{ marginTop: "1.2rem", marginBottom: "2.5rem" }}>
                  A inscrição é feita por curso. Selecione abaixo e o formulário aparece já
                  vinculado à turma certa.
                </p>

                <div className="grid cols-2">
                  {abertos.map((curso) => (
                    <Link
                      key={curso.id}
                      href={`/escola?curso=${encodeURIComponent(curso.slug)}#inscricao`}
                      className="btn btn--ghost"
                      style={{ justifyContent: "space-between", textAlign: "left" }}
                    >
                      {curso.nome}
                      <span aria-hidden="true">→</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- APOIO */}
      <section className="section section--tight theme-dark">
        <div className="container container--narrow centro stack">
          <p className="pullquote">
            &ldquo;Aplica o teu coração ao <span className="accent">ensino</span> e os teus ouvidos
            às palavras do conhecimento.&rdquo;
          </p>
          <p className="pullquote__by">Provérbios 23.12</p>
          <p className="lead" style={{ marginTop: "1.5rem" }}>
            Dúvidas sobre qual turma começar? Fale com a secretaria da {config.nomeExibicao}.
          </p>
          <div style={{ marginTop: "1rem" }}>
            <Link href="/contato" className="btn">
              Falar com a igreja
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

/** Converte texto puro em parágrafos. NÃO interpreta HTML. */
function Paragrafos({ texto }: { texto: string }) {
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <>
      {paragrafos.map((paragrafo, i) => (
        <p key={i} style={{ marginBottom: "1.1em" }}>
          {paragrafo.split("\n").map((linha, j, todas) => (
            <span key={j}>
              {linha}
              {j < todas.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}
