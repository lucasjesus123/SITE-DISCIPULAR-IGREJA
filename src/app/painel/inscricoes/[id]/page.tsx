import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { AcoesInscricao } from "@/components/painel/inscricoes/AcoesInscricao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscrição" };

const FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function DetalheInscricao({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("inscricoes.gerenciar");

  const [insc, respostas, h] = await Promise.all([
    ctx.db.inscricao.findFirst({ where: { id }, select: { id: true, titulo: true, descricao: true, slug: true, ativa: true } }),
    ctx.db.inscricaoResposta.findMany({
      where: { inscricaoId: id },
      orderBy: { criadoEm: "desc" },
      select: { id: true, nome: true, telefone: true, email: true, observacao: true, criadoEm: true },
    }),
    headers(),
  ]);

  if (!insc) notFound();

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const urlPublica = `https://${host}/i/${insc.slug}`;

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">{insc.titulo}</h1>
          <p className="painel__sub">
            {respostas.length} inscrito{respostas.length === 1 ? "" : "s"} ·{" "}
            <span className={`etiqueta etiqueta--${insc.ativa ? "novo" : "concluido"}`}>{insc.ativa ? "Aberta" : "Encerrada"}</span>
          </p>
        </div>
        <Link href="/painel/inscricoes" className="btn btn--ghost">← Voltar</Link>
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Link para compartilhar</h2>
        <p className="secao-painel__desc">Envie este link no WhatsApp, no story ou coloque no site. A pessoa se inscreve em 1 toque.</p>
        <p style={{ fontFamily: "var(--font-mono, monospace)", background: "var(--pnl-surface-2)", padding: ".7rem .9rem", borderRadius: "10px", wordBreak: "break-all", marginBottom: "1rem" }}>
          {urlPublica}
        </p>
        <AcoesInscricao inscricaoId={insc.id} ativa={insc.ativa} urlPublica={urlPublica} />
      </section>

      <section className="secao-painel">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h2 className="secao-painel__titulo" style={{ marginBottom: 0 }}>Inscritos</h2>
          <div style={{ display: "flex", gap: ".6rem" }}>
            <a className="btn btn--sm btn--ghost" href={`/painel/inscricoes/${insc.id}/lista`}>Exportar CSV</a>
            <a className="btn btn--sm" href={`/painel/inscricoes/${insc.id}/imprimir`} target="_blank" rel="noopener noreferrer">Lista em PDF</a>
          </div>
        </div>

        {respostas.length === 0 ? (
          <div className="vazio" style={{ marginTop: "1.2rem" }}>Ninguém se inscreveu ainda. Compartilhe o link!</div>
        ) : (
          <div className="tabela-wrap" style={{ marginTop: "1.2rem" }}>
            <table className="tabela">
              <thead>
                <tr><th>Nome</th><th>Telefone</th><th>E-mail</th><th>Quando</th></tr>
              </thead>
              <tbody>
                {respostas.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.nome}</td>
                    <td style={{ color: "var(--pnl-text-dim)" }}>{r.telefone ?? "—"}</td>
                    <td style={{ color: "var(--pnl-text-dim)" }}>{r.email ?? "—"}</td>
                    <td style={{ color: "var(--pnl-text-dim)", whiteSpace: "nowrap" }}>{FMT.format(r.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
