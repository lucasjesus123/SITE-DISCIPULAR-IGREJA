import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormCadastroCrianca } from "@/components/kids/FormCadastroCrianca";
import { FormNovaSala } from "@/components/kids/FormNovaSala";

export const dynamic = "force-dynamic";
export const metadata = { title: "Crianças & salas" };

export default async function CriancasKids() {
  const ctx = await exigirPermissao("kids.gerenciar");

  const [salas, criancas] = await Promise.all([
    ctx.db.salaKids.findMany({ orderBy: { ordem: "asc" }, select: { id: true, nome: true, faixaEtaria: true, _count: { select: { criancas: true } } } }),
    ctx.db.crianca.findMany({
      where: { excluidoEm: null },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, alergias: true, salaPadrao: { select: { nome: true } }, _count: { select: { responsaveis: true } } },
    }),
  ]);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Crianças & salas</h1>
          <p className="painel__sub">Cadastro com consentimento LGPD e organização das salas.</p>
        </div>
        <Link href="/painel/kids" className="btn btn--ghost">← Check-in</Link>
      </div>

      <div className="split" style={{ alignItems: "start" }}>
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Nova criança</h2>
          <p className="secao-painel__desc">O consentimento LGPD do responsável é obrigatório.</p>
          <FormCadastroCrianca salas={salas.map((s) => ({ id: s.id, nome: s.nome }))} />
        </section>

        <div className="stack" style={{ "--flow": "1.5rem" } as React.CSSProperties}>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Nova sala</h2>
            <FormNovaSala />
            {salas.length > 0 && (
              <ul className="stack" style={{ "--flow": ".4rem", marginTop: "1rem", fontSize: ".9rem" } as React.CSSProperties}>
                {salas.map((s) => (
                  <li key={s.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{s.nome}{s.faixaEtaria ? ` · ${s.faixaEtaria}` : ""}</span>
                    <span style={{ color: "var(--pnl-text-dim)" }}>{s._count.criancas} criança(s)</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Crianças cadastradas ({criancas.length})</h2>
            {criancas.length === 0 ? (
              <div className="vazio">Nenhuma criança cadastrada.</div>
            ) : (
              <div className="tabela-wrap">
                <table className="tabela">
                  <thead><tr><th>Nome</th><th>Sala</th><th>Responsáveis</th></tr></thead>
                  <tbody>
                    {criancas.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>
                          {c.nome}
                          {c.alergias && <span className="etiqueta etiqueta--urgente" style={{ marginLeft: ".5rem" }}>Alergia</span>}
                        </td>
                        <td style={{ color: "var(--pnl-text-dim)" }}>{c.salaPadrao?.nome ?? "—"}</td>
                        <td style={{ color: "var(--pnl-text-dim)" }}>{c._count.responsaveis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
