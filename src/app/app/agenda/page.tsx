import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, nomeDia } from "@/lib/services/site";
import { tenantDb } from "@/lib/db/tenant-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

/**
 * Agenda do app.
 *
 * TELA PÚBLICA. Não exige login — ver o horário do culto é justamente o que
 * alguém que ainda não faz parte da igreja precisa. Exigir cadastro aqui
 * afastaria exatamente quem estamos tentando receber.
 *
 * A agenda tem DOIS formatos no schema, e a tela precisa dos dois:
 *   - recorrente: `diaSemana` + `horario`  -> a rotina da semana
 *   - pontual:    `dataHora`               -> conferência, batismo, retiro
 *
 * O recorrente é agrupado por dia começando por HOJE (e não por domingo):
 * quem abre o app numa quinta quer saber o que tem hoje, não navegar até lá.
 */

/** Teto de eventos pontuais carregados. Nenhuma igreja tem 60 eventos futuros
 *  publicados ao mesmo tempo; o limite existe para o caso de importação errada. */
const MAX_EVENTOS = 30;

const ROTULO_TIPO: Record<string, string> = {
  CULTO: "Culto",
  ESCOLA: "Escola",
  CELULA: "Célula",
  EVENTO: "Evento",
  ENSAIO: "Ensaio",
  ORACAO: "Oração",
};

export default async function AppAgenda() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const agora = new Date();

  const [dados, eventos] = await Promise.all([
    carregarDadosSite(tenant.id),
    /**
     * Eventos pontuais futuros.
     *
     * Vale a consulta própria em vez de reaproveitar `dados.agenda`: aquela
     * lista é ordenada por destaque/ordem e limitada a 30 registros, então um
     * evento de dezembro pode simplesmente não caber nela. Aqui filtramos por
     * `dataHora >= agora` no banco e ordenamos por data — o que a tela precisa.
     */
    tenantDb(tenant.id).agendaItem.findMany({
      where: { ativo: true, publicoSite: true, dataHora: { gte: agora } },
      orderBy: { dataHora: "asc" },
      select: {
        id: true,
        tipo: true,
        titulo: true,
        descricao: true,
        dataHora: true,
        destaque: true,
        campus: { select: { nome: true } },
      },
      take: MAX_EVENTOS,
    }),
  ]);

  const recorrentes = dados.agenda.filter((a) => a.diaSemana !== null);

  // Sete grupos a partir de hoje, dando a volta na semana. Dias sem nada saem.
  const hoje = agora.getDay();
  const semana = Array.from({ length: 7 }, (_, deslocamento) => {
    const dia = (hoje + deslocamento) % 7;
    const itens = recorrentes
      .filter((a) => a.diaSemana === dia)
      // Sem horário vai para o fim: "99:99" nunca é um horário válido, então
      // serve como sentinela na comparação de string HH:MM.
      .sort((a, b) => (a.horario ?? "99:99").localeCompare(b.horario ?? "99:99"));
    return { dia, deslocamento, itens };
  }).filter((g) => g.itens.length > 0);

  const temAlgo = semana.length > 0 || eventos.length > 0;

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Nossa semana</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Agenda</h1>
        <p style={{ fontSize: ".88rem", color: "var(--bone-dim)", marginTop: ".7rem" }}>
          Encontros da semana e o que vem por aí. Chegue como puder — tem lugar para você.
        </p>
      </header>

      {!temAlgo && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <div
            style={{
              padding: "1.5rem",
              background: "var(--ink-700)",
              border: "1px solid var(--line-on-dark)",
              borderRadius: "var(--radius-lg)",
              color: "var(--bone-dim)",
              fontSize: ".9rem",
            }}
          >
            A agenda ainda não foi publicada. Fale com a secretaria para saber os horários.
          </div>
        </section>
      )}

      {/* ------------------------------------------------------ SEMANA FIXA */}
      {semana.length > 0 && (
        <section style={{ padding: "0 1.25rem 2rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1.2rem" }}>
            Toda semana
          </p>

          <div style={{ display: "grid", gap: "1.6rem" }}>
            {semana.map((grupo) => (
              <div key={grupo.dia}>
                <p
                  style={{
                    fontSize: ".68rem",
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    color: grupo.deslocamento === 0 ? "var(--gold)" : "var(--bone-faint)",
                    fontWeight: 600,
                    marginBottom: ".7rem",
                  }}
                >
                  {rotuloDoDia(grupo.deslocamento, grupo.dia)}
                </p>

                <div style={{ display: "grid", gap: ".6rem" }}>
                  {grupo.itens.map((item) => (
                    <article key={item.id} style={estiloCartao}>
                      <div style={{ minWidth: 58 }}>
                        <p style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem" }}>
                          {item.horario ?? "—"}
                        </p>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: ".95rem" }}>{item.titulo}</p>
                        <p style={{ fontSize: ".78rem", color: "var(--bone-faint)", marginTop: ".2rem" }}>
                          {[ROTULO_TIPO[item.tipo] ?? item.tipo, item.campusNome]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        {item.descricao && (
                          // Texto puro. Nada de dangerouslySetInnerHTML: a
                          // descrição é escrita no painel por um usuário.
                          <p
                            style={{
                              fontSize: ".82rem",
                              color: "var(--bone-dim)",
                              marginTop: ".45rem",
                              lineHeight: 1.5,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {item.descricao}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* -------------------------------------------------- EVENTOS DATADOS */}
      {eventos.length > 0 && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1.2rem" }}>
            Próximos eventos
          </p>

          <div style={{ display: "grid", gap: ".6rem" }}>
            {eventos.map((evento) => (
              <article
                key={evento.id}
                style={{
                  ...estiloCartao,
                  borderColor: evento.destaque ? "var(--gold-line)" : "var(--line-on-dark)",
                }}
              >
                <div style={{ minWidth: 58 }}>
                  <p
                    style={{
                      fontSize: ".64rem",
                      letterSpacing: ".14em",
                      textTransform: "uppercase",
                      color: "var(--gold)",
                      fontWeight: 600,
                    }}
                  >
                    {evento.dataHora ? formatarDia(evento.dataHora) : ""}
                  </p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginTop: ".15rem" }}>
                    {evento.dataHora ? formatarHora(evento.dataHora) : "—"}
                  </p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: ".95rem" }}>{evento.titulo}</p>
                  <p style={{ fontSize: ".78rem", color: "var(--bone-faint)", marginTop: ".2rem" }}>
                    {[ROTULO_TIPO[evento.tipo] ?? evento.tipo, evento.campus?.nome]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {evento.descricao && (
                    <p
                      style={{
                        fontSize: ".82rem",
                        color: "var(--bone-dim)",
                        marginTop: ".45rem",
                        lineHeight: 1.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {evento.descricao}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        <Link href="/app/celulas" className="btn btn--block btn--outline-gold">
          Encontrar uma célula perto de mim
        </Link>
      </section>
    </>
  );
}

const estiloCartao: React.CSSProperties = {
  display: "flex",
  gap: "1rem",
  padding: "1rem",
  background: "var(--ink-700)",
  border: "1px solid var(--line-on-dark)",
  borderRadius: "var(--radius-lg)",
};

function rotuloDoDia(deslocamento: number, dia: number): string {
  if (deslocamento === 0) return "Hoje · " + nomeDia(dia);
  if (deslocamento === 1) return "Amanhã · " + nomeDia(dia);
  return nomeDia(dia);
}

/**
 * Datas de evento pontual são gravadas em UTC e renderizadas no SERVIDOR.
 *
 * Sem `timeZone` explícito, o Node usaria o fuso do contêiner — que em
 * produção é UTC. Um culto às 19h de domingo apareceria como 22h, e num evento
 * de fim de noite o dia inteiro mudaria. Fixamos o fuso brasileiro, que é o de
 * todas as igrejas atendidas hoje; quando houver cliente fora do Brasil, isto
 * passa a vir de `LiveConfig.fusoHorario`.
 */
const FUSO = "America/Sao_Paulo";

function formatarDia(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: FUSO,
  })
    .format(data)
    .replace(".", "");
}

function formatarHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  }).format(data);
}
