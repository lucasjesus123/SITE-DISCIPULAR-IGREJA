import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioNovaInscricao } from "@/components/painel/inscricoes/FormularioNovaInscricao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inscrições" };

export default async function PaginaInscricoes() {
  const ctx = await exigirPermissao("inscricoes.gerenciar");

  const inscricoes = await ctx.db.inscricao.findMany({
    orderBy: { criadoEm: "desc" },
    select: {
      id: true, titulo: true, slug: true, ativa: true, criadoEm: true,
      _count: { select: { respostas: true } },
    },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Inscrições</h1>
          <p className="painel__sub">Crie um evento/curso, compartilhe o link e acompanhe os inscritos.</p>
        </div>
      </div>

      <div className="split" style={{ alignItems: "start" }}>
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Nova inscrição</h2>
          <p className="secao-painel__desc">Ao criar, você recebe um link para compartilhar.</p>
          <FormularioNovaInscricao />
        </section>

        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Minhas inscrições</h2>
          {inscricoes.length === 0 ? (
            <div className="vazio">Nenhuma inscrição criada ainda.</div>
          ) : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr><th>Título</th><th>Inscritos</th><th>Situação</th></tr>
                </thead>
                <tbody>
                  {inscricoes.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/painel/inscricoes/${i.id}`} style={{ fontWeight: 600 }}>{i.titulo}</Link>
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums" }}>{i._count.respostas}</td>
                      <td>
                        <span className={`etiqueta etiqueta--${i.ativa ? "novo" : "concluido"}`}>
                          {i.ativa ? "Aberta" : "Encerrada"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
