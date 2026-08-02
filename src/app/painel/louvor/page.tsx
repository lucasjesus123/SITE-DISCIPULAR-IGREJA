import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { exigirModulo } from "@/lib/modulos/guard";
import { garantirMinisterioLouvor, carregarEquipe } from "@/lib/services/louvor";
import { nomeDoMes } from "@/lib/louvor/escala";
import { resumirConfirmacoes, type StatusEscalado } from "@/lib/louvor/confirmacao";
import { SubnavLouvor } from "@/components/painel/louvor/SubnavLouvor";
import { FormNovaEscala } from "@/components/painel/louvor/FormNovaEscala";

export const dynamic = "force-dynamic";
export const metadata = { title: "Louvor" };

export default async function PaginaLouvor() {
  const ctx = await exigirPermissao("louvor.gerenciar");
  await exigirModulo(ctx.db, "louvor");
  const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

  const [escalas, equipe] = await Promise.all([
    ctx.db.escalaMinisterio.findMany({
      where: { ministerioId },
      orderBy: [{ ano: "desc" }, { mes: "desc" }],
      include: {
        eventos: {
          select: { id: true, escalados: { select: { status: true } } },
        },
      },
    }),
    carregarEquipe(ctx.db, ministerioId),
  ]);

  const hoje = new Date();

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Ministério de Louvor</h1>
          <p className="painel__sub">Escala do mês, equipe, repertório e a conversa dos músicos — tudo num lugar.</p>
        </div>
      </div>

      <SubnavLouvor />

      <div className="split" style={{ alignItems: "start" }}>
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Lançar escala do mês</h2>
          <p className="secao-painel__desc">Cria a escala e abre a tela para adicionar cultos, escalar a equipe e montar o repertório.</p>
          <FormNovaEscala anoAtual={hoje.getFullYear()} mesAtual={hoje.getMonth() + 1} />
          <p className="lvr-nota">{equipe.length} integrante(s) na equipe.</p>
        </section>

        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Escalas</h2>
          {escalas.length === 0 ? (
            <div className="vazio">Nenhuma escala ainda. Lance a primeira ao lado.</div>
          ) : (
            <div className="stack" style={{ "--flow": ".7rem" } as React.CSSProperties}>
              {escalas.map((es) => {
                const status = es.eventos.flatMap((ev) => ev.escalados.map((e) => e.status as StatusEscalado));
                const resumo = resumirConfirmacoes(status);
                return (
                  <Link key={es.id} href={`/painel/louvor/escala/${es.id}`} className="lvr-escala-linha">
                    <div>
                      <strong style={{ textTransform: "capitalize" }}>{nomeDoMes(es.mes)} / {es.ano}</strong>
                      <span className="lvr-escala-linha__meta">{es.eventos.length} evento(s) · {resumo.rotulo}</span>
                    </div>
                    <span className={`etiqueta etiqueta--${es.status === "PUBLICADA" ? "novo" : "concluido"}`}>
                      {es.status === "PUBLICADA" ? "Publicada" : "Rascunho"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
