import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { tenantDb } from "@/lib/db/tenant-client";
import { urlEmbed, urlMiniatura } from "@/lib/youtube/live";
import { slug as slugValido } from "@/lib/validation/comum";

export const dynamic = "force-dynamic";

/**
 * Uma pregação: player + descrição.
 *
 * =============================================================================
 * O `src` DO IFRAME É MONTADO POR NÓS, A PARTIR DE UM ID VALIDADO
 * =============================================================================
 * `Mensagem.youtubeVideoId` guarda SÓ o id de 11 caracteres — a coluna de URL
 * crua nem existe, por decisão de schema. Aqui o id passa de novo por
 * `urlEmbed()`, que reaplica a regex e devolve `null` se não bater.
 *
 * Se o campo guardasse a URL colada pelo usuário e ela fosse usada direto no
 * `src`, um admin de igreja (ou qualquer pessoa que comprometesse a conta dele)
 * poderia gravar `javascript:...` ou apontar o frame para um site hostil dentro
 * do domínio da igreja. Validar na escrita e MONTAR na leitura fecha os dois
 * lados: mesmo que um valor ruim chegue ao banco por outro caminho, ele não
 * vira `src`.
 */

/**
 * Carregamento único da mensagem, compartilhado por `generateMetadata` e pelo
 * componente. Sem o `cache()`, o Next chamaria a consulta duas vezes por
 * acesso — e nesta rota isso significaria dobrar o custo de cada pregação
 * aberta no meio da semana.
 */
const carregarMensagem = cache(async (tenantId: string, slug: string) => {
  return tenantDb(tenantId).mensagem.findFirst({
    where: { slug, publicado: true },
    select: {
      id: true,
      titulo: true,
      slug: true,
      descricao: true,
      preletor: true,
      serie: true,
      youtubeVideoId: true,
      data: true,
      duracaoSegundos: true,
    },
  });
});

/** Valida o slug ANTES de tocar o banco. Não é só higiene: economiza uma
 *  consulta por requisição de varredura automatizada. */
function slugDaRota(valor: string): string | null {
  const resultado = slugValido.safeParse(valor);
  return resultado.success ? resultado.data : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return { title: "Mensagem" };

  const { slug } = await params;
  const limpo = slugDaRota(slug);
  if (!limpo) return { title: "Mensagem" };

  const mensagem = await carregarMensagem(tenant.id, limpo);
  return { title: mensagem?.titulo ?? "Mensagem" };
}

export default async function AppMensagem({ params }: { params: Promise<{ slug: string }> }) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const { slug } = await params;
  const limpo = slugDaRota(slug);
  if (!limpo) notFound();

  const mensagem = await carregarMensagem(tenant.id, limpo);
  // Mensagem inexistente e mensagem de outra igreja dão exatamente o mesmo
  // 404 — o cliente escopado já filtrou por tenant, e a resposta idêntica
  // impede usar a rota para descobrir o que existe na plataforma.
  if (!mensagem) notFound();

  const embed = mensagem.youtubeVideoId ? urlEmbed(mensagem.youtubeVideoId) : null;

  const outras = await tenantDb(tenant.id).mensagem.findMany({
    where: { publicado: true, slug: { not: mensagem.slug } },
    orderBy: [{ data: "desc" }, { criadoEm: "desc" }],
    select: { id: true, titulo: true, slug: true, preletor: true, youtubeVideoId: true },
    take: 4,
  });

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.25rem) 1.25rem 1rem" }}>
        <Link href="/app/mensagens" style={{ fontSize: ".8rem", color: "var(--bone-faint)" }}>
          ← Mensagens
        </Link>
      </header>

      <section style={{ padding: "0 1.25rem 1.5rem" }}>
        {embed ? (
          <div className="frame">
            <iframe
              src={embed}
              title={mensagem.titulo}
              allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
              /*
               * `sandbox` limita o iframe mesmo sendo do YouTube. Sem
               * `allow-top-navigation`, um embed comprometido não consegue
               * arrastar a página inteira do membro para outro endereço.
               */
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="lazy"
            />
          </div>
        ) : (
          <div className="frame">
            <div className="frame__placeholder">
              {mensagem.youtubeVideoId
                ? "Vídeo indisponível"
                : "Esta mensagem não tem vídeo publicado"}
            </div>
          </div>
        )}
      </section>

      <section style={{ padding: "0 1.25rem 2rem" }}>
        {mensagem.serie && (
          <p className="eyebrow" style={{ marginBottom: ".9rem" }}>
            {mensagem.serie}
          </p>
        )}

        <h1 style={{ fontSize: "1.65rem", lineHeight: 1.2 }}>{mensagem.titulo}</h1>

        <p style={{ fontSize: ".82rem", color: "var(--bone-faint)", marginTop: ".7rem" }}>
          {[
            mensagem.preletor,
            formatarData(mensagem.data),
            formatarDuracao(mensagem.duracaoSegundos),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {mensagem.descricao && (
          /*
           * Texto puro, com as quebras de linha preservadas por CSS.
           * `dangerouslySetInnerHTML` aqui transformaria o editor do painel num
           * vetor de XSS armazenado servido a todos os membros da igreja.
           */
          <p
            style={{
              marginTop: "1.4rem",
              color: "var(--bone-dim)",
              lineHeight: 1.7,
              fontSize: ".93rem",
              whiteSpace: "pre-wrap",
            }}
          >
            {mensagem.descricao}
          </p>
        )}

        {mensagem.youtubeVideoId && (
          <a
            href={`https://www.youtube.com/watch?v=${mensagem.youtubeVideoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--block btn--ghost"
            style={{ marginTop: "1.6rem" }}
          >
            Abrir no YouTube
          </a>
        )}
      </section>

      {outras.length > 0 && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1.1rem" }}>
            Continue ouvindo
          </p>
          <div style={{ display: "grid", gap: ".7rem" }}>
            {outras.map((m) => (
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
                  <div
                    style={{
                      width: 100,
                      aspectRatio: "16/9",
                      flex: "none",
                      borderRadius: 6,
                      overflow: "hidden",
                      background: "var(--ink-900)",
                    }}
                  >
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
                  <p style={{ fontWeight: 600, fontSize: ".88rem", lineHeight: 1.35 }}>{m.titulo}</p>
                  {m.preletor && (
                    <p style={{ fontSize: ".74rem", color: "var(--bone-faint)", marginTop: ".25rem" }}>
                      {m.preletor}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** Ver a nota em /app/mensagens: `data` é `@db.Date` e precisa de fuso UTC. */
function formatarData(data: Date | null): string | null {
  if (!data) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(data);
}

function formatarDuracao(segundos: number | null): string | null {
  if (!segundos || segundos <= 0) return null;
  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}
