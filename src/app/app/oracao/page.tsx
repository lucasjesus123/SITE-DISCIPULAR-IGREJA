import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { tenantDb } from "@/lib/db/tenant-client";
import { sessaoAtual } from "@/lib/auth/session";
import {
  Campo,
  CampoMarcacao,
  CampoSelecao,
  CampoTexto,
  Formulario,
} from "@/components/site/Formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido de oração" };

/**
 * Pedido de oração pelo app + mural dos membros.
 *
 * O MURAL É ONDE O CUIDADO COM PRIVACIDADE APARECE
 *
 * Só entram no mural pedidos com `visibilidade: MURAL_MEMBROS` — ou seja, a
 * pessoa marcou explicitamente que queria compartilhar. E mesmo assim:
 *
 *   - o mural exige SESSÃO. Sem login, ninguém vê pedido de ninguém.
 *   - o `select` traz título e categoria, NÃO o texto do pedido. Quem quer
 *     interceder não precisa do relato completo do problema de saúde de
 *     alguém para orar por "saúde da família Silva".
 *
 * Essa é a diferença entre "compartilhar com a igreja" e "publicar".
 */
export default async function AppOracao() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const [sessao] = await Promise.all([sessaoAtual(), obterTokenCsrf()]);
  const logado = sessao !== null && sessao.tenantId === tenant.id;

  // O mural só é consultado se houver sessão válida NESTE tenant.
  const mural = logado
    ? await tenantDb(tenant.id).pedidoOracao.findMany({
        where: {
          visibilidade: "MURAL_MEMBROS",
          status: { in: ["RECEBIDO", "ORANDO"] },
        },
        orderBy: [{ urgente: "desc" }, { criadoEm: "desc" }],
        select: {
          id: true,
          titulo: true,
          categoria: true,
          urgente: true,
          anonimo: true,
          nomeSolicitante: true,
          contadorOracoes: true,
          criadoEm: true,
        },
        take: 30,
      })
    : [];

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Intercessão</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Podemos orar por você?</h1>
      </header>

      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        <div className="alerta alerta--aviso" style={{ marginBottom: "1.8rem" }} role="note">
          Seu pedido é visto <strong>somente pela equipe pastoral</strong>, a menos que você escolha
          compartilhar abaixo.
        </div>

        <Formulario tipo="pedido-oracao" textoBotao="Enviar pedido">
          <CampoMarcacao nome="anonimo" rotulo="Enviar de forma anônima" />
          <Campo nome="nome" rotulo="Seu nome" autoComplete="name" maxLength={160} />
          <Campo nome="telefone" rotulo="WhatsApp" tipo="tel" autoComplete="tel" maxLength={20} />

          <CampoSelecao
            nome="categoria"
            rotulo="Sobre o que é"
            opcoes={[
              { valor: "SAUDE", rotulo: "Saúde" },
              { valor: "FAMILIA", rotulo: "Família" },
              { valor: "FINANCEIRO", rotulo: "Financeiro" },
              { valor: "TRABALHO", rotulo: "Trabalho / estudos" },
              { valor: "ESPIRITUAL", rotulo: "Vida espiritual" },
              { valor: "LUTO", rotulo: "Luto" },
              { valor: "GRATIDAO", rotulo: "Gratidão" },
              { valor: "GERAL", rotulo: "Outro" },
            ]}
          />

          <Campo nome="titulo" rotulo="Resumo em poucas palavras" maxLength={160} />
          <CampoTexto nome="pedido" rotulo="Seu pedido" obrigatorio linhas={6} maxLength={3000} />
          <CampoMarcacao nome="urgente" rotulo="É urgente" />

          <CampoSelecao
            nome="visibilidade"
            rotulo="Quem pode ver"
            opcoes={[
              { valor: "PRIVADO", rotulo: "Somente a equipe pastoral" },
              { valor: "MURAL_MEMBROS", rotulo: "Membros da igreja, aqui no app" },
            ]}
          />

          <CampoMarcacao
            nome="querContatoPastoral"
            rotulo="Gostaria de receber um contato pastoral"
          />

          <CampoMarcacao
            nome="consentimentoLgpd"
            obrigatorio
            rotulo="Autorizo o tratamento dos meus dados para que a igreja possa orar por mim."
          />
        </Formulario>
      </section>

      {/* ------------------------------------------------------------ MURAL */}
      {logado && mural.length > 0 && (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <p className="eyebrow" style={{ marginBottom: ".8rem" }}>
            Mural de oração
          </p>
          <p style={{ fontSize: ".84rem", color: "var(--bone-faint)", marginBottom: "1.4rem" }}>
            Pedidos que irmãos escolheram compartilhar. Ore por eles.
          </p>

          <div style={{ display: "grid", gap: ".7rem" }}>
            {mural.map((p) => (
              <article
                key={p.id}
                style={{
                  padding: "1rem",
                  background: "var(--ink-700)",
                  border: "1px solid",
                  borderColor: p.urgente ? "rgb(229 72 77 / .35)" : "var(--line-on-dark)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: ".55rem" }}>
                  <span
                    style={{
                      fontSize: ".64rem",
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: "var(--gold)",
                      fontWeight: 600,
                    }}
                  >
                    {rotuloCategoria(p.categoria)}
                  </span>
                  {p.urgente && (
                    <span style={{ fontSize: ".64rem", letterSpacing: ".12em", textTransform: "uppercase", color: "#E5484D", fontWeight: 600 }}>
                      Urgente
                    </span>
                  )}
                </div>

                {/* Só o resumo. O texto completo do pedido nunca vem para cá. */}
                <p style={{ fontSize: ".95rem", lineHeight: 1.5 }}>
                  {p.titulo ?? "Um irmão precisa de oração"}
                </p>

                <p style={{ fontSize: ".76rem", color: "var(--bone-faint)", marginTop: ".5rem" }}>
                  {p.anonimo ? "Anônimo" : (p.nomeSolicitante ?? "Anônimo")}
                  {p.contadorOracoes > 0 && ` · ${p.contadorOracoes} orando`}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function rotuloCategoria(c: string): string {
  const mapa: Record<string, string> = {
    SAUDE: "Saúde",
    FAMILIA: "Família",
    FINANCEIRO: "Financeiro",
    TRABALHO: "Trabalho",
    ESPIRITUAL: "Espiritual",
    LUTO: "Luto",
    GRATIDAO: "Gratidão",
    GERAL: "Geral",
  };
  return mapa[c] ?? c;
}
