import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioAgenda } from "@/components/painel/FormularioAgenda";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda" };

/**
 * Agenda da igreja: cultos semanais, escola, eventos com data marcada.
 *
 * O que entra aqui sai no site e no aplicativo — é a tela de conteúdo público
 * mais consultada depois da home. Duas consequências no código:
 *
 *   - Todo filtro vindo da URL passa por Zod com lista fechada e `safeParse`
 *     com fallback. Um `?tipo=DROP TABLE` vira o filtro padrão, não um erro.
 *   - A listagem tem teto de página. Sem isso, `?pagina=99999` viraria uma
 *     varredura inútil da tabela a cada clique.
 */

const TIPOS = ["CULTO", "ESCOLA", "CELULA", "EVENTO", "ENSAIO", "ORACAO"] as const;

const schemaFiltros = z.object({
  tipo: z.enum(["TODOS", ...TIPOS]).default("TODOS"),
  situacao: z.enum(["ATIVOS", "INATIVOS", "TODOS"]).default("ATIVOS"),
  quando: z.enum(["TODOS", "SEMANAL", "PONTUAL"]).default("TODOS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 25;

export default async function PaginaAgenda({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("agenda.gerenciar");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.AgendaItemWhereInput = {
    ...(filtros.tipo !== "TODOS" ? { tipo: filtros.tipo } : {}),
    ...(filtros.situacao === "ATIVOS" ? { ativo: true } : {}),
    ...(filtros.situacao === "INATIVOS" ? { ativo: false } : {}),
    ...(filtros.quando === "SEMANAL" ? { recorrente: true } : {}),
    ...(filtros.quando === "PONTUAL" ? { recorrente: false } : {}),
  };

  const [itens, total, campi] = await Promise.all([
    ctx.db.agendaItem.findMany({
      where,
      orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { diaSemana: "asc" }, { horario: "asc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, tipo: true, titulo: true, descricao: true,
        diaSemana: true, horario: true, dataHora: true, recorrente: true,
        destaque: true, ativo: true, publicoSite: true, ordem: true,
        campusId: true,
        campus: { select: { nome: true } },
      },
    }),
    ctx.db.agendaItem.count({ where }),
    ctx.db.campus.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      take: 50,
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Agenda</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "item" : "itens"} com os filtros atuais.
            O que estiver marcado como público aparece no site e no aplicativo.
          </p>
        </div>
      </div>

      <div className="barra-ferramentas">
        <Chip href="/painel/agenda" ativo={filtros.tipo === "TODOS" && filtros.situacao === "ATIVOS" && filtros.quando === "TODOS"}>
          Ativos
        </Chip>
        <Chip href="/painel/agenda?quando=SEMANAL" ativo={filtros.quando === "SEMANAL"}>
          Toda semana
        </Chip>
        <Chip href="/painel/agenda?quando=PONTUAL" ativo={filtros.quando === "PONTUAL"}>
          Com data marcada
        </Chip>
        <Chip href="/painel/agenda?tipo=CULTO" ativo={filtros.tipo === "CULTO"}>
          Cultos
        </Chip>
        <Chip href="/painel/agenda?tipo=EVENTO" ativo={filtros.tipo === "EVENTO"}>
          Eventos
        </Chip>
        <Chip href="/painel/agenda?situacao=INATIVOS" ativo={filtros.situacao === "INATIVOS"}>
          Desativados
        </Chip>
      </div>

      <details className="secao-painel">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Novo item na agenda</summary>
        <p className="secao-painel__desc" style={{ marginTop: ".8rem" }}>
          Encontros que se repetem toda semana (culto de domingo) e eventos com data marcada
          (batismo de 12/10) vivem na mesma lista, com modos diferentes de horário.
        </p>
        <div style={{ marginTop: "1rem" }}>
          <FormularioAgenda modo="criar" campi={campi} />
        </div>
      </details>

      {itens.length === 0 ? (
        <div className="vazio">Nenhum item com esses filtros.</div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {itens.map((item) => (
            <article key={item.id} className="secao-painel" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: ".6rem" }}>
                    <span className="etiqueta etiqueta--concluido">{rotuloTipo(item.tipo)}</span>
                    {item.destaque && <span className="etiqueta etiqueta--urgente">Destaque</span>}
                    {!item.publicoSite && <span className="etiqueta etiqueta--spam">Só interno</span>}
                    {!item.ativo && <span className="etiqueta etiqueta--spam">Desativado</span>}
                  </div>

                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem" }}>
                    {item.titulo}
                  </h2>

                  <p className="dim" style={{ fontSize: ".84rem", marginTop: ".35rem" }}>
                    {descreverQuando(item)}
                    {item.campus?.nome ? ` · ${item.campus.nome}` : ""}
                  </p>

                  {item.descricao && (
                    <p
                      style={{
                        marginTop: ".7rem",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        color: "var(--graphite-dim)",
                        fontSize: ".9rem",
                      }}
                    >
                      {item.descricao}
                    </p>
                  )}
                </div>
              </div>

              <details style={{ marginTop: "1rem" }}>
                <summary style={{ cursor: "pointer", fontSize: ".84rem", fontWeight: 600 }}>
                  Editar
                </summary>
                <div style={{ marginTop: "1rem" }}>
                  <FormularioAgenda
                    modo="editar"
                    itemId={item.id}
                    campi={campi}
                    inicial={{
                      tipo: item.tipo,
                      titulo: item.titulo,
                      descricao: item.descricao ?? "",
                      campusId: item.campusId ?? "",
                      diaSemana: item.diaSemana === null ? "" : String(item.diaSemana),
                      horario: item.horario ?? "",
                      dataHora: paraCampoDataHora(item.dataHora),
                      destaque: item.destaque,
                      ativo: item.ativo,
                      publicoSite: item.publicoSite,
                      ordem: item.ordem,
                    }}
                  />
                </div>
              </details>
            </article>
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {filtros.pagina > 1 && <a href={montarUrl(filtros, filtros.pagina - 1)}>← Anterior</a>}
          <span aria-current="page">
            {filtros.pagina} de {totalPaginas}
          </span>
          {filtros.pagina < totalPaginas && (
            <a href={montarUrl(filtros, filtros.pagina + 1)}>Próxima →</a>
          )}
        </nav>
      )}
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

function montarUrl(
  filtros: { tipo: string; situacao: string; quando: string },
  pagina: number,
): string {
  const p = new URLSearchParams();
  if (filtros.tipo !== "TODOS") p.set("tipo", filtros.tipo);
  if (filtros.situacao !== "ATIVOS") p.set("situacao", filtros.situacao);
  if (filtros.quando !== "TODOS") p.set("quando", filtros.quando);
  p.set("pagina", String(pagina));
  return `/painel/agenda?${p.toString()}`;
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

function descreverQuando(item: {
  recorrente: boolean;
  diaSemana: number | null;
  horario: string | null;
  dataHora: Date | null;
}): string {
  if (item.dataHora) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(item.dataHora);
  }

  // `noUncheckedIndexedAccess` está ligado: o acesso ao array devolve
  // `string | undefined`, então o fallback não é zelo excessivo — é o que o
  // compilador exige, e cobre um `diaSemana` fora de 0..6 vindo de dado antigo.
  const dia = item.diaSemana === null ? undefined : DIAS[item.diaSemana];
  if (!dia) return "Horário não definido";
  return `Todo(a) ${dia}${item.horario ? ` às ${item.horario}` : ""}`;
}

/** Date -> "AAAA-MM-DDTHH:MM" no fuso do servidor (o mesmo em que foi gravada). */
function paraCampoDataHora(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function rotuloTipo(tipo: string): string {
  const mapa: Record<string, string> = {
    CULTO: "Culto",
    ESCOLA: "Escola",
    CELULA: "Célula",
    EVENTO: "Evento",
    ENSAIO: "Ensaio",
    ORACAO: "Oração",
  };
  return mapa[tipo] ?? tipo;
}
