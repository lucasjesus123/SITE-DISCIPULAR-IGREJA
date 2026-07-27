import Link from "next/link";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioCurso } from "@/components/painel/FormularioCurso";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Escola" };

/**
 * Escola: lista de cursos com a situação das matrículas.
 *
 * As contagens por status vêm de UM `groupBy` para todos os cursos da página,
 * e não de uma consulta por linha. Com 20 cursos na tela a diferença é 1
 * consulta contra 20 — e o pool de conexões é o recurso mais escasso quando a
 * igreja inteira usa o sistema no domingo de manhã.
 */

const schemaFiltros = z.object({
  situacao: z.enum(["ATIVOS", "INATIVOS", "TODOS"]).default("ATIVOS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 20;

export default async function PaginaCursos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("cursos.gerenciar");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.CursoWhereInput = {
    ...(filtros.situacao === "ATIVOS" ? { ativo: true } : {}),
    ...(filtros.situacao === "INATIVOS" ? { ativo: false } : {}),
  };

  const [cursos, total] = await Promise.all([
    ctx.db.curso.findMany({
      where,
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, nome: true, slug: true, resumo: true, diaSemana: true,
        horario: true, precoCentavos: true, periodicidade: true, vagas: true,
        inscricoesAbertas: true, ativo: true, ordem: true,
      },
    }),
    ctx.db.curso.count({ where }),
  ]);

  const idsDaPagina = cursos.map((c) => c.id);

  // Uma consulta agregada para a página inteira. `groupBy` também passa pelo
  // cliente escopado, então só conta matrículas desta igreja.
  const agregados = idsDaPagina.length
    ? await ctx.db.matricula.groupBy({
        by: ["cursoId", "status"],
        where: { cursoId: { in: idsDaPagina } },
        _count: { _all: true },
      })
    : [];

  const porCurso = new Map<string, { total: number; ocupadas: number; inscritos: number }>();
  for (const linha of agregados) {
    const atual = porCurso.get(linha.cursoId) ?? { total: 0, ocupadas: 0, inscritos: 0 };
    const quantidade = linha._count._all;
    atual.total += quantidade;
    if (linha.status === "CONFIRMADO" || linha.status === "CURSANDO") atual.ocupadas += quantidade;
    if (linha.status === "INSCRITO") atual.inscritos += quantidade;
    porCurso.set(linha.cursoId, atual);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Escola</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "curso" : "cursos"} com os filtros atuais.
          </p>
        </div>
      </div>

      <div className="barra-ferramentas">
        <a href="/painel/cursos" className="filtro-chip" aria-pressed={filtros.situacao === "ATIVOS"}>
          Ativos
        </a>
        <a
          href="/painel/cursos?situacao=INATIVOS"
          className="filtro-chip"
          aria-pressed={filtros.situacao === "INATIVOS"}
        >
          Encerrados
        </a>
        <a
          href="/painel/cursos?situacao=TODOS"
          className="filtro-chip"
          aria-pressed={filtros.situacao === "TODOS"}
        >
          Todos
        </a>
      </div>

      <details className="secao-painel">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Novo curso</summary>
        <div style={{ marginTop: "1rem" }}>
          <FormularioCurso modo="criar" />
        </div>
      </details>

      {cursos.length === 0 ? (
        <div className="vazio">Nenhum curso com esses filtros.</div>
      ) : (
        <>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th>Encontros</th>
                  <th>Investimento</th>
                  <th>Matrículas</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {cursos.map((c) => {
                  const contagem = porCurso.get(c.id) ?? { total: 0, ocupadas: 0, inscritos: 0 };
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/painel/cursos/${c.id}`} style={{ fontWeight: 600 }}>
                          {c.nome}
                        </Link>
                        {c.resumo && (
                          <span
                            className="dim"
                            style={{ display: "block", fontSize: ".78rem", marginTop: ".2rem" }}
                          >
                            {c.resumo}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {descreverEncontros(c.diaSemana, c.horario)}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {c.precoCentavos === null
                          ? "Gratuito"
                          : `${formatarCentavos(c.precoCentavos)}${c.periodicidade === "MENSAL" ? "/mês" : ""}`}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {c.vagas === null
                          ? `${contagem.ocupadas} confirmadas`
                          : `${contagem.ocupadas}/${c.vagas} vagas`}
                        {contagem.inscritos > 0 && (
                          <span
                            className="etiqueta etiqueta--novo"
                            style={{ marginLeft: ".5rem" }}
                          >
                            {contagem.inscritos} a confirmar
                          </span>
                        )}
                      </td>
                      <td>
                        {!c.ativo ? (
                          <span className="etiqueta etiqueta--spam">Encerrado</span>
                        ) : c.inscricoesAbertas ? (
                          <span className="etiqueta etiqueta--concluido">Inscrições abertas</span>
                        ) : (
                          <span className="etiqueta etiqueta--andamento">Inscrições fechadas</span>
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

function montarUrl(filtros: { situacao: string }, pagina: number): string {
  const p = new URLSearchParams();
  if (filtros.situacao !== "ATIVOS") p.set("situacao", filtros.situacao);
  p.set("pagina", String(pagina));
  return `/painel/cursos?${p.toString()}`;
}

const DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

export function descreverEncontros(diaSemana: number | null, horario: string | null): string {
  const dia = diaSemana === null ? undefined : DIAS[diaSemana];
  if (!dia) return "A combinar";
  return `${dia}${horario ? ` às ${horario}` : ""}`;
}

/**
 * Centavos -> "R$ 1.250,90".
 *
 * A divisão é INTEIRA (`Math.trunc`) e o resto vira as casas decimais. Não há
 * `toFixed(2)` sobre um float aqui: o valor guardado é inteiro e continua
 * inteiro até virar texto.
 */
export function formatarCentavos(centavos: number): string {
  const reais = Math.trunc(centavos / 100);
  const resto = Math.abs(centavos % 100);
  return `R$ ${reais.toLocaleString("pt-BR")},${String(resto).padStart(2, "0")}`;
}
