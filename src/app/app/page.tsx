import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, carregarMensagens, nomeDia } from "@/lib/services/site";
import { estadoAoVivo, urlMiniatura } from "@/lib/youtube/live";
import { sessaoAtual } from "@/lib/auth/session";
import { SeloAoVivo } from "@/components/site/AoVivo";
import { urlArquivoPublico } from "@/lib/storage/urls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Início" };

/**
 * Tela inicial do app do membro.
 *
 * Responde, em ordem: "tem culto agora?", "quando é o próximo?", "o que
 * assisto?", "o que eu faço agora?".
 */
export default async function AppInicio() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [dados, live, mensagens, sessao] = await Promise.all([
    carregarDadosSite(tenant.id),
    estadoAoVivo(tenant.id),
    carregarMensagens(tenant.id, 3),
    sessaoAtual(),
  ]);

  const { config, agenda } = dados;
  const logado = sessao !== null && sessao.tenantId === tenant.id;
  const hoje = new Date().getDay();

  const proximos = [...agenda]
    .filter((a) => a.diaSemana !== null)
    // Ordena a partir de hoje, dando a volta na semana.
    .sort((a, b) => ((a.diaSemana! - hoje + 7) % 7) - ((b.diaSemana! - hoje + 7) % 7))
    .slice(0, 3);

  const logo = config.logoClaroId ? urlArquivoPublico(config.logoClaroId) : null;

  return (
    <>
      {/* ------------------------------------------------------------- TOPO */}
      <header
        style={{
          padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.5rem",
          borderBottom: "1px solid var(--line-on-dark)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={config.nomeExibicao} style={{ height: 26 }} />
            ) : (
              <p style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>
                {config.nomeExibicao}
              </p>
            )}
            <p style={{ fontSize: ".78rem", color: "var(--bone-faint)", marginTop: ".2rem" }}>
              {logado ? `Olá, ${sessao.nome.split(" ")[0]}` : "Seja bem-vindo"}
            </p>
          </div>

          <SeloAoVivo
            inicial={{ aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo }}
            href="/app/ao-vivo"
          />
        </div>
      </header>

      {/* --------------------------------------------------------- AO VIVO */}
      {live.aoVivo && (
        <Link
          href="/app/ao-vivo"
          style={{
            display: "flex",
            alignItems: "center",
            gap: ".8rem",
            padding: "1rem 1.25rem",
            background: "#E5484D",
            color: "#fff",
            fontWeight: 600,
            fontSize: ".9rem",
          }}
        >
          <span className="ao-vivo__ponto" aria-hidden="true" style={{ background: "#fff" }} />
          <span style={{ flex: 1 }}>{live.titulo ?? "O culto começou. Assista agora."}</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      {/* ----------------------------------------------------- ATALHOS */}
      <section style={{ padding: "1.5rem 1.25rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".8rem" }}>
          <Atalho href="/app/oracao" titulo="Pedido de oração" desc="Fale com a equipe" />
          <Atalho href="/app/agenda" titulo="Agenda" desc="Cultos e encontros" />
          <Atalho href="/app/celulas" titulo="Células" desc="Encontre a sua" />
          <Atalho href="/app/contribuir" titulo="Contribuir" desc="PIX e ofertas" />
        </div>
      </section>

      {/* ----------------------------------------------------- PRÓXIMOS */}
      {proximos.length > 0 && (
        <section style={{ padding: "0 1.25rem 1.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1rem" }}>
            Próximos encontros
          </p>
          <div style={{ display: "grid", gap: ".6rem" }}>
            {proximos.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  gap: "1rem",
                  padding: "1rem",
                  background: "var(--ink-700)",
                  border: "1px solid var(--line-on-dark)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <div style={{ minWidth: 62 }}>
                  <p style={{ fontSize: ".64rem", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 600 }}>
                    {nomeDia(item.diaSemana).slice(0, 3)}
                  </p>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", marginTop: ".15rem" }}>
                    {item.horario ?? "—"}
                  </p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 600, fontSize: ".95rem" }}>{item.titulo}</p>
                  {item.campusNome && (
                    <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", marginTop: ".15rem" }}>
                      {item.campusNome}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------- MENSAGENS */}
      {mensagens.length > 0 && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1rem" }}>
            <p className="eyebrow">Últimas mensagens</p>
            <Link href="/app/mensagens" style={{ fontSize: ".78rem", color: "var(--gold)" }}>
              Ver todas
            </Link>
          </div>

          <div style={{ display: "grid", gap: ".9rem" }}>
            {mensagens.map((m) => (
              <Link
                key={m.id}
                href={`/app/mensagens/${m.slug}`}
                style={{
                  display: "block",
                  borderRadius: "var(--radius-lg)",
                  overflow: "hidden",
                  border: "1px solid var(--line-on-dark)",
                  background: "var(--ink-700)",
                }}
              >
                {m.youtubeVideoId && (
                  <div style={{ aspectRatio: "16/9", background: "var(--ink-900)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlMiniatura(m.youtubeVideoId) ?? ""}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ padding: "1rem" }}>
                  <p style={{ fontFamily: "var(--font-display)", fontSize: "1.05rem" }}>{m.titulo}</p>
                  <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", marginTop: ".25rem" }}>
                    {[m.preletor, m.data && new Intl.DateTimeFormat("pt-BR").format(m.data)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!logado && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <div
            style={{
              padding: "1.5rem",
              border: "1px solid var(--gold-line)",
              borderRadius: "var(--radius-lg)",
              background: "rgb(var(--gold-rgb) / .06)",
            }}
          >
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem" }}>
              Faça parte da nossa casa
            </p>
            <p style={{ fontSize: ".88rem", color: "var(--bone-dim)", marginTop: ".5rem" }}>
              Entre com sua conta para acompanhar sua célula, seus pedidos e sua jornada.
            </p>
            <Link href="/login" className="btn btn--block" style={{ marginTop: "1.2rem" }}>
              Entrar
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

function Atalho({ href, titulo, desc }: { href: string; titulo: string; desc: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "1.1rem",
        background: "var(--ink-700)",
        border: "1px solid var(--line-on-dark)",
        borderRadius: "var(--radius-lg)",
        minHeight: 88,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <span style={{ fontWeight: 600, fontSize: ".92rem" }}>{titulo}</span>
      <span style={{ fontSize: ".76rem", color: "var(--bone-faint)", marginTop: ".2rem" }}>{desc}</span>
    </Link>
  );
}
