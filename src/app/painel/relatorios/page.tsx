import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { carregarModulos } from "@/lib/services/modulos";
import { relatoriosPorGrupo } from "@/lib/relatorios/catalogo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Central de Relatórios" };

export default async function PaginaRelatorios() {
  const ctx = await exigirPermissao("relatorios.ver");
  const modulos = await carregarModulos(ctx.db);

  const grupos = relatoriosPorGrupo();

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">📊 Central de Relatórios</h1>
          <p className="painel__sub">
            Relatórios completos com cabeçalho, logo e rodapé da igreja — escolha o período e salve em PDF.
          </p>
        </div>
      </div>

      {grupos.map(({ grupo, itens }) => {
        const visiveis = itens.filter((r) => !r.modulo || modulos[r.modulo]);
        if (visiveis.length === 0) return null;
        return (
          <section key={grupo} style={{ marginBottom: "1.6rem" }}>
            <h2 className="secao-painel__titulo" style={{ marginBottom: ".7rem" }}>{grupo}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
              {visiveis.map((r) => (
                <Link
                  key={r.chave}
                  href={`/painel/relatorios/${r.chave}?periodo=mes`}
                  className="secao-painel"
                  style={{ display: "block", textDecoration: "none" }}
                >
                  <div style={{ fontSize: "1.7rem", lineHeight: 1 }}>{r.icone}</div>
                  <h3 className="secao-painel__titulo" style={{ marginTop: ".4rem" }}>{r.rotulo}</h3>
                  <p className="secao-painel__desc">{r.descricao}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
