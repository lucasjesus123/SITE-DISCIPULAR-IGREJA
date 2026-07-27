import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { id as idSchema } from "@/lib/validation/comum";
import { AcoesMatricula, FormularioCurso } from "@/components/painel/FormularioCurso";
import { descreverEncontros, formatarCentavos } from "@/app/painel/cursos/page";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curso" };

/**
 * Um curso e as matrículas dele.
 *
 * As duas coisas moram na mesma tela porque é assim que a secretaria trabalha:
 * abre o curso, olha quem se inscreveu, confirma quem pagou. Separar em duas
 * páginas obrigaria a ir e voltar a cada nome.
 */

const STATUS = ["INSCRITO", "CONFIRMADO", "CURSANDO", "CONCLUIDO", "CANCELADO"] as const;

const schemaFiltros = z.object({
  status: z.enum(["TODOS", ...STATUS]).default("TODOS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 30;

export default async function PaginaCurso({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("cursos.gerenciar");
  const { id: idBruto } = await params;

  // Formato validado antes de tocar o banco: um valor absurdo vira 404, não
  // uma exceção do Prisma com nome de coluna na tela.
  const parse = idSchema.safeParse(idBruto);
  if (!parse.success) notFound();
  const cursoId = parse.data;

  const filtros = schemaFiltros.safeParse(await searchParams).data ?? schemaFiltros.parse({});

  const curso = await ctx.db.curso.findFirst({
    where: { id: cursoId },
    select: {
      id: true, nome: true, slug: true, resumo: true, descricao: true,
      diaSemana: true, horario: true, precoCentavos: true, periodicidade: true,
      vagas: true, inscricoesAbertas: true, ativo: true, ordem: true,
    },
  });

  // Escopo de tenant já aplicado pelo `ctx.db`: o curso de outra igreja não
  // existe aqui, e a resposta é 404 — a mesma de um ID inventado.
  if (!curso) notFound();

  const whereMatriculas: Prisma.MatriculaWhereInput = {
    cursoId,
    ...(filtros.status !== "TODOS" ? { status: filtros.status } : {}),
  };

  const [matriculas, totalFiltrado, agregados] = await Promise.all([
    ctx.db.matricula.findMany({
      where: whereMatriculas,
      orderBy: [{ criadoEm: "asc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, nome: true, email: true, telefone: true, status: true,
        observacoes: true, criadoEm: true, pessoaId: true,
      },
    }),
    ctx.db.matricula.count({ where: whereMatriculas }),
    ctx.db.matricula.groupBy({
      by: ["status"],
      where: { cursoId },
      _count: { _all: true },
    }),
  ]);

  const contagem = new Map<string, number>();
  for (const linha of agregados) contagem.set(linha.status, linha._count._all);

  const ocupadas = (contagem.get("CONFIRMADO") ?? 0) + (contagem.get("CURSANDO") ?? 0);
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/cursos" className="link" style={{ fontSize: ".72rem" }}>
              ← Escola
            </Link>
          </p>
          <h1 className="painel__titulo">{curso.nome}</h1>
          <p className="painel__sub">
            {descreverEncontros(curso.diaSemana, curso.horario)} ·{" "}
            {curso.precoCentavos === null ? "Gratuito" : formatarCentavos(curso.precoCentavos)}
            {curso.precoCentavos !== null && curso.periodicidade === "MENSAL" ? " por mês" : ""} ·
            endereço público /{curso.slug}
          </p>
        </div>
      </div>

      <div className="cartoes">
        <div className="cartao">
          <p className="cartao__rotulo">Ocupação</p>
          <p className="cartao__valor">
            {curso.vagas === null ? ocupadas : `${ocupadas}/${curso.vagas}`}
          </p>
          <p className="cartao__nota">
            {curso.vagas === null
              ? "Sem limite de vagas definido."
              : ocupadas >= curso.vagas
                ? "Turma lotada — novas confirmações serão bloqueadas."
                : `${curso.vagas - ocupadas} ${curso.vagas - ocupadas === 1 ? "vaga livre" : "vagas livres"}.`}
          </p>
        </div>

        <div className="cartao">
          <p className="cartao__rotulo">A confirmar</p>
          <p className="cartao__valor">{contagem.get("INSCRITO") ?? 0}</p>
          <p className="cartao__nota">Inscrições aguardando decisão da secretaria.</p>
        </div>

        <div className="cartao">
          <p className="cartao__rotulo">Concluíram</p>
          <p className="cartao__valor">{contagem.get("CONCLUIDO") ?? 0}</p>
          <p className="cartao__nota">Histórico preservado mesmo se o curso for encerrado.</p>
        </div>
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Matrículas</h2>
        <p className="secao-painel__desc">
          Confirmar uma matrícula ocupa vaga. Inscrições ainda não confirmadas não ocupam — é comum
          receber mais inscrições do que gente que aparece.
        </p>

        <div className="barra-ferramentas">
          <Chip href={`/painel/cursos/${curso.id}`} ativo={filtros.status === "TODOS"}>
            Todas ({[...contagem.values()].reduce((a, b) => a + b, 0)})
          </Chip>
          {STATUS.map((s) => (
            <Chip
              key={s}
              href={`/painel/cursos/${curso.id}?status=${s}`}
              ativo={filtros.status === s}
            >
              {rotuloStatus(s)} ({contagem.get(s) ?? 0})
            </Chip>
          ))}
        </div>

        {matriculas.length === 0 ? (
          <div className="vazio">Nenhuma matrícula com esse filtro.</div>
        ) : (
          <>
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Contato</th>
                    <th>Inscrição</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {matriculas.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {m.pessoaId ? (
                          <Link href={`/painel/pessoas/${m.pessoaId}`} style={{ fontWeight: 600 }}>
                            {m.nome}
                          </Link>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{m.nome}</span>
                        )}
                        {m.observacoes && (
                          <span
                            className="dim"
                            style={{ display: "block", fontSize: ".78rem", marginTop: ".2rem" }}
                          >
                            {m.observacoes}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {m.telefone ?? m.email ?? "—"}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {new Intl.DateTimeFormat("pt-BR").format(m.criadoEm)}
                      </td>
                      <td>
                        <span className={`etiqueta etiqueta--${classeStatus(m.status)}`}>
                          {rotuloStatus(m.status)}
                        </span>
                      </td>
                      <td>
                        <AcoesMatricula matriculaId={m.id} statusAtual={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <nav className="paginacao" aria-label="Paginação das matrículas">
                {filtros.pagina > 1 && (
                  <Link href={montarUrl(curso.id, filtros, filtros.pagina - 1)}>← Anterior</Link>
                )}
                <span aria-current="page">
                  {filtros.pagina} de {totalPaginas}
                </span>
                {filtros.pagina < totalPaginas && (
                  <Link href={montarUrl(curso.id, filtros, filtros.pagina + 1)}>Próxima →</Link>
                )}
              </nav>
            )}
          </>
        )}
      </section>

      <h2 className="painel__titulo" style={{ fontSize: "1.3rem", margin: "2.4rem 0 1rem" }}>
        Dados do curso
      </h2>

      <FormularioCurso
        modo="editar"
        cursoId={curso.id}
        podeExcluir
        inicial={{
          nome: curso.nome,
          slug: curso.slug,
          resumo: curso.resumo ?? "",
          descricao: curso.descricao ?? "",
          diaSemana: curso.diaSemana === null ? "" : String(curso.diaSemana),
          horario: curso.horario ?? "",
          preco: curso.precoCentavos === null ? "" : paraCampoPreco(curso.precoCentavos),
          periodicidade: curso.periodicidade ?? "",
          vagas: curso.vagas === null ? "" : String(curso.vagas),
          inscricoesAbertas: curso.inscricoesAbertas,
          ativo: curso.ativo,
          ordem: curso.ordem,
        }}
      />
    </>
  );
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className="filtro-chip" aria-pressed={ativo}>
      {children}
    </a>
  );
}

function montarUrl(cursoId: string, filtros: { status: string }, pagina: number): string {
  const p = new URLSearchParams();
  if (filtros.status !== "TODOS") p.set("status", filtros.status);
  p.set("pagina", String(pagina));
  return `/painel/cursos/${cursoId}?${p.toString()}`;
}

/** Centavos -> "1250,90" para preencher o campo de texto do formulário. */
function paraCampoPreco(centavos: number): string {
  const reais = Math.trunc(centavos / 100);
  const resto = Math.abs(centavos % 100);
  return `${reais},${String(resto).padStart(2, "0")}`;
}

function rotuloStatus(status: string): string {
  const mapa: Record<string, string> = {
    INSCRITO: "Inscrito",
    CONFIRMADO: "Confirmado",
    CURSANDO: "Cursando",
    CONCLUIDO: "Concluído",
    CANCELADO: "Cancelado",
  };
  return mapa[status] ?? status;
}

function classeStatus(status: string): string {
  if (status === "INSCRITO") return "novo";
  if (status === "CONFIRMADO" || status === "CURSANDO") return "andamento";
  if (status === "CANCELADO") return "spam";
  return "concluido";
}
