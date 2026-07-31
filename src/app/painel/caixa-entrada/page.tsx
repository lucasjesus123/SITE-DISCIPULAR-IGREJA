import Link from "next/link";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { rotuloTipo, tempoRelativo } from "@/app/painel/page";
import { LinhaClicavel } from "@/components/painel/LinhaClicavel";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = { title: "Caixa de entrada" };

/**
 * Fila de triagem.
 *
 * Recebe tudo que chega do site e do app: visitantes, novos membros, pedidos
 * de batismo, oração, contato e inscrições. Nada disso entra no cadastro
 * definitivo sem passar por aqui.
 *
 * SOBRE OS FILTROS NA URL
 * Os parâmetros `status`, `tipo` e `pagina` vêm da query string, que é
 * controlada pelo visitante. Todos são validados por Zod contra uma lista
 * fechada antes de virarem cláusula `where`. Um `?status=DROP TABLE` vira o
 * valor padrão, não um erro nem uma query estranha.
 */

const schemaFiltros = z.object({
  status: z.enum(["NOVO", "EM_ANALISE", "CONCLUIDO", "ARQUIVADO", "SPAM", "TODOS"]).default("NOVO"),
  tipo: z
    .enum([
      "TODOS", "VISITANTE", "NOVO_MEMBRO", "BATISMO",
      "PEDIDO_ORACAO", "CONTATO", "INSCRICAO_CURSO", "QUERO_CELULA",
    ])
    .default("TODOS"),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 25;

export default async function CaixaEntrada({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("submissoes.ler");
  const params = await searchParams;

  // `safeParse` + fallback: um filtro inválido não deve gerar erro 500 numa
  // tela que a secretária usa o dia inteiro.
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.SubmissaoWhereInput = {
    ...(filtros.status !== "TODOS" ? { status: filtros.status } : {}),
    ...(filtros.tipo !== "TODOS" ? { tipo: filtros.tipo } : {}),
    // Sem filtro explícito, spam fica fora da fila.
    ...(filtros.status === "TODOS" ? { status: { not: "SPAM" } } : {}),
  };

  const [itens, total, contagens] = await Promise.all([
    ctx.db.submissao.findMany({
      where,
      orderBy: [{ criadoEm: "desc" }],
      // `select` explícito: o campo `dados` (que tem o conteúdo completo,
      // incluindo testemunho e pedido de oração) NÃO vem para a listagem.
      // Ele só é carregado na tela de detalhe, e só para quem a abre.
      select: {
        id: true, tipo: true, status: true, nome: true, email: true,
        telefone: true, criadoEm: true, scoreSpam: true, responsavelId: true,
        pessoaGeradaId: true,
      },
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
    }),
    ctx.db.submissao.count({ where }),
    ctx.db.submissao.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const porStatus: Record<string, number> = {};
  for (const c of contagens) porStatus[c.status] = c._count._all;

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Abrir a fila é um acesso a dado pessoal em lote. Fica registrado.
  await auditar(ctx, {
    acao: "submissao.listar",
    detalhes: { status: filtros.status, tipo: filtros.tipo, resultados: itens.length },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Caixa de entrada</h1>
          <p className="painel__sub">
            Tudo que chega do site e do aplicativo passa por aqui antes de virar cadastro.
          </p>
        </div>
      </div>

      <div className="barra-ferramentas">
        <Chip href="/painel/caixa-entrada?status=NOVO" ativo={filtros.status === "NOVO"}>
          Novos {porStatus.NOVO ? `(${porStatus.NOVO})` : ""}
        </Chip>
        <Chip href="/painel/caixa-entrada?status=EM_ANALISE" ativo={filtros.status === "EM_ANALISE"}>
          Em análise {porStatus.EM_ANALISE ? `(${porStatus.EM_ANALISE})` : ""}
        </Chip>
        <Chip href="/painel/caixa-entrada?status=CONCLUIDO" ativo={filtros.status === "CONCLUIDO"}>
          Concluídos
        </Chip>
        <Chip href="/painel/caixa-entrada?status=TODOS" ativo={filtros.status === "TODOS"}>
          Todos
        </Chip>
        <span style={{ width: 1, height: 24, background: "var(--pnl-line)" }} aria-hidden="true" />
        <Chip href="/painel/caixa-entrada?status=SPAM" ativo={filtros.status === "SPAM"}>
          Spam {porStatus.SPAM ? `(${porStatus.SPAM})` : ""}
        </Chip>
      </div>

      <div className="barra-ferramentas">
        {(
          [
            ["TODOS", "Todos os tipos"],
            ["VISITANTE", "Visitantes"],
            ["NOVO_MEMBRO", "Novos membros"],
            ["BATISMO", "Batismos"],
            ["PEDIDO_ORACAO", "Oração"],
            ["CONTATO", "Contato"],
            ["INSCRICAO_CURSO", "Inscrições"],
            ["QUERO_CELULA", "Células"],
          ] as const
        ).map(([valor, rotulo]) => (
          <Chip
            key={valor}
            href={`/painel/caixa-entrada?status=${filtros.status}&tipo=${valor}`}
            ativo={filtros.tipo === valor}
          >
            {rotulo}
          </Chip>
        ))}
      </div>

      {itens.length === 0 ? (
        <div className="vazio">
          <p style={{ fontFamily: "var(--font-display)", fontSize: "1.4rem", marginBottom: ".5rem" }}>
            Nada por aqui
          </p>
          <p>Nenhum item corresponde a esses filtros.</p>
        </div>
      ) : (
        <>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Contato</th>
                  <th>Recebido</th>
                  <th>Situação</th>
                  <th aria-label="Ação"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((item) => (
                  <LinhaClicavel key={item.id} href={`/painel/caixa-entrada/${item.id}`}>
                    <td style={{ fontWeight: 600 }}>
                      {item.nome}
                      {item.pessoaGeradaId && (
                        <span className="etiqueta etiqueta--concluido" style={{ marginLeft: ".5rem" }}>
                          Cadastrado
                        </span>
                      )}
                    </td>
                    <td>{rotuloTipo(item.tipo)}</td>
                    <td style={{ color: "var(--pnl-text-dim)", fontSize: ".85rem" }}>
                      {item.telefone ?? item.email ?? "—"}
                    </td>
                    <td style={{ color: "var(--pnl-text-dim)" }}>{tempoRelativo(item.criadoEm)}</td>
                    <td>
                      <EtiquetaStatus status={item.status} scoreSpam={item.scoreSpam} />
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <span className="linha-clicavel__acao">Abrir e editar →</span>
                    </td>
                  </LinhaClicavel>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <nav className="paginacao" aria-label="Paginação">
              {filtros.pagina > 1 && (
                <Link
                  href={`/painel/caixa-entrada?status=${filtros.status}&tipo=${filtros.tipo}&pagina=${filtros.pagina - 1}`}
                >
                  ← Anterior
                </Link>
              )}
              <span aria-current="page">
                {filtros.pagina} de {totalPaginas}
              </span>
              {filtros.pagina < totalPaginas && (
                <Link
                  href={`/painel/caixa-entrada?status=${filtros.status}&tipo=${filtros.tipo}&pagina=${filtros.pagina + 1}`}
                >
                  Próxima →
                </Link>
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

function EtiquetaStatus({ status, scoreSpam }: { status: string; scoreSpam: number }) {
  if (status === "SPAM") {
    return <span className="etiqueta etiqueta--spam">Spam ({scoreSpam})</span>;
  }
  if (status === "NOVO") return <span className="etiqueta etiqueta--novo">Novo</span>;
  if (status === "EM_ANALISE") return <span className="etiqueta etiqueta--andamento">Em análise</span>;
  if (status === "CONCLUIDO") return <span className="etiqueta etiqueta--concluido">Concluído</span>;
  return <span className="etiqueta etiqueta--concluido">Arquivado</span>;
}
