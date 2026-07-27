import Link from "next/link";
import { z } from "zod";
import { exigirPermissao, filtroDeEscopo } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { termoBusca } from "@/lib/validation/comum";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pessoas" };

/**
 * Cadastro de pessoas.
 *
 * DOIS RECORTES SE SOMAM AQUI
 *   1. Tenant — garantido pelo `ctx.db`, sem o filtro aparecer no código.
 *   2. Papel  — `filtroDeEscopo()` restringe o líder de célula à célula dele.
 *
 * O segundo é fácil de esquecer, porque o primeiro já "parece" suficiente.
 * Não é: sem ele, um líder de célula veria a ficha de todos os membros da
 * igreja, inclusive telefone e endereço de pessoas que ele não acompanha.
 */

const schemaFiltros = z.object({
  q: termoBusca,
  status: z
    .enum(["TODOS", "VISITANTE", "EM_ACOMPANHAMENTO", "CONGREGANTE", "MEMBRO", "INATIVO"])
    .default("TODOS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 30;

export default async function PaginaPessoas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("pessoas.ler");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});
  const escopo = filtroDeEscopo(ctx);

  const where: Prisma.PessoaWhereInput = {
    excluidoEm: null,
    ...escopo,
    ...(filtros.status !== "TODOS" ? { status: filtros.status } : {}),
    ...(filtros.q
      ? {
          OR: [
            { nome: { contains: filtros.q, mode: "insensitive" } },
            { email: { contains: filtros.q, mode: "insensitive" } },
            { telefone: { contains: filtros.q.replace(/\D/g, "") } },
          ],
        }
      : {}),
  };

  const [pessoas, total] = await Promise.all([
    ctx.db.pessoa.findMany({
      where,
      orderBy: { nome: "asc" },
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      // `observacoesPastorais` fica FORA da listagem por princípio: mesmo
      // quem tem permissão para lê-lo não precisa dele numa tabela de 30
      // linhas, e não enviá-lo evita que ele apareça no HTML da página.
      select: {
        id: true, nome: true, email: true, telefone: true, status: true,
        criadoEm: true, batizado: true,
        celula: { select: { nome: true } },
      },
    }),
    ctx.db.pessoa.count({ where }),
  ]);

  await auditar(ctx, {
    acao: "pessoa.listar",
    detalhes: { status: filtros.status, comBusca: Boolean(filtros.q), resultados: pessoas.length },
  });

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Pessoas</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "pessoa" : "pessoas"}
            {ctx.papel === "LIDER_CELULA" && " na sua célula"}
          </p>
        </div>
        {ctx.pode("pessoas.criar") && (
          <Link href="/painel/pessoas/nova" className="btn btn--sm">
            Cadastrar pessoa
          </Link>
        )}
      </div>

      <form method="get" className="barra-ferramentas">
        <input
          type="search"
          name="q"
          defaultValue={filtros.q ?? ""}
          placeholder="Buscar por nome, e-mail ou telefone"
          maxLength={80}
          aria-label="Buscar pessoas"
          style={{ minWidth: 280, padding: ".55rem .9rem", border: "1px solid var(--line-on-light)", borderRadius: "var(--radius)", background: "#fff" }}
        />
        <select
          name="status"
          defaultValue={filtros.status}
          aria-label="Filtrar por situação"
          style={{ padding: ".55rem .9rem", border: "1px solid var(--line-on-light)", borderRadius: "var(--radius)", background: "#fff" }}
        >
          <option value="TODOS">Todas as situações</option>
          <option value="VISITANTE">Visitantes</option>
          <option value="EM_ACOMPANHAMENTO">Em acompanhamento</option>
          <option value="CONGREGANTE">Congregantes</option>
          <option value="MEMBRO">Membros</option>
          <option value="INATIVO">Inativos</option>
        </select>
        <button type="submit" className="btn btn--sm">
          Filtrar
        </button>
      </form>

      {pessoas.length === 0 ? (
        <div className="vazio">
          {filtros.q ? "Nenhuma pessoa encontrada com esse termo." : "Nenhuma pessoa cadastrada ainda."}
        </div>
      ) : (
        <>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Célula</th>
                  <th>Situação</th>
                  <th>Cadastro</th>
                </tr>
              </thead>
              <tbody>
                {pessoas.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/painel/pessoas/${p.id}`} style={{ fontWeight: 600 }}>
                        {p.nome}
                      </Link>
                      {p.batizado && (
                        <span className="etiqueta etiqueta--concluido" style={{ marginLeft: ".5rem" }}>
                          Batizado
                        </span>
                      )}
                    </td>
                    <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                      {p.telefone ?? p.email ?? "—"}
                    </td>
                    <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                      {p.celula?.nome ?? "—"}
                    </td>
                    <td>
                      <span className={`etiqueta etiqueta--${classeStatus(p.status)}`}>
                        {rotuloStatus(p.status)}
                      </span>
                    </td>
                    <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                      {new Intl.DateTimeFormat("pt-BR").format(p.criadoEm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <nav className="paginacao" aria-label="Paginação">
              {filtros.pagina > 1 && (
                <Link href={montarUrl(filtros, filtros.pagina - 1)}>← Anterior</Link>
              )}
              <span aria-current="page">
                {filtros.pagina} de {totalPaginas}
              </span>
              {filtros.pagina < totalPaginas && (
                <Link href={montarUrl(filtros, filtros.pagina + 1)}>Próxima →</Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

function montarUrl(filtros: { q?: string; status: string }, pagina: number): string {
  const p = new URLSearchParams();
  if (filtros.q) p.set("q", filtros.q);
  if (filtros.status !== "TODOS") p.set("status", filtros.status);
  p.set("pagina", String(pagina));
  return `/painel/pessoas?${p.toString()}`;
}

function rotuloStatus(s: string): string {
  const mapa: Record<string, string> = {
    VISITANTE: "Visitante",
    EM_ACOMPANHAMENTO: "Acompanhamento",
    CONGREGANTE: "Congregante",
    MEMBRO: "Membro",
    INATIVO: "Inativo",
    TRANSFERIDO: "Transferido",
  };
  return mapa[s] ?? s;
}

function classeStatus(s: string): string {
  if (s === "MEMBRO") return "novo";
  if (s === "VISITANTE" || s === "EM_ACOMPANHAMENTO") return "andamento";
  return "concluido";
}
