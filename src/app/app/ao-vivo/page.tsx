import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite, carregarMensagens } from "@/lib/services/site";
import { estadoAoVivo, urlMiniatura } from "@/lib/youtube/live";
import { PlayerAoVivo } from "@/components/site/AoVivo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ao vivo" };

export default async function AppAoVivo() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [live, dados, mensagens] = await Promise.all([
    estadoAoVivo(tenant.id),
    carregarDadosSite(tenant.id),
    carregarMensagens(tenant.id, 8),
  ]);

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Transmissão</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>
          {live.aoVivo ? "Estamos ao vivo" : "Ao vivo"}
        </h1>
      </header>

      <section style={{ padding: "0 1.25rem 2rem" }}>
        <PlayerAoVivo
          inicial={{ aoVivo: live.aoVivo, videoId: live.videoId, titulo: live.titulo }}
        />

        {!live.aoVivo && (
          <p style={{ marginTop: "1.2rem", color: "var(--bone-dim)", fontSize: ".9rem" }}>
            Nenhuma transmissão agora. Assim que o culto começar, esta tela avisa você
            automaticamente — e a luzinha vermelha acende no menu.
          </p>
        )}

        {live.aoVivo && live.videoId && (
          <a
            href={`https://www.youtube.com/watch?v=${live.videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--block btn--ghost"
            style={{ marginTop: "1.2rem" }}
          >
            Abrir no YouTube
          </a>
        )}
      </section>

      {mensagens.length > 0 && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1.2rem" }}>
            Mensagens anteriores
          </p>
          <div style={{ display: "grid", gap: ".9rem" }}>
            {mensagens.map((m) => (
              <Link
                key={m.id}
                href={`/app/mensagens/${m.slug}`}
                style={{
                  display: "flex",
                  gap: ".9rem",
                  padding: ".7rem",
                  background: "var(--ink-700)",
                  border: "1px solid var(--line-on-dark)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                {m.youtubeVideoId && (
                  <div style={{ width: 108, aspectRatio: "16/9", flex: "none", borderRadius: 6, overflow: "hidden", background: "var(--ink-900)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={urlMiniatura(m.youtubeVideoId) ?? ""}
                      alt=""
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: ".9rem", lineHeight: 1.35 }}>{m.titulo}</p>
                  <p style={{ fontSize: ".76rem", color: "var(--bone-faint)", marginTop: ".25rem" }}>
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

      {dados.config.youtube && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <a
            href={dados.config.youtube}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--block btn--outline-gold"
          >
            Ver nosso canal
          </a>
        </section>
      )}
    </>
  );
}
