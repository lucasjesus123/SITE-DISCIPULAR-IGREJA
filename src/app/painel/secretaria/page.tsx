import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FORMULARIOS, TIPOS } from "@/lib/secretaria/tipos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Secretaria" };

export default async function PaginaSecretaria() {
  const ctx = await exigirPermissao("secretaria.gerenciar");

  // Contagem por tipo, numa consulta só.
  const grupos = await ctx.db.registroSecretaria.groupBy({
    by: ["tipo"],
    _count: { _all: true },
  });
  const contagem = new Map(grupos.map((g) => [g.tipo, g._count._all]));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">🗂️ Secretaria</h1>
          <p className="painel__sub">
            Todos os cadastros da recepção num lugar só. Cadastre, gere relatório em PDF e agende mensagens.
          </p>
        </div>
        <Link href="/painel/pessoas" className="btn btn--sm btn--ghost">Pessoas / Membros</Link>
      </div>

      <div className="cards-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
        {TIPOS.map((tipo) => {
          const def = FORMULARIOS[tipo];
          const n = contagem.get(tipo) ?? 0;
          return (
            <Link
              key={tipo}
              href={`/painel/secretaria/${def.slug}`}
              className="secao-painel"
              style={{ display: "block", textDecoration: "none", transition: "border-color .15s" }}
            >
              <div style={{ fontSize: "2rem", lineHeight: 1 }}>{def.icone}</div>
              <h2 className="secao-painel__titulo" style={{ marginTop: ".5rem" }}>{def.rotulo}</h2>
              <p className="secao-painel__desc">{def.descricao}</p>
              <p style={{ marginTop: ".6rem", fontWeight: 700 }}>
                {n} {n === 1 ? "cadastro" : "cadastros"}
              </p>
            </Link>
          );
        })}
      </div>
    </>
  );
}
