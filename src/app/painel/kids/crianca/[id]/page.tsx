import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { Mascote, Medalha } from "@/components/kids/Mascote";
import { AcoesPassaporte } from "@/components/kids/AcoesPassaporte";
import { idadeEmAnos, resumoFrequencia } from "@/lib/kids/passaporte";

export const dynamic = "force-dynamic";
export const metadata = { title: "Passaporte Kids" };

const FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" });
const ROTULO_TIPO: Record<string, string> = { PRESENCA: "Presença", LICAO: "Lição", MARCO: "Marco", CONQUISTA: "Conquista" };

export default async function Passaporte({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("kids.gerenciar");

  const crianca = await ctx.db.crianca.findFirst({
    where: { id, excluidoEm: null },
    select: {
      id: true, nome: true, apelido: true, dataNascimento: true, alergias: true, restricoes: true,
      salaPadrao: { select: { nome: true } },
      responsaveis: { select: { nome: true, parentesco: true, autorizadoRetirar: true } },
      conquistas: { orderBy: { conquistadaEm: "desc" }, select: { id: true, nome: true, icone: true } },
      evolucoes: { orderBy: { data: "desc" }, take: 40, select: { id: true, tipo: true, titulo: true, descricao: true, data: true } },
      sessoes: { select: { status: true } },
    },
  });
  if (!crianca) notFound();

  const agora = new Date();
  const idade = idadeEmAnos(crianca.dataNascimento, agora);
  const freq = resumoFrequencia(crianca.sessoes);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

  return (
    <>
      <div className="painel__topo">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Mascote tamanho={72} />
          <div>
            <h1 className="painel__titulo">{crianca.apelido || crianca.nome}</h1>
            <p className="painel__sub">
              {idade} ano{idade === 1 ? "" : "s"}{crianca.salaPadrao ? ` · ${crianca.salaPadrao.nome}` : ""} · {freq.total} presença(s)
            </p>
          </div>
        </div>
        <Link href="/painel/kids/criancas" className="btn btn--ghost">← Voltar</Link>
      </div>

      {(crianca.alergias || crianca.restricoes) && (
        <div className="kids-alerta" style={{ marginBottom: "1.2rem" }}>
          {crianca.alergias && <>⚠️ Alergia: {crianca.alergias}. </>}
          {crianca.restricoes && <>⚠️ Restrição: {crianca.restricoes}.</>}
        </div>
      )}

      <div className="split" style={{ alignItems: "start" }}>
        <div className="stack" style={{ "--flow": "1.5rem" } as React.CSSProperties}>
          {/* Medalhas */}
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Medalhas</h2>
            {crianca.conquistas.length === 0 ? (
              <div className="vazio">Nenhuma medalha ainda. Conceda a primeira ao lado!</div>
            ) : (
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                {crianca.conquistas.map((c) => <Medalha key={c.id} icone={c.icone} nome={c.nome} />)}
              </div>
            )}
          </section>

          {/* Linha do tempo */}
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Linha do tempo</h2>
            {crianca.evolucoes.length === 0 ? (
              <div className="vazio">Nada registrado ainda.</div>
            ) : (
              <ul className="kids-timeline">
                {crianca.evolucoes.map((e) => (
                  <li key={e.id} className="kids-timeline__item">
                    <span className="kids-timeline__tipo">{ROTULO_TIPO[e.tipo] ?? e.tipo}</span>
                    <p className="kids-timeline__titulo">{e.titulo}</p>
                    {e.descricao && <p className="kids-timeline__desc">{e.descricao}</p>}
                    <p className="kids-timeline__data">{FMT.format(e.data)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Responsáveis */}
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Responsáveis</h2>
            {crianca.responsaveis.length === 0 ? (
              <div className="vazio">Nenhum responsável vinculado.</div>
            ) : (
              <ul className="stack" style={{ "--flow": ".4rem", fontSize: ".9rem" } as React.CSSProperties}>
                {crianca.responsaveis.map((r, i) => (
                  <li key={i} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{r.nome}{r.parentesco ? ` · ${r.parentesco}` : ""}</span>
                    <span className={`etiqueta etiqueta--${r.autorizadoRetirar ? "novo" : "concluido"}`}>
                      {r.autorizadoRetirar ? "Pode retirar" : "Não retira"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Registrar no passaporte</h2>
          <AcoesPassaporte criancaId={crianca.id} hoje={hoje} />
        </section>
      </div>
    </>
  );
}
