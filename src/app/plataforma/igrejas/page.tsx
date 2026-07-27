import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { termoBusca } from "@/lib/validation/comum";

export const dynamic = "force-dynamic";
export const metadata = { title: "Igrejas" };

/**
 * Lista de igrejas clientes.
 *
 * O QUE APARECE E O QUE NÃO APARECE
 * Metadado comercial (nome, endereço, plano, situação) e CONTAGENS. Nenhum
 * nome de membro, nenhum pedido de oração, nenhum conteúdo. Contagem responde
 * "esta igreja está usando o produto?" sem abrir a porta dos dados dela.
 *
 * Para entrar de verdade existe um caminho só: a impersonação explícita, na
 * tela de detalhe, com faixa vermelha e registro nos dois logs.
 */

/**
 * Filtros da URL.
 *
 * `safeParse` com fallback, e não `parse`: um `?pagina=abc` vindo de um link
 * quebrado deve mostrar a primeira página, não uma tela de erro. E lista
 * FECHADA de valores em `status` e `ordem` — se qualquer um deles fosse
 * repassado cru para o `orderBy` do Prisma, viraria um canal de controle sobre
 * a query.
 */
const schemaFiltros = z.object({
  // `termoBusca` já limita o tamanho e remove caracteres de controle.
  busca: termoBusca,
  status: z.enum(["TRIAL", "ATIVO", "SUSPENSO", "CANCELADO", "TODOS"]).default("TODOS"),
  plano: z.enum(["ESSENCIAL", "CRESCIMENTO", "MULTISEDE", "TODOS"]).default("TODOS"),
  ordem: z.enum(["recentes", "nome", "pessoas"]).default("recentes"),
  pagina: z.coerce.number().int().min(1).max(1_000).default(1),
});

/** Teto de página. Nunca vem da URL: paginação é do servidor, não do cliente. */
const POR_PAGINA = 25;

export default async function ListaIgrejas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPlataformaAdmin();

  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.TenantWhereInput = {
    ...(filtros.status !== "TODOS" ? { status: filtros.status } : {}),
    ...(filtros.plano !== "TODOS" ? { plano: filtros.plano } : {}),
    // Igreja cancelada continua listável (é preciso conseguir reativá-la),
    // mas só quando o operador filtrar por ela de propósito.
    ...(filtros.status === "TODOS" ? { excluidoEm: null } : {}),
    ...(filtros.busca
      ? {
          OR: [
            { nome: { contains: filtros.busca, mode: "insensitive" } },
            { slug: { contains: filtros.busca, mode: "insensitive" } },
            { razaoSocial: { contains: filtros.busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.TenantOrderByWithRelationInput =
    filtros.ordem === "nome"
      ? { nome: "asc" }
      : filtros.ordem === "pessoas"
        ? { pessoas: { _count: "desc" } }
        : { criadoEm: "desc" };

  const [igrejas, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      orderBy,
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      // `select` explícito: sem ele o Prisma traria a linha inteira, e o dia em
      // que alguém acrescentar uma coluna sensível ao Tenant ela viria junto
      // sem ninguém decidir isso.
      select: {
        id: true,
        nome: true,
        slug: true,
        status: true,
        plano: true,
        criadoEm: true,
        trialExpiraEm: true,
        limiteUsuarios: true,
        limitePessoas: true,
        _count: { select: { membros: true, pessoas: true, dominios: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const agora = Date.now();

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Igrejas</h1>
          <p className="painel__sub">
            {total} {total === 1 ? "igreja encontrada" : "igrejas encontradas"} com os filtros atuais.
          </p>
        </div>
        <Link href="/plataforma/igrejas/nova" className="btn btn--sm">
          Nova igreja
        </Link>
      </div>

      {/*
        Busca por GET: sem estado no cliente, o filtro vira URL compartilhável e
        o histórico do navegador funciona. GET também não passa pela checagem de
        origem do middleware, o que é correto — ele não muda estado nenhum.
      */}
      <form method="get" className="barra-ferramentas" style={{ alignItems: "flex-end" }}>
        <div className="campo" style={{ minWidth: "220px", flex: 1 }}>
          <label className="campo__rotulo" htmlFor="busca">
            Buscar
          </label>
          <input
            id="busca"
            name="busca"
            type="search"
            defaultValue={filtros.busca ?? ""}
            maxLength={80}
            placeholder="Nome, endereço ou razão social"
          />
        </div>

        <div className="campo" style={{ minWidth: "150px" }}>
          <label className="campo__rotulo" htmlFor="status">
            Situação
          </label>
          <select id="status" name="status" defaultValue={filtros.status}>
            <option value="TODOS">Todas</option>
            <option value="TRIAL">Em avaliação</option>
            <option value="ATIVO">Ativas</option>
            <option value="SUSPENSO">Suspensas</option>
            <option value="CANCELADO">Canceladas</option>
          </select>
        </div>

        <div className="campo" style={{ minWidth: "150px" }}>
          <label className="campo__rotulo" htmlFor="plano">
            Plano
          </label>
          <select id="plano" name="plano" defaultValue={filtros.plano}>
            <option value="TODOS">Todos</option>
            <option value="ESSENCIAL">Essencial</option>
            <option value="CRESCIMENTO">Crescimento</option>
            <option value="MULTISEDE">Multissede</option>
          </select>
        </div>

        <div className="campo" style={{ minWidth: "150px" }}>
          <label className="campo__rotulo" htmlFor="ordem">
            Ordenar por
          </label>
          <select id="ordem" name="ordem" defaultValue={filtros.ordem}>
            <option value="recentes">Mais recentes</option>
            <option value="nome">Nome</option>
            <option value="pessoas">Mais pessoas</option>
          </select>
        </div>

        <button type="submit" className="btn btn--sm">
          Filtrar
        </button>
      </form>

      {igrejas.length === 0 ? (
        <div className="vazio">Nenhuma igreja com esses filtros.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Igreja</th>
                <th>Endereço</th>
                <th>Plano</th>
                <th>Usuários</th>
                <th>Pessoas</th>
                <th>Domínios</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {igrejas.map((igreja) => {
                const trialVencendo =
                  igreja.status === "TRIAL" &&
                  igreja.trialExpiraEm !== null &&
                  igreja.trialExpiraEm.getTime() - agora < 7 * 24 * 60 * 60 * 1000;

                return (
                  <tr key={igreja.id}>
                    <td>
                      <Link href={`/plataforma/igrejas/${igreja.id}`} style={{ fontWeight: 600 }}>
                        {igreja.nome}
                      </Link>
                      <div style={{ fontSize: ".76rem", color: "var(--graphite-faint)", marginTop: ".2rem" }}>
                        desde {igreja.criadoEm.toLocaleDateString("pt-BR")}
                      </div>
                    </td>
                    <td style={{ fontSize: ".82rem", color: "var(--graphite-dim)" }}>
                      {igreja.slug}.{env.ROOT_DOMAIN}
                    </td>
                    <td style={{ fontSize: ".85rem" }}>{rotuloPlano(igreja.plano)}</td>
                    <td>
                      <Uso atual={igreja._count.membros} teto={igreja.limiteUsuarios} />
                    </td>
                    <td>
                      <Uso atual={igreja._count.pessoas} teto={igreja.limitePessoas} />
                    </td>
                    <td>{igreja._count.dominios}</td>
                    <td>
                      <EtiquetaStatus status={igreja.status} />
                      {trialVencendo && (
                        <span className="etiqueta etiqueta--urgente" style={{ marginLeft: ".35rem" }}>
                          Vence em breve
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {filtros.pagina > 1 && (
            <Link href={linkPagina(filtros, filtros.pagina - 1)}>← Anterior</Link>
          )}
          <span aria-current="page">
            {filtros.pagina} de {totalPaginas}
          </span>
          {filtros.pagina < totalPaginas && (
            <Link href={linkPagina(filtros, filtros.pagina + 1)}>Próxima →</Link>
          )}
        </nav>
      )}
    </>
  );
}

/** Monta o link da paginação preservando os filtros já aplicados. */
function linkPagina(filtros: z.infer<typeof schemaFiltros>, pagina: number): string {
  const query = new URLSearchParams();
  if (filtros.busca) query.set("busca", filtros.busca);
  if (filtros.status !== "TODOS") query.set("status", filtros.status);
  if (filtros.plano !== "TODOS") query.set("plano", filtros.plano);
  if (filtros.ordem !== "recentes") query.set("ordem", filtros.ordem);
  query.set("pagina", String(pagina));
  return `/plataforma/igrejas?${query.toString()}`;
}

function Uso({ atual, teto }: { atual: number; teto: number }) {
  const proporcao = teto > 0 ? atual / teto : 0;
  const apertado = proporcao >= 0.85;

  return (
    <span style={{ fontSize: ".85rem", color: apertado ? "#cf222e" : undefined, fontWeight: apertado ? 600 : undefined }}>
      {atual.toLocaleString("pt-BR")}
      <span style={{ color: "var(--graphite-faint)", fontWeight: 400 }}>
        {" / "}
        {teto.toLocaleString("pt-BR")}
      </span>
    </span>
  );
}

function EtiquetaStatus({ status }: { status: string }) {
  const mapa: Record<string, { classe: string; rotulo: string }> = {
    ATIVO: { classe: "novo", rotulo: "Ativa" },
    TRIAL: { classe: "andamento", rotulo: "Avaliação" },
    SUSPENSO: { classe: "urgente", rotulo: "Suspensa" },
    CANCELADO: { classe: "spam", rotulo: "Cancelada" },
  };
  const item = mapa[status] ?? { classe: "concluido", rotulo: status };
  return <span className={`etiqueta etiqueta--${item.classe}`}>{item.rotulo}</span>;
}

function rotuloPlano(plano: string): string {
  const mapa: Record<string, string> = {
    ESSENCIAL: "Essencial",
    CRESCIMENTO: "Crescimento",
    MULTISEDE: "Multissede",
  };
  return mapa[plano] ?? plano;
}
