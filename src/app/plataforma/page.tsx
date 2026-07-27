import Link from "next/link";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visão geral" };

/**
 * Visão geral da plataforma.
 *
 * O que aparece aqui são MÉTRICAS AGREGADAS de operação — quantas igrejas,
 * quantos usuários, quantos domínios pendentes. Deliberadamente NÃO existe
 * aqui nenhuma listagem de pessoas, pedidos de oração ou conteúdo de igreja.
 *
 * Poder técnico de acessar tudo não é razão para construir a tela que exibe
 * tudo. Para entrar no dado de uma igreja, o caminho é a impersonação
 * explícita e auditada, com a faixa vermelha visível o tempo todo.
 */
export default async function PlataformaInicio() {
  await exigirPlataformaAdmin();

  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalIgrejas,
    porStatus,
    totalUsuarios,
    dominiosPendentes,
    sessoesAtivas,
    loginsFalhos,
    ultimasIgrejas,
  ] = await Promise.all([
    prisma.tenant.count({ where: { excluidoEm: null } }),
    prisma.tenant.groupBy({
      by: ["status"],
      where: { excluidoEm: null },
      _count: { _all: true },
    }),
    prisma.user.count({ where: { ativo: true } }),
    prisma.tenantDomain.count({ where: { status: { in: ["PENDENTE", "ERRO"] } } }),
    prisma.sessao.count({ where: { revogadaEm: null, expiraEm: { gt: new Date() } } }),
    prisma.platformAuditLog.count({
      where: { acao: "login.falha", criadoEm: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
    prisma.tenant.findMany({
      where: { excluidoEm: null },
      orderBy: { criadoEm: "desc" },
      take: 8,
      select: {
        id: true, nome: true, slug: true, status: true, plano: true, criadoEm: true,
        _count: { select: { membros: true, pessoas: true } },
      },
    }),
  ]);

  const contagem: Record<string, number> = {};
  for (const s of porStatus) contagem[s.status] = s._count._all;

  const novasNoMes = await prisma.tenant.count({
    where: { criadoEm: { gte: trintaDias }, excluidoEm: null },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Plataforma</h1>
          <p className="painel__sub">
            {totalIgrejas} {totalIgrejas === 1 ? "igreja" : "igrejas"} em {env.ROOT_DOMAIN}
          </p>
        </div>
        <Link href="/plataforma/igrejas/nova" className="btn btn--sm">
          Nova igreja
        </Link>
      </div>

      <div className="cartoes" style={{ marginBottom: "2.5rem" }}>
        <Cartao rotulo="Ativas" valor={contagem.ATIVO ?? 0} nota="Operando normalmente" />
        <Cartao rotulo="Em avaliação" valor={contagem.TRIAL ?? 0} nota="Período de teste" />
        <Cartao
          rotulo="Suspensas"
          valor={contagem.SUSPENSO ?? 0}
          nota="Site fora do ar"
          destaque={(contagem.SUSPENSO ?? 0) > 0}
        />
        <Cartao rotulo="Novas em 30 dias" valor={novasNoMes} nota="Crescimento" />
      </div>

      <div className="cartoes" style={{ marginBottom: "2.5rem" }}>
        <Cartao rotulo="Usuários ativos" valor={totalUsuarios} nota="Contas habilitadas" />
        <Cartao rotulo="Sessões abertas" valor={sessoesAtivas} nota="Agora" />
        <Cartao
          rotulo="Domínios pendentes"
          valor={dominiosPendentes}
          nota="Aguardando verificação de DNS"
          destaque={dominiosPendentes > 0}
        />
        <Cartao
          rotulo="Logins falhos (24h)"
          valor={loginsFalhos}
          nota={loginsFalhos > 50 ? "Volume acima do normal — investigar" : "Dentro do esperado"}
          destaque={loginsFalhos > 50}
        />
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Últimas igrejas</h2>
        <p className="secao-painel__desc">Cadastros mais recentes na plataforma.</p>

        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Igreja</th>
                <th>Endereço</th>
                <th>Plano</th>
                <th>Usuários</th>
                <th>Pessoas</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {ultimasIgrejas.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/plataforma/igrejas/${t.id}`} style={{ fontWeight: 600 }}>
                      {t.nome}
                    </Link>
                  </td>
                  <td style={{ fontSize: ".82rem", color: "var(--graphite-dim)" }}>
                    {t.slug}.{env.ROOT_DOMAIN}
                  </td>
                  <td style={{ fontSize: ".85rem" }}>{t.plano}</td>
                  <td>{t._count.membros}</td>
                  <td>{t._count.pessoas}</td>
                  <td>
                    <EtiquetaTenant status={t.status} />
                  </td>
                </tr>
              ))}
              {ultimasIgrejas.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "var(--graphite-faint)", padding: "2.5rem" }}>
                    Nenhuma igreja cadastrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: number;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div className={`cartao${destaque ? " cartao--destaque" : ""}`}>
      <span className="cartao__rotulo">{rotulo}</span>
      <span className="cartao__valor">{valor.toLocaleString("pt-BR")}</span>
      <span className="cartao__nota">{nota}</span>
    </div>
  );
}

function EtiquetaTenant({ status }: { status: string }) {
  const mapa: Record<string, { classe: string; rotulo: string }> = {
    ATIVO: { classe: "novo", rotulo: "Ativa" },
    TRIAL: { classe: "andamento", rotulo: "Avaliação" },
    SUSPENSO: { classe: "urgente", rotulo: "Suspensa" },
    CANCELADO: { classe: "spam", rotulo: "Cancelada" },
  };
  const item = mapa[status] ?? { classe: "concluido", rotulo: status };
  return <span className={`etiqueta etiqueta--${item.classe}`}>{item.rotulo}</span>;
}
