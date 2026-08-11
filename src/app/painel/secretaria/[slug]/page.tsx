import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { formularioPorSlug } from "@/lib/secretaria/tipos";
import { FormularioSecretaria } from "@/components/painel/secretaria/FormularioSecretaria";
import { AgendarDisparo } from "@/components/painel/secretaria/AgendarDisparo";

export const dynamic = "force-dynamic";

function fmtData(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
}
function fmtDataHora(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = formularioPorSlug(slug);
  return { title: def ? `Secretaria · ${def.rotulo}` : "Secretaria" };
}

export default async function PaginaFormularioSecretaria({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const def = formularioPorSlug(slug);
  if (!def) notFound();

  const ctx = await exigirPermissao("secretaria.gerenciar");

  const registros = await ctx.db.registroSecretaria.findMany({
    where: { tipo: def.tipo },
    orderBy: { criadoEm: "desc" },
    take: 200,
    select: {
      id: true, nome: true, contato: true, dataReferencia: true,
      criadoPorNome: true, criadoEm: true,
    },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <p className="painel__sub" style={{ marginBottom: ".2rem" }}>
            <Link href="/painel/secretaria">← Secretaria</Link>
          </p>
          <h1 className="painel__titulo">{def.icone} {def.rotulo}</h1>
          <p className="painel__sub">{def.descricao}</p>
        </div>
        <Link href={`/painel/secretaria/${slug}/relatorio?periodo=mes`} className="btn btn--sm btn--ghost">
          Relatório / PDF
        </Link>
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Novo cadastro</h2>
        <p className="secao-painel__desc">Preencha e salve — o formulário limpa para o próximo.</p>
        <FormularioSecretaria slug={slug} singular={def.singular} campos={def.campos} />
      </section>

      <section className="secao-painel" style={{ marginTop: "1.6rem" }}>
        <h2 className="secao-painel__titulo">Cadastros ({registros.length})</h2>
        {registros.length === 0 ? (
          <p className="dim">Nenhum cadastro ainda. Preencha o formulário acima.</p>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Data</th>
                  <th>Cadastrado por</th>
                  <th>Quando</th>
                  <th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r) => (
                  <tr key={r.id}>
                    <td>{r.nome}</td>
                    <td>{r.contato ?? "—"}</td>
                    <td>{fmtData(r.dataReferencia)}</td>
                    <td>{r.criadoPorNome ?? "—"}</td>
                    <td>{fmtDataHora(r.criadoEm)}</td>
                    <td>{r.contato ? <AgendarDisparo contato={r.contato} nome={r.nome} registroId={r.id} /> : "—"}</td>
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
