import Link from "next/link";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const metadata = { title: "Saúde do sistema" };

/**
 * Saúde operacional da plataforma.
 *
 * A REGRA DESTA TELA: NÚMEROS SOBRE A INFRAESTRUTURA, NUNCA CONTEÚDO DE IGREJA
 *
 * Tudo aqui é ou de modelo global (sessões, baldes de rate limit, usuários,
 * tenants) ou metadado do próprio Postgres (tamanho de tabela). Não há uma
 * única leitura de Pessoa, PedidoOracao, Submissao ou Mensagem — nem agregada.
 *
 * A tentação é real: "só um top 5 de igrejas por pedidos de oração ajudaria a
 * dimensionar o banco". Ajudaria, e criaria um relatório permanente sobre o
 * dado mais sensível do sistema, disponível sem impersonação e sem registro na
 * auditoria da igreja. Tamanho de tabela responde a mesma pergunta de
 * capacidade sem tocar em nenhuma linha.
 */

interface TamanhoTabela {
  tabela: string;
  bytes: number;
  linhasEstimadas: number;
}

export default async function SaudeDoSistema() {
  await exigirPlataformaAdmin();

  const agora = new Date();
  const vinteQuatroHoras = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  const [
    sessoesAtivas,
    sessoesExpiradasPendentes,
    sessoesSuporte,
    baldesAtivos,
    baldesBloqueando,
    tenantsPorStatus,
    usuariosAtivos,
    usuariosBloqueados,
    tokensSenhaPendentes,
    eventos24h,
    loginsFalhos24h,
    errosDominio,
    tamanhos,
  ] = await Promise.all([
    prisma.sessao.count({ where: { revogadaEm: null, expiraEm: { gt: agora } } }),
    // Linhas que já não valem nada mas continuam ocupando a tabela: se este
    // número crescer sem parar, a rotina de manutenção parou de rodar.
    prisma.sessao.count({ where: { expiraEm: { lte: agora } } }),
    prisma.sessao.count({
      where: { impersonadoPor: { not: null }, revogadaEm: null, expiraEm: { gt: agora } },
    }),
    prisma.rateLimitBucket.count({ where: { janelaFim: { gt: agora } } }),
    prisma.rateLimitBucket.count({ where: { bloqueadoAte: { gt: agora } } }),
    prisma.tenant.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count({ where: { ativo: true } }),
    prisma.user.count({ where: { bloqueadoAte: { gt: agora } } }),
    prisma.tokenSenha.count({ where: { usadoEm: null, expiraEm: { gt: agora } } }),
    prisma.platformAuditLog.count({ where: { criadoEm: { gte: vinteQuatroHoras } } }),
    prisma.platformAuditLog.count({
      where: { acao: "login.falha", criadoEm: { gte: vinteQuatroHoras } },
    }),
    prisma.tenantDomain.findMany({
      where: { OR: [{ status: "ERRO" }, { ultimoErro: { not: null } }] },
      orderBy: { criadoEm: "desc" },
      take: 10,
      select: {
        id: true,
        hostname: true,
        status: true,
        ultimoErro: true,
        criadoEm: true,
        tenant: { select: { id: true, nome: true } },
      },
    }),
    medirTabelas(),
  ]);

  const porStatus: Record<string, number> = {};
  for (const linha of tenantsPorStatus) porStatus[linha.status] = linha._count._all;

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Saúde do sistema</h1>
          <p className="painel__sub">
            Números de infraestrutura de {env.ROOT_DOMAIN}. Nenhum dado de igreja é lido nesta tela.
          </p>
        </div>
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Igrejas</h2>
        <p className="secao-painel__desc">Distribuição por situação comercial.</p>
        <div className="cartoes">
          <Cartao rotulo="Ativas" valor={porStatus.ATIVO ?? 0} nota="Operando" />
          <Cartao rotulo="Em avaliação" valor={porStatus.TRIAL ?? 0} nota="Período de teste" />
          <Cartao
            rotulo="Suspensas"
            valor={porStatus.SUSPENSO ?? 0}
            nota="Site fora do ar"
            destaque={(porStatus.SUSPENSO ?? 0) > 0}
          />
          <Cartao rotulo="Canceladas" valor={porStatus.CANCELADO ?? 0} nota="Aguardando descarte" />
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Sessões</h2>
        <p className="secao-painel__desc">
          Sessões são opacas e revogáveis, guardadas só como HMAC. Sessão vencida que não some é
          sinal de que a rotina de manutenção parou.
        </p>
        <div className="cartoes">
          <Cartao rotulo="Abertas agora" valor={sessoesAtivas} nota="Válidas e não revogadas" />
          <Cartao
            rotulo="Vencidas na tabela"
            valor={sessoesExpiradasPendentes}
            nota={
              sessoesExpiradasPendentes > 5_000
                ? "Acúmulo alto — verificar a limpeza"
                : "Serão removidas pela manutenção"
            }
            destaque={sessoesExpiradasPendentes > 5_000}
          />
          <Cartao
            rotulo="Sessões de suporte"
            valor={sessoesSuporte}
            nota={sessoesSuporte > 0 ? "Há acesso de suporte ativo agora" : "Nenhuma aberta"}
            destaque={sessoesSuporte > 0}
          />
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Contenção de abuso</h2>
        <p className="secao-painel__desc">
          Baldes de rate limit no banco (e não em memória) para valer com vários processos Node atrás
          do Nginx. Muitos bloqueios ao mesmo tempo é sinal de ataque em curso — ou de um limite
          apertado demais para uso legítimo.
        </p>
        <div className="cartoes">
          <Cartao rotulo="Baldes na janela" valor={baldesAtivos} nota="Contadores em uso" />
          <Cartao
            rotulo="Bloqueando agora"
            valor={baldesBloqueando}
            nota={baldesBloqueando > 20 ? "Volume alto — investigar" : "Normal"}
            destaque={baldesBloqueando > 20}
          />
          <Cartao
            rotulo="Logins falhos (24h)"
            valor={loginsFalhos24h}
            nota={loginsFalhos24h > 50 ? "Acima do esperado" : "Dentro do esperado"}
            destaque={loginsFalhos24h > 50}
          />
          <Cartao
            rotulo="Contas bloqueadas"
            valor={usuariosBloqueados}
            nota="Bloqueio progressivo por força bruta"
            destaque={usuariosBloqueados > 0}
          />
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Contas e eventos</h2>
        <div className="cartoes">
          <Cartao rotulo="Usuários ativos" valor={usuariosAtivos} nota="Contas habilitadas" />
          <Cartao
            rotulo="Recuperações pendentes"
            valor={tokensSenhaPendentes}
            nota="Tokens de senha ainda válidos"
            destaque={tokensSenhaPendentes > 20}
          />
          <Cartao rotulo="Eventos auditados (24h)" valor={eventos24h} nota="Log da plataforma" />
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Falhas de verificação de domínio</h2>
        <p className="secao-painel__desc">
          Últimos erros registrados na consulta de DNS. Cada linha aqui é uma igreja cujo site pode
          estar fora do ar sem que ninguém tenha percebido.
        </p>

        {errosDominio.length === 0 ? (
          <div className="vazio">Nenhuma falha registrada.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Domínio</th>
                  <th>Igreja</th>
                  <th>Situação</th>
                  <th>Último erro</th>
                </tr>
              </thead>
              <tbody>
                {errosDominio.map((dominio) => (
                  <tr key={dominio.id}>
                    <td style={{ fontWeight: 600 }}>{dominio.hostname}</td>
                    <td style={{ fontSize: ".85rem" }}>
                      <Link href={`/plataforma/igrejas/${dominio.tenant.id}`}>{dominio.tenant.nome}</Link>
                    </td>
                    <td>
                      <span
                        className={`etiqueta etiqueta--${dominio.status === "ERRO" ? "urgente" : "andamento"}`}
                      >
                        {dominio.status}
                      </span>
                    </td>
                    <td style={{ fontSize: ".82rem", color: "var(--graphite-dim)" }}>
                      {dominio.ultimoErro ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Maiores tabelas</h2>
        <p className="secao-painel__desc">
          Tamanho total (dados + índices) e estimativa de linhas do catálogo do Postgres. É a métrica
          de capacidade que responde &ldquo;quando o disco acaba?&rdquo; sem ler uma única linha de
          dado de igreja.
        </p>

        {tamanhos.length === 0 ? (
          <div className="vazio">
            Não foi possível ler o catálogo do banco. O usuário da aplicação pode não ter permissão —
            o que é aceitável: é uma tela de diagnóstico, não um requisito de funcionamento.
          </div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Tabela</th>
                  <th>Tamanho</th>
                  <th>Linhas (estimativa)</th>
                </tr>
              </thead>
              <tbody>
                {tamanhos.map((tabela) => (
                  <tr key={tabela.tabela}>
                    <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: ".85rem" }}>
                      {tabela.tabela}
                    </td>
                    <td>{formatarBytes(tabela.bytes)}</td>
                    <td style={{ color: "var(--graphite-dim)" }}>
                      {tabela.linhasEstimadas.toLocaleString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/**
 * Tamanho das maiores tabelas, pelo catálogo do Postgres.
 *
 * SOBRE O SQL CRU AQUI
 * Não há um único valor vindo do usuário nesta consulta — nem parâmetro, nem
 * interpolação. É SQL constante. Foi preciso descer a este nível porque
 * `pg_total_relation_size` não existe no Prisma Client, e a alternativa
 * (`count()` em cada modelo) daria contagem exata a um custo alto e sem dizer
 * nada sobre o espaço em disco, que é o que interessa aqui.
 *
 * `reltuples` é ESTIMATIVA mantida pelo autovacuum, não contagem. É de
 * propósito: contar 200 mil linhas para desenhar um cartão de diagnóstico
 * seria um scan completo a cada carregamento da página.
 */
async function medirTabelas(): Promise<TamanhoTabela[]> {
  try {
    const linhas = await prisma.$queryRaw<
      { tabela: string; bytes: bigint; linhas: bigint }[]
    >`
      SELECT c.relname                        AS tabela,
             pg_total_relation_size(c.oid)    AS bytes,
             GREATEST(c.reltuples, 0)::bigint AS linhas
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
      LIMIT 15
    `;

    // `bigint` não sobrevive à serialização do React Server Component; e
    // nenhum destes valores chega perto do limite do Number.
    return linhas.map((linha) => ({
      tabela: linha.tabela,
      bytes: Number(linha.bytes),
      linhasEstimadas: Number(linha.linhas),
    }));
  } catch (erro) {
    // Diagnóstico não pode derrubar a tela de diagnóstico. Sem `throw`: o
    // resto da página continua útil.
    logger.aviso("Não foi possível medir o tamanho das tabelas", {
      motivo: erro instanceof Error ? erro.message : "desconhecido",
    });
    return [];
  }
}

function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const unidades = ["KB", "MB", "GB", "TB"];
  let valor = bytes / 1024;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024;
    indice += 1;
  }
  // `noUncheckedIndexedAccess`: o índice está preso ao tamanho do array pelo
  // laço, mas o compilador não sabe disso — daí o fallback.
  return `${valor.toFixed(1)} ${unidades[indice] ?? "B"}`;
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
