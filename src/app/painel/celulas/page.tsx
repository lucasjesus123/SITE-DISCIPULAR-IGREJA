import Link from "next/link";
import { z } from "zod";
import { exigirPermissao, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { termoBusca } from "@/lib/validation/comum";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Células" };

/**
 * Lista de células.
 *
 * O recorte por papel vale aqui como vale em pessoas: o líder de célula abre
 * esta tela e enxerga UMA célula, a dele. Ver `escopoDeCelula()` no fim do
 * arquivo para o porquê de não usar `filtroDeEscopo()` direto.
 */

const schemaFiltros = z.object({
  q: termoBusca,
  situacao: z.enum(["ATIVAS", "INATIVAS", "TODAS"]).default("ATIVAS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 30;

export default async function PaginaCelulas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("celulas.ler");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.CelulaWhereInput = {
    ...escopoDeCelula(ctx),
    ...(filtros.situacao === "TODAS" ? {} : { ativa: filtros.situacao === "ATIVAS" }),
    ...(filtros.q
      ? {
          OR: [
            { nome: { contains: filtros.q, mode: "insensitive" } },
            { bairro: { contains: filtros.q, mode: "insensitive" } },
            { cidade: { contains: filtros.q, mode: "insensitive" } },
            { liderNome: { contains: filtros.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [celulas, total] = await Promise.all([
    ctx.db.celula.findMany({
      where,
      orderBy: [{ ativa: "desc" }, { nome: "asc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        nome: true,
        diaSemana: true,
        horario: true,
        liderNome: true,
        liderTelefone: true,
        bairro: true,
        cidade: true,
        capacidade: true,
        ativa: true,
        campus: { select: { nome: true } },
      },
    }),
    ctx.db.celula.count({ where }),
  ]);

  /**
   * Quantidade de pessoas por célula.
   *
   * Feito num `groupBy` sobre as células JÁ paginadas, e não com uma contagem
   * por linha: 30 células viraria 30 consultas, e com 90 pessoas usando o
   * painel ao mesmo tempo isso é o que derruba o pool de conexões.
   */
  const ids = celulas.map((c) => c.id);
  const agrupado =
    ids.length > 0
      ? await ctx.db.pessoa.groupBy({
          by: ["celulaId"],
          where: { celulaId: { in: ids }, excluidoEm: null },
          _count: { _all: true },
        })
      : [];

  const membrosPorCelula = new Map<string, number>();
  for (const linha of agrupado) {
    if (linha.celulaId) membrosPorCelula.set(linha.celulaId, linha._count._all);
  }

  await auditar(ctx, {
    acao: "celula.listar",
    detalhes: { situacao: filtros.situacao, comBusca: Boolean(filtros.q), resultados: celulas.length },
  });

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Células</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "célula" : "células"}
            {ctx.papel === "LIDER_CELULA" && " sob sua liderança"}
          </p>
        </div>
        {ctx.pode("celulas.gerenciar") && (
          <Link href="/painel/celulas/nova" className="btn btn--sm">
            Nova célula
          </Link>
        )}
      </div>

      <form method="get" className="barra-ferramentas">
        <input
          type="search"
          name="q"
          defaultValue={filtros.q ?? ""}
          placeholder="Buscar por nome, líder ou bairro"
          maxLength={80}
          aria-label="Buscar células"
          style={{
            minWidth: 260,
            padding: ".55rem .9rem",
            border: "1px solid var(--line-on-light)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        />
        <select
          name="situacao"
          defaultValue={filtros.situacao}
          aria-label="Filtrar por situação"
          style={{
            padding: ".55rem .9rem",
            border: "1px solid var(--line-on-light)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        >
          <option value="ATIVAS">Ativas</option>
          <option value="INATIVAS">Inativas</option>
          <option value="TODAS">Todas</option>
        </select>
        <button type="submit" className="btn btn--sm">
          Filtrar
        </button>
      </form>

      {celulas.length === 0 ? (
        <div className="vazio">
          {filtros.q ? "Nenhuma célula encontrada com esse termo." : "Nenhuma célula cadastrada ainda."}
        </div>
      ) : (
        <>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Célula</th>
                  <th>Líder</th>
                  <th>Encontro</th>
                  <th>Onde</th>
                  <th>Pessoas</th>
                </tr>
              </thead>
              <tbody>
                {celulas.map((c) => {
                  const membros = membrosPorCelula.get(c.id) ?? 0;
                  const lotada = c.capacidade !== null && membros >= c.capacidade;

                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/painel/celulas/${c.id}`} style={{ fontWeight: 600 }}>
                          {c.nome}
                        </Link>
                        {!c.ativa && (
                          <span className="etiqueta etiqueta--spam" style={{ marginLeft: ".5rem" }}>
                            Inativa
                          </span>
                        )}
                        {c.campus?.nome && (
                          <span className="dim" style={{ display: "block", fontSize: ".78rem", marginTop: ".2rem" }}>
                            {c.campus.nome}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {c.liderNome ?? "—"}
                        {c.liderTelefone && (
                          <span style={{ display: "block", fontSize: ".78rem" }}>{c.liderTelefone}</span>
                        )}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {descreverEncontro(c.diaSemana, c.horario)}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {[c.bairro, c.cidade].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td>
                        {membros}
                        {c.capacidade !== null && (
                          <span className="dim" style={{ fontSize: ".78rem" }}> / {c.capacidade}</span>
                        )}
                        {lotada && (
                          <span className="etiqueta etiqueta--urgente" style={{ marginLeft: ".5rem" }}>
                            Lotada
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <nav className="paginacao" aria-label="Paginação">
              {filtros.pagina > 1 && <Link href={montarUrl(filtros, filtros.pagina - 1)}>← Anterior</Link>}
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

function montarUrl(filtros: { q?: string; situacao: string }, pagina: number): string {
  const p = new URLSearchParams();
  if (filtros.q) p.set("q", filtros.q);
  if (filtros.situacao !== "ATIVAS") p.set("situacao", filtros.situacao);
  p.set("pagina", String(pagina));
  return `/painel/celulas?${p.toString()}`;
}

/**
 * Recorte por papel aplicado às consultas de CÉLULA.
 *
 * `filtroDeEscopo()` do RBAC devolve `{ celulaId: ... }`, que é a chave certa
 * para `Pessoa`, `Interacao` e afins. No modelo `Celula` o campo equivalente é
 * o próprio `id`; espalhar o filtro original ali daria erro de argumento do
 * Prisma — ou, no pior cenário, um filtro ignorado e o líder enxergando a
 * igreja inteira. Por isso a tradução é explícita e mora num lugar só.
 *
 * O `__sem-celula__` é falha fechada: líder sem célula atribuída não vê
 * nenhuma, em vez de ver todas.
 */
export function escopoDeCelula(ctx: ContextoAutorizado): Prisma.CelulaWhereInput {
  if (ctx.papel === "LIDER_CELULA") {
    return { id: ctx.sessao.celulaId ?? "__sem-celula__" };
  }
  return {};
}

export function descreverEncontro(diaSemana: number | null, horario: string | null): string {
  if (diaSemana === null && !horario) return "—";
  const dia = diaSemana !== null ? nomeDoDia(diaSemana) : "";
  return [dia, horario].filter(Boolean).join(" · ") || "—";
}

export function nomeDoDia(dia: number): string {
  const nomes = [
    "Domingo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
  ] as const;
  // noUncheckedIndexedAccess: o acesso pode ser undefined para um valor fora
  // da faixa, então o fallback é obrigatório e não decorativo.
  return nomes[dia] ?? "—";
}
