import Link from "next/link";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { termoBusca } from "@/lib/validation/comum";
import type { Prisma, StatusBatismo } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batismos" };

/**
 * Fila de batismos.
 *
 * A tela é uma fila e não uma lista por acaso: o que importa é o que está
 * parado esperando alguém. Por isso o filtro padrão é "em andamento", e não
 * "todos" — abrir a tela em "todos" faria a solicitação de ontem se perder no
 * meio de três anos de histórico.
 */

const STATUS_VALIDOS = [
  "SOLICITADO",
  "EM_PREPARO",
  "APROVADO",
  "AGENDADO",
  "REALIZADO",
  "RECUSADO",
  "CANCELADO",
] as const;

/** O que ainda depende de uma decisão da equipe. */
const EM_ANDAMENTO: StatusBatismo[] = ["SOLICITADO", "EM_PREPARO", "APROVADO", "AGENDADO"];

// Lista fechada, escrita por extenso (e não montada por spread) para que o
// TypeScript enxergue os literais e o Zod recuse qualquer coisa fora dela.
const FILTROS_STATUS = [
  "ANDAMENTO",
  "TODOS",
  "SOLICITADO",
  "EM_PREPARO",
  "APROVADO",
  "AGENDADO",
  "REALIZADO",
  "RECUSADO",
  "CANCELADO",
] as const;

const schemaFiltros = z.object({
  status: z.enum(FILTROS_STATUS).default("ANDAMENTO"),
  q: termoBusca,
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 25;

export default async function PaginaBatismos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("batismos.ler");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.SolicitacaoBatismoWhereInput = {
    ...(filtros.status === "ANDAMENTO"
      ? { status: { in: EM_ANDAMENTO } }
      : filtros.status === "TODOS"
        ? {}
        : { status: filtros.status }),
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

  const [solicitacoes, total, porStatus, pendentesDeAutorizacao] = await Promise.all([
    ctx.db.solicitacaoBatismo.findMany({
      where,
      orderBy: [{ dataBatismo: "asc" }, { criadoEm: "desc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      // As `respostas` (testemunho) NÃO vêm para a listagem: é o conteúdo mais
      // pessoal deste módulo e não tem por que trafegar numa tabela de 25
      // linhas. Ele é lido na tela de detalhe, que audita a leitura.
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        status: true,
        menorIdade: true,
        autorizacaoResponsavel: true,
        dataNascimento: true,
        dataBatismo: true,
        turmaPreparatoria: true,
        criadoEm: true,
        campus: { select: { nome: true } },
        pessoaId: true,
      },
    }),
    ctx.db.solicitacaoBatismo.count({ where }),
    ctx.db.solicitacaoBatismo.groupBy({ by: ["status"], _count: { _all: true } }),
    ctx.db.solicitacaoBatismo.count({
      where: { menorIdade: true, autorizacaoResponsavel: false, status: { in: EM_ANDAMENTO } },
    }),
  ]);

  await auditar(ctx, {
    acao: "batismo.listar",
    detalhes: { status: filtros.status, comBusca: Boolean(filtros.q), resultados: solicitacoes.length },
  });

  const contagem = new Map<string, number>();
  for (const grupo of porStatus) contagem.set(grupo.status, grupo._count._all);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Batismos</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")}{" "}
            {total === 1 ? "solicitação" : "solicitações"} com os filtros atuais.
          </p>
        </div>
      </div>

      {pendentesDeAutorizacao > 0 && (
        <div className="alerta alerta--aviso" role="note" style={{ marginBottom: "1.5rem" }}>
          <strong>
            {pendentesDeAutorizacao}{" "}
            {pendentesDeAutorizacao === 1 ? "solicitação de menor" : "solicitações de menores"} sem
            autorização do responsável.
          </strong>{" "}
          Elas não podem ser aprovadas nem agendadas até a autorização ser registrada.
        </div>
      )}

      <form method="get" className="barra-ferramentas">
        <input
          type="search"
          name="q"
          defaultValue={filtros.q ?? ""}
          placeholder="Buscar por nome, e-mail ou telefone"
          maxLength={80}
          aria-label="Buscar solicitações de batismo"
          style={{
            minWidth: 260,
            padding: ".55rem .9rem",
            border: "1px solid var(--line-on-light)",
            borderRadius: "var(--radius)",
            background: "#fff",
          }}
        />
        <input type="hidden" name="status" value={filtros.status} />
        <button type="submit" className="btn btn--sm">
          Buscar
        </button>
      </form>

      <div className="barra-ferramentas">
        <Chip href={montarUrl(filtros, { status: "ANDAMENTO", pagina: 1 })} ativo={filtros.status === "ANDAMENTO"}>
          Em andamento
        </Chip>
        {STATUS_VALIDOS.map((s) => (
          <Chip key={s} href={montarUrl(filtros, { status: s, pagina: 1 })} ativo={filtros.status === s}>
            {rotuloStatus(s)}
            {contagem.get(s) ? ` (${contagem.get(s)})` : ""}
          </Chip>
        ))}
        <Chip href={montarUrl(filtros, { status: "TODOS", pagina: 1 })} ativo={filtros.status === "TODOS"}>
          Todos
        </Chip>
      </div>

      {solicitacoes.length === 0 ? (
        <div className="vazio">Nenhuma solicitação com esses filtros.</div>
      ) : (
        <>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Situação</th>
                  <th>Data marcada</th>
                  <th>Turma</th>
                  <th>Solicitado</th>
                </tr>
              </thead>
              <tbody>
                {solicitacoes.map((s) => {
                  const menor = s.menorIdade || ehMenorDeIdade(s.dataNascimento);
                  const travado = menor && !s.autorizacaoResponsavel;

                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/painel/batismos/${s.id}`} style={{ fontWeight: 600 }}>
                          {s.nome}
                        </Link>
                        {menor && (
                          <span
                            className={`etiqueta etiqueta--${travado ? "urgente" : "concluido"}`}
                            style={{ marginLeft: ".5rem" }}
                          >
                            {travado ? "Menor sem autorização" : "Menor autorizado"}
                          </span>
                        )}
                        {!s.pessoaId && (
                          <span className="etiqueta etiqueta--spam" style={{ marginLeft: ".5rem" }}>
                            Sem cadastro
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {s.telefone ?? s.email ?? "—"}
                      </td>
                      <td>
                        <span className={`etiqueta etiqueta--${classeStatus(s.status)}`}>
                          {rotuloStatus(s.status)}
                        </span>
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {s.dataBatismo ? formatarAgendamento(s.dataBatismo) : "—"}
                        {s.campus?.nome ? ` · ${s.campus.nome}` : ""}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {s.turmaPreparatoria ?? "—"}
                      </td>
                      <td style={{ color: "var(--graphite-dim)", fontSize: ".85rem" }}>
                        {formatarCarimbo(s.criadoEm)}
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
                <Link href={montarUrl(filtros, { pagina: filtros.pagina - 1 })}>← Anterior</Link>
              )}
              <span aria-current="page">
                {filtros.pagina} de {totalPaginas}
              </span>
              {filtros.pagina < totalPaginas && (
                <Link href={montarUrl(filtros, { pagina: filtros.pagina + 1 })}>Próxima →</Link>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="filtro-chip" aria-pressed={ativo}>
      {children}
    </Link>
  );
}

function montarUrl(
  filtros: { status: string; q?: string; pagina: number },
  mudancas: { status?: string; pagina?: number },
): string {
  const p = new URLSearchParams();
  const status = mudancas.status ?? filtros.status;
  const pagina = mudancas.pagina ?? filtros.pagina;

  if (status !== "ANDAMENTO") p.set("status", status);
  if (filtros.q) p.set("q", filtros.q);
  if (pagina > 1) p.set("pagina", String(pagina));

  const query = p.toString();
  return query ? `/painel/batismos?${query}` : "/painel/batismos";
}

/**
 * TRÊS FORMATADORES, PORQUE SÃO TRÊS COISAS DIFERENTES.
 *
 * `formatarAgendamento` — data/hora do batismo. Gravada e exibida em UTC (ver
 *   o comentário em batismos/acoes.ts): a hora escolhida é a mesma para todos.
 * `formatarDataPura`    — colunas @db.Date (nascimento). Elas ficam à
 *   meia-noite UTC; formatá-las em America/Sao_Paulo mostraria o DIA ANTERIOR.
 * `formatarCarimbo`     — timestamps reais (criadoEm). Aí o fuso da igreja é o
 *   correto, senão um cadastro feito às 22h aparece com a data do dia seguinte.
 */
export function formatarAgendamento(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(data);
}

export function formatarDataPura(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(data);
}

export function formatarCarimbo(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

export function ehMenorDeIdade(nascimento: Date | null): boolean {
  if (!nascimento) return false;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const mes = hoje.getUTCMonth() - nascimento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < nascimento.getUTCDate())) idade -= 1;
  return idade >= 0 && idade < 18;
}

export function rotuloStatus(s: string): string {
  const mapa: Record<string, string> = {
    SOLICITADO: "Solicitado",
    EM_PREPARO: "Em preparo",
    APROVADO: "Aprovado",
    AGENDADO: "Agendado",
    REALIZADO: "Realizado",
    RECUSADO: "Recusado",
    CANCELADO: "Cancelado",
  };
  return mapa[s] ?? s;
}

export function classeStatus(s: string): string {
  if (s === "SOLICITADO") return "novo";
  if (s === "EM_PREPARO" || s === "APROVADO" || s === "AGENDADO") return "andamento";
  if (s === "REALIZADO") return "concluido";
  return "spam";
}
