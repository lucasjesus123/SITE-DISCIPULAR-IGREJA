import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioCampus } from "@/components/painel/FormularioCampus";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campi" };

/**
 * Campi: sedes e congregações da igreja.
 *
 * O endereço daqui alimenta o rodapé, a página de contato, o bloco "campi" das
 * páginas do site e a ficha das pessoas. É pouca informação, mas é a que o
 * visitante usa para descobrir onde ir no domingo — por isso a tela mostra
 * tudo de uma vez, sem paginação profunda: são poucos registros por igreja.
 */

const schemaFiltros = z.object({
  situacao: z.enum(["ATIVOS", "INATIVOS", "TODOS"]).default("TODOS"),
});

export default async function PaginaCampi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("site.editar");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.CampusWhereInput = {
    ...(filtros.situacao === "ATIVOS" ? { ativo: true } : {}),
    ...(filtros.situacao === "INATIVOS" ? { ativo: false } : {}),
  };

  const campi = await ctx.db.campus.findMany({
    where,
    orderBy: [{ principal: "desc" }, { ordem: "asc" }, { nome: "asc" }],
    // Teto mesmo sem paginação: a action limita a criação a 50, e o `take`
    // garante que um dado antigo fora desse limite não derrube a tela.
    take: 60,
    select: {
      id: true, nome: true, descricao: true, cep: true, logradouro: true,
      numero: true, complemento: true, bairro: true, cidade: true, uf: true,
      mapaEmbedUrl: true, telefone: true, principal: true, ativo: true, ordem: true,
    },
  });

  const semPrincipal = campi.length > 0 && !campi.some((c) => c.principal);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Campi</h1>
          <p className="painel__sub">
            {campi.length} {campi.length === 1 ? "endereço" : "endereços"}. O campus principal é o
            que aparece no rodapé do site e nos dados de contato.
          </p>
        </div>
      </div>

      <div className="barra-ferramentas">
        <a href="/painel/campi" className="filtro-chip" aria-pressed={filtros.situacao === "TODOS"}>
          Todos
        </a>
        <a
          href="/painel/campi?situacao=ATIVOS"
          className="filtro-chip"
          aria-pressed={filtros.situacao === "ATIVOS"}
        >
          Ativos
        </a>
        <a
          href="/painel/campi?situacao=INATIVOS"
          className="filtro-chip"
          aria-pressed={filtros.situacao === "INATIVOS"}
        >
          Inativos
        </a>
      </div>

      {semPrincipal && (
        <div className="alerta alerta--aviso" role="status">
          Nenhum campus está marcado como principal. O site vai usar o primeiro da lista para os
          dados de contato — marque o correto para não deixar isso ao acaso.
        </div>
      )}

      <details className="secao-painel">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Novo campus</summary>
        <div style={{ marginTop: "1rem" }}>
          <FormularioCampus modo="criar" />
        </div>
      </details>

      {campi.length === 0 ? (
        <div className="vazio">Nenhum campus cadastrado com esse filtro.</div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {campi.map((c) => (
            <article key={c.id} className="secao-painel" style={{ marginBottom: 0 }}>
              <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: ".6rem" }}>
                {c.principal && <span className="etiqueta etiqueta--novo">Principal</span>}
                {!c.ativo && <span className="etiqueta etiqueta--spam">Inativo</span>}
                {c.mapaEmbedUrl && <span className="etiqueta etiqueta--concluido">Com mapa</span>}
              </div>

              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem" }}>{c.nome}</h2>

              {c.descricao && (
                <p className="dim" style={{ fontSize: ".85rem", marginTop: ".3rem" }}>
                  {c.descricao}
                </p>
              )}

              <p style={{ marginTop: ".7rem", fontSize: ".88rem", color: "var(--graphite-dim)" }}>
                {formatarEndereco(c) || "Endereço não preenchido"}
                {c.telefone ? ` · ${c.telefone}` : ""}
              </p>

              <details style={{ marginTop: "1rem" }}>
                <summary style={{ cursor: "pointer", fontSize: ".84rem", fontWeight: 600 }}>
                  Editar
                </summary>
                <div style={{ marginTop: "1rem" }}>
                  <FormularioCampus
                    modo="editar"
                    campusId={c.id}
                    inicial={{
                      nome: c.nome,
                      descricao: c.descricao ?? "",
                      cep: c.cep ?? "",
                      logradouro: c.logradouro ?? "",
                      numero: c.numero ?? "",
                      complemento: c.complemento ?? "",
                      bairro: c.bairro ?? "",
                      cidade: c.cidade ?? "",
                      uf: c.uf ?? "",
                      mapaEmbedUrl: c.mapaEmbedUrl ?? "",
                      telefone: c.telefone ?? "",
                      principal: c.principal,
                      ativo: c.ativo,
                      ordem: c.ordem,
                    }}
                  />
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function formatarEndereco(c: {
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}): string {
  const rua = [c.logradouro, c.numero].filter(Boolean).join(", ");
  const local = [c.bairro, c.cidade, c.uf].filter(Boolean).join(" · ");
  return [rua, local].filter(Boolean).join(" — ");
}
