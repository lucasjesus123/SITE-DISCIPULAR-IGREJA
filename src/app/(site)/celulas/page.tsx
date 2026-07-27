import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, nomeDia, type CelulaPublica } from "@/lib/services/site";
import { obterTokenCsrf } from "@/lib/security/csrf";
import {
  Campo,
  CampoMarcacao,
  CampoSelecao,
  CampoTexto,
  Formulario,
} from "@/components/site/Formulario";

/**
 * "A igreja perto de você" — a rede de células.
 *
 * O QUE ESTA PÁGINA DELIBERADAMENTE NÃO MOSTRA
 * Endereço. Nenhum. Célula acontece na casa de um membro, e publicar rua e
 * número na internet expõe uma família — não a instituição. O serviço
 * (`carregarDadosSite`) já nem traz o logradouro no `select`, então o dado não
 * chega até aqui nem por engano. O público vê cidade, bairro, dia e horário; o
 * endereço vai por contato direto, depois que a pessoa se identifica pelo
 * formulário no fim da página.
 *
 * Pelo mesmo motivo, do líder mostramos só o primeiro nome: "nome completo +
 * bairro + dia e hora fixos toda semana" é informação suficiente para
 * localizar uma pessoa específica na quinta-feira à noite.
 *
 * NOTA DE ROTEAMENTO
 * Esta rota tem prioridade sobre a página `/celulas` do editor whitelabel. É
 * intencional: a lista de células precisa vir do banco, ao vivo, e não de
 * blocos digitados à mão que envelhecem em duas semanas.
 */

export const dynamic = "force-dynamic";

const esquemaFiltros = z.object({
  cidade: z.string().trim().max(100).default(""),
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return {};

  const { config } = await carregarDadosSite(tenant.id);

  return {
    title: "Células",
    description:
      `Encontre uma célula da ${config.nomeExibicao} perto de você. Pequenos grupos para ` +
      `adorar, ouvir a Palavra e interceder — no seu bairro, durante a semana.`,
    alternates: { canonical: "/celulas" },
    openGraph: {
      title: `Células · ${config.nomeExibicao}`,
      description: `A igreja reunida em pequenos grupos, perto de você.`,
    },
  };
}

export default async function PaginaCelulas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  // `obterTokenCsrf` grava o cookie antes de o formulário existir na tela.
  // Sem esta chamada, o primeiro envio do visitante falharia por falta de par.
  const [dados] = await Promise.all([carregarDadosSite(tenant.id), obterTokenCsrf()]);
  const { config, celulas } = dados;

  const analise = esquemaFiltros.safeParse(await searchParams);
  const filtroBruto = analise.success ? analise.data.cidade : "";

  const grupos = agruparPorCidade(celulas);
  const cidades = [...grupos.keys()];

  // Lista fechada montada a partir dos dados desta igreja: qualquer outro
  // valor na query string é simplesmente ignorado, sem erro e sem 404.
  const cidadeSelecionada = cidades.includes(filtroBruto) ? filtroBruto : "";
  const cidadesVisiveis = cidadeSelecionada ? [cidadeSelecionada] : cidades;

  return (
    <>
      {/* ------------------------------------------------------------- ABERTURA */}
      <section className="section theme-dark">
        <div className="container">
          <p className="eyebrow">Células</p>
          <h1 style={{ marginTop: "1.2rem" }}>
            A igreja perto <span className="serif-italic gold">de você</span>.
          </h1>
          <p className="lead measure" style={{ marginTop: "1.4rem" }}>
            No domingo somos uma igreja reunida. Durante a semana somos a mesma igreja espalhada —
            em salas de estar, ao redor de uma mesa, com café e Bíblia aberta. É isso que chamamos
            de célula.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------ TRÊS PROPÓSITOS */}
      <section className="section theme-light">
        <div className="container">
          <div className="centro" style={{ marginBottom: "clamp(2.5rem, 5vw, 4rem)" }}>
            <p className="eyebrow eyebrow--centered">Por que nos reunimos</p>
            <h2 style={{ marginTop: "1.2rem" }}>Três propósitos, toda semana.</h2>
            <p className="lead measure" style={{ marginInline: "auto", marginTop: "1.2rem" }}>
              Uma célula não é um curso nem uma reunião de negócios. É a família de Deus fazendo
              três coisas simples e antigas.
            </p>
          </div>

          <div className="grid cols-3">
            <Proposito
              indice="01"
              titulo="Adorar"
              texto="Antes de qualquer assunto, os olhos em Deus. Cantamos, agradecemos e lembramos quem Ele é — não porque estamos bem, mas porque Ele é digno."
            />
            <Proposito
              indice="02"
              titulo="Proclamar a Palavra"
              texto="A Bíblia aberta e explicada em linguagem de gente. Cada um pode perguntar, discordar, não entender e voltar na semana seguinte. É assim que a fé cria raiz."
            />
            <Proposito
              indice="03"
              titulo="Interceder"
              texto="Levamos uns aos outros diante de Deus pelo nome. O pedido dito ali fica ali — a célula é lugar de oração, não de comentário."
            />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- A REDE */}
      <section className="section theme-cream" id="encontrar">
        <div className="container">
          <p className="eyebrow">Onde encontrar</p>
          <h2 style={{ marginTop: "1.2rem" }}>Nossas células.</h2>
          <p className="lead measure" style={{ marginTop: "1.2rem" }}>
            Escolha a que fica mais perto. O endereço completo é combinado no contato — as células
            acontecem na casa de famílias da igreja, e isso a gente cuida.
          </p>

          {celulas.length === 0 ? (
            <div className="vazio" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
              <p>
                Estamos organizando a rede de células. Preencha o formulário abaixo e avisamos você
                assim que abrir uma perto da sua casa.
              </p>
            </div>
          ) : (
            <>
              {cidades.length > 1 && (
                <nav
                  className="barra-ferramentas"
                  aria-label="Filtrar células por cidade"
                  style={{ marginTop: "clamp(2rem, 4vw, 3rem)" }}
                >
                  <Link href="/celulas#encontrar" className="filtro-chip" aria-pressed={!cidadeSelecionada}>
                    Todas as cidades
                  </Link>
                  {cidades.map((cidade) => (
                    <Link
                      key={cidade}
                      href={`/celulas?cidade=${encodeURIComponent(cidade)}#encontrar`}
                      className="filtro-chip"
                      aria-pressed={cidadeSelecionada === cidade}
                    >
                      {cidade}
                    </Link>
                  ))}
                </nav>
              )}

              {cidadesVisiveis.map((cidade) => {
                const daCidade = grupos.get(cidade) ?? [];
                return (
                  <div key={cidade} style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
                    <h3 className="h4" style={{ marginBottom: "1.5rem" }}>
                      {cidade}
                      <span className="dim" style={{ fontSize: "1rem", marginLeft: ".8rem" }}>
                        {daCidade.length === 1 ? "1 célula" : `${daCidade.length} células`}
                      </span>
                    </h3>

                    <div className="grid cols-3">
                      {daCidade.map((celula) => (
                        <article className="card" key={celula.id}>
                          {celula.bairro && <p className="index-tag">{celula.bairro}</p>}
                          <h4 className="card__titulo" style={{ fontSize: "var(--step-1)" }}>
                            {celula.nome}
                          </h4>
                          <p className="card__texto">
                            {encontro(celula.diaSemana, celula.horario) ?? "Horário a confirmar"}
                          </p>
                          {primeiroNome(celula.liderNome) && (
                            <p className="card__texto" style={{ marginTop: "auto" }}>
                              Com {primeiroNome(celula.liderNome)}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------- FORMULÁRIO */}
      <section className="section theme-light" id="quero-participar">
        <div className="container container--narrow">
          <p className="eyebrow">Quero participar</p>
          <h2 style={{ marginTop: "1.2rem" }}>Vamos te levar até uma.</h2>
          <p className="lead" style={{ marginTop: "1.2rem", marginBottom: "2.5rem" }}>
            Conte onde você mora e qual dia funciona melhor. Alguém da {config.nomeExibicao} entra
            em contato para apresentar você à célula mais próxima — sem compromisso e sem visita
            surpresa.
          </p>

          <Formulario tipo="quero-celula" textoBotao="Quero participar">
            <Campo nome="nome" rotulo="Seu nome" obrigatorio autoComplete="name" maxLength={160} />

            <div className="grid cols-2" style={{ gap: "1.4rem" }}>
              <Campo
                nome="telefone"
                rotulo="WhatsApp"
                tipo="tel"
                obrigatorio
                autoComplete="tel"
                maxLength={20}
              />
              <Campo
                nome="email"
                rotulo="E-mail"
                tipo="email"
                autoComplete="email"
                maxLength={254}
              />
            </div>

            <div className="grid cols-2" style={{ gap: "1.4rem" }}>
              <Campo
                nome="bairro"
                rotulo="Seu bairro"
                autoComplete="address-level3"
                maxLength={100}
                ajuda="Só o bairro. Não precisamos do seu endereço."
              />
              <Campo
                nome="cidade"
                rotulo="Sua cidade"
                autoComplete="address-level2"
                maxLength={100}
              />
            </div>

            <CampoSelecao
              nome="diaPreferido"
              rotulo="Melhor dia para você"
              opcoes={[0, 1, 2, 3, 4, 5, 6].map((dia) => ({
                valor: String(dia),
                rotulo: nomeDia(dia),
              }))}
              ajuda="Se nenhum dia for perfeito, escolha o mais provável — a gente conversa."
            />

            <CampoTexto
              nome="observacoes"
              rotulo="Quer nos contar algo?"
              linhas={3}
              maxLength={600}
            />

            <CampoMarcacao
              nome="consentimentoLgpd"
              obrigatorio
              rotulo="Autorizo o tratamento dos meus dados para que a igreja entre em contato sobre células."
            />
          </Formulario>
        </div>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function Proposito({
  indice,
  titulo,
  texto,
}: {
  indice: string;
  titulo: string;
  texto: string;
}) {
  return (
    <article className="card">
      <p className="index-tag">{indice}</p>
      <h3 className="card__titulo">{titulo}</h3>
      <p className="card__texto">{texto}</p>
    </article>
  );
}

/**
 * Agrupa por cidade preservando a ordem que veio do banco (cidade, bairro).
 * Um `Map` mantém a ordem de inserção, então não é preciso reordenar depois.
 */
function agruparPorCidade(celulas: CelulaPublica[]): Map<string, CelulaPublica[]> {
  const grupos = new Map<string, CelulaPublica[]>();

  for (const celula of celulas) {
    const cidade = celula.cidade?.trim() || "Outras localidades";
    const existente = grupos.get(cidade);
    if (existente) existente.push(celula);
    else grupos.set(cidade, [celula]);
  }

  return grupos;
}

function encontro(diaSemana: number | null, horario: string | null): string | null {
  // `nomeDia` devolve string vazia para dia nulo ou fora de 0–6, então o
  // filtro abaixo cobre os dois casos de uma vez.
  const partes = [nomeDia(diaSemana), horario].filter((p): p is string => !!p);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/**
 * Só o primeiro nome do líder. Ver a nota no topo do arquivo: a combinação
 * "nome completo + bairro + horário fixo semanal" identifica uma pessoa.
 */
function primeiroNome(nome: string | null): string | null {
  if (!nome) return null;
  const partes = nome.trim().split(/\s+/);
  return partes[0] ?? null;
}
