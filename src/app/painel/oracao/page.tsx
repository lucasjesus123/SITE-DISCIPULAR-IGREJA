import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { tempoRelativo } from "@/lib/painel/formato";
import { AcoesOracao } from "@/components/painel/AcoesOracao";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos de oração" };

/**
 * Pedidos de oração.
 *
 * ESTA É A TELA MAIS SENSÍVEL DO SISTEMA.
 *
 * O que passa por aqui: diagnóstico de câncer, separação, filho preso,
 * desemprego, depressão. Sob a LGPD, boa parte disso é dado pessoal SENSÍVEL
 * (saúde, convicção religiosa), com proteção reforçada.
 *
 * Consequências práticas no código:
 *   - Só quem tem `oracao.ler` chega aqui. Secretaria tem; membro comum não.
 *   - Toda abertura da lista é auditada, e cada leitura individual também.
 *   - Pedido anônimo NUNCA exibe identificação — não porque escondemos, mas
 *     porque os campos nem foram gravados.
 *   - Não há exportação em massa desta tela.
 */

const schemaFiltros = z.object({
  status: z.enum(["RECEBIDO", "ORANDO", "RESPONDIDO", "ARQUIVADO", "TODOS"]).default("RECEBIDO"),
  urgente: z.enum(["sim", "nao"]).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
});

const POR_PAGINA = 20;

export default async function PainelOracao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("oracao.ler");
  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.PedidoOracaoWhereInput = {
    ...(filtros.status !== "TODOS" ? { status: filtros.status } : {}),
    ...(filtros.urgente === "sim" ? { urgente: true } : {}),
  };

  const [pedidos, total, urgentes] = await Promise.all([
    ctx.db.pedidoOracao.findMany({
      where,
      orderBy: [{ urgente: "desc" }, { criadoEm: "desc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true, categoria: true, titulo: true, pedido: true, urgente: true,
        status: true, visibilidade: true, anonimo: true, nomeSolicitante: true,
        telefoneContato: true, emailContato: true, contadorOracoes: true,
        criadoEm: true, respondidoEm: true, respostaTestemunho: true,
      },
    }),
    ctx.db.pedidoOracao.count({ where }),
    ctx.db.pedidoOracao.count({ where: { urgente: true, status: { in: ["RECEBIDO", "ORANDO"] } } }),
  ]);

  // Acesso em lote a dado sensível: fica registrado com a contagem.
  await auditar(ctx, {
    acao: "oracao.listar",
    detalhes: { status: filtros.status, resultados: pedidos.length },
  });

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Pedidos de oração</h1>
          <p className="painel__sub">
            Conteúdo sensível. Todo acesso a esta área fica registrado na auditoria.
          </p>
        </div>
      </div>

      <div className="barra-ferramentas">
        <Chip href="/painel/oracao?status=RECEBIDO" ativo={filtros.status === "RECEBIDO" && !filtros.urgente}>
          Novos
        </Chip>
        <Chip href="/painel/oracao?status=ORANDO" ativo={filtros.status === "ORANDO"}>
          Orando
        </Chip>
        <Chip href="/painel/oracao?status=RESPONDIDO" ativo={filtros.status === "RESPONDIDO"}>
          Respondidos
        </Chip>
        <Chip href="/painel/oracao?status=TODOS" ativo={filtros.status === "TODOS"}>
          Todos
        </Chip>
        {urgentes > 0 && (
          <Chip href="/painel/oracao?status=TODOS&urgente=sim" ativo={filtros.urgente === "sim"}>
            Urgentes ({urgentes})
          </Chip>
        )}
      </div>

      {pedidos.length === 0 ? (
        <div className="vazio">Nenhum pedido com esses filtros.</div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {pedidos.map((p) => (
            <article
              key={p.id}
              className="secao-painel"
              style={{
                marginBottom: 0,
                borderColor: p.urgente ? "rgb(207 34 46 / .35)" : undefined,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                <div>
                  <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: ".6rem" }}>
                    <span className="etiqueta etiqueta--concluido">{rotuloCategoria(p.categoria)}</span>
                    {p.urgente && <span className="etiqueta etiqueta--urgente">Urgente</span>}
                    <EtiquetaStatus status={p.status} />
                    <EtiquetaVisibilidade visibilidade={p.visibilidade} />
                  </div>

                  {p.titulo && (
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.25rem" }}>{p.titulo}</h2>
                  )}

                  <p className="dim" style={{ fontSize: ".82rem", marginTop: ".3rem" }}>
                    {p.anonimo ? (
                      // Não é ocultação de interface: os campos de identificação
                      // simplesmente não existem no banco para pedidos anônimos.
                      <em>Pedido anônimo</em>
                    ) : (
                      <>
                        {p.nomeSolicitante ?? "Sem identificação"}
                        {p.telefoneContato && ` · ${p.telefoneContato}`}
                      </>
                    )}
                    {" · "}
                    {tempoRelativo(p.criadoEm)}
                    {p.contadorOracoes > 0 && ` · ${p.contadorOracoes} orando`}
                  </p>
                </div>
              </div>

              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, color: "var(--graphite-dim)" }}>
                {p.pedido}
              </p>

              {p.respostaTestemunho && (
                <div
                  style={{
                    marginTop: "1.2rem",
                    padding: "1rem",
                    background: "rgb(46 160 67 / .06)",
                    border: "1px solid rgb(46 160 67 / .25)",
                    borderRadius: "var(--radius)",
                  }}
                >
                  <p className="cartao__rotulo" style={{ color: "#2ea043" }}>
                    Testemunho de resposta
                  </p>
                  <p style={{ marginTop: ".4rem", whiteSpace: "pre-wrap" }}>{p.respostaTestemunho}</p>
                </div>
              )}

              {ctx.pode("oracao.responder") && (
                <AcoesOracao
                  pedidoId={p.id}
                  statusAtual={p.status}
                  podeExcluir={ctx.pode("oracao.excluir")}
                />
              )}
            </article>
          ))}
        </div>
      )}

      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {filtros.pagina > 1 && (
            <a href={`/painel/oracao?status=${filtros.status}&pagina=${filtros.pagina - 1}`}>← Anterior</a>
          )}
          <span aria-current="page">
            {filtros.pagina} de {totalPaginas}
          </span>
          {filtros.pagina < totalPaginas && (
            <a href={`/painel/oracao?status=${filtros.status}&pagina=${filtros.pagina + 1}`}>Próxima →</a>
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

function EtiquetaStatus({ status }: { status: string }) {
  const mapa: Record<string, { classe: string; rotulo: string }> = {
    RECEBIDO: { classe: "novo", rotulo: "Recebido" },
    ORANDO: { classe: "andamento", rotulo: "Orando" },
    RESPONDIDO: { classe: "concluido", rotulo: "Respondido" },
    ARQUIVADO: { classe: "spam", rotulo: "Arquivado" },
  };
  const item = mapa[status] ?? { classe: "concluido", rotulo: status };
  return <span className={`etiqueta etiqueta--${item.classe}`}>{item.rotulo}</span>;
}

function EtiquetaVisibilidade({ visibilidade }: { visibilidade: string }) {
  if (visibilidade === "PRIVADO") return null;
  return (
    <span className="etiqueta etiqueta--andamento">
      {visibilidade === "PUBLICO" ? "No site" : "No app"}
    </span>
  );
}

function rotuloCategoria(c: string): string {
  const mapa: Record<string, string> = {
    SAUDE: "Saúde",
    FAMILIA: "Família",
    FINANCEIRO: "Financeiro",
    TRABALHO: "Trabalho",
    ESPIRITUAL: "Espiritual",
    LUTO: "Luto",
    GRATIDAO: "Gratidão",
    GERAL: "Geral",
  };
  return mapa[c] ?? c;
}
