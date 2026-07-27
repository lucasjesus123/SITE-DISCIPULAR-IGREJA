import Link from "next/link";
import { exigirAcessoTenant, filtroDeEscopo } from "@/lib/auth/rbac";
import { contadoresTriagem } from "@/lib/services/submissoes";
import { estadoAoVivo } from "@/lib/youtube/live";

export const dynamic = "force-dynamic";

/**
 * Dashboard.
 *
 * A pergunta que ele responde é "o que precisa da minha atenção hoje?", não
 * "quantos membros temos ao todo". Por isso os cartões priorizam FILAS
 * (coisas esperando alguém) sobre TOTAIS (vaidade).
 *
 * DESEMPENHO
 * Todas as contagens vão num único `Promise.all`. Serialmente seriam ~8 idas
 * ao banco em sequência; com 90 pessoas abrindo o painel de manhã, isso é a
 * diferença entre 200ms e 1,5s.
 */
export default async function PainelInicio() {
  const ctx = await exigirAcessoTenant();
  const escopo = filtroDeEscopo(ctx);

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    contadores,
    totalMembros,
    totalVisitantes,
    novosNoMes,
    oracoesUrgentes,
    celulasAtivas,
    proximosBatismos,
    ultimasSubmissoes,
    live,
  ] = await Promise.all([
    contadoresTriagem(ctx.tenant.id),
    ctx.db.pessoa.count({ where: { status: "MEMBRO", excluidoEm: null, ...escopo } }),
    ctx.db.pessoa.count({
      where: { status: { in: ["VISITANTE", "EM_ACOMPANHAMENTO"] }, excluidoEm: null, ...escopo },
    }),
    ctx.db.pessoa.count({ where: { criadoEm: { gte: inicioMes }, excluidoEm: null, ...escopo } }),
    ctx.pode("oracao.ler")
      ? ctx.db.pedidoOracao.count({ where: { urgente: true, status: { in: ["RECEBIDO", "ORANDO"] } } })
      : Promise.resolve(0),
    ctx.db.celula.count({ where: { ativa: true } }),
    ctx.pode("batismos.ler")
      ? ctx.db.solicitacaoBatismo.findMany({
          where: { status: { in: ["APROVADO", "AGENDADO"] }, dataBatismo: { gte: new Date() } },
          orderBy: { dataBatismo: "asc" },
          select: { id: true, nome: true, dataBatismo: true, status: true },
          take: 5,
        })
      : Promise.resolve([]),
    ctx.pode("submissoes.ler")
      ? ctx.db.submissao.findMany({
          where: { status: { in: ["NOVO", "EM_ANALISE"] } },
          orderBy: { criadoEm: "desc" },
          select: { id: true, tipo: true, nome: true, criadoEm: true, status: true },
          take: 8,
        })
      : Promise.resolve([]),
    estadoAoVivo(ctx.tenant.id),
  ]);

  const crescimento30d = await ctx.db.pessoa.count({
    where: { criadoEm: { gte: trintaDias }, excluidoEm: null, ...escopo },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Olá, {primeiroNome(ctx.sessao.nome)}.</h1>
          <p className="painel__sub">
            {contadores.total > 0
              ? `Você tem ${contadores.total} ${contadores.total === 1 ? "item" : "itens"} esperando atendimento.`
              : "Nenhuma pendência na caixa de entrada. Bom trabalho."}
          </p>
        </div>

        {live.aoVivo && (
          <Link href="/painel/ao-vivo" className="etiqueta etiqueta--urgente" style={{ alignSelf: "center" }}>
            <span className="ao-vivo__ponto" aria-hidden="true" style={{ background: "#cf222e" }} />
            Transmissão ao vivo
          </Link>
        )}
      </div>

      {/* ------------------------------------------------------------- FILAS */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div className="cartoes">
          {ctx.pode("submissoes.ler") && (
            <CartaoLink
              href="/painel/caixa-entrada"
              rotulo="Caixa de entrada"
              valor={contadores.total}
              nota="Cadastros e mensagens aguardando triagem"
              destaque={contadores.total > 0}
            />
          )}
          {ctx.pode("oracao.ler") && (
            <CartaoLink
              href="/painel/oracao"
              rotulo="Pedidos de oração"
              valor={contadores.oracoesPendentes}
              nota={
                oracoesUrgentes > 0
                  ? `${oracoesUrgentes} marcado${oracoesUrgentes === 1 ? "" : "s"} como urgente`
                  : "Aguardando intercessão"
              }
              destaque={oracoesUrgentes > 0}
            />
          )}
          {ctx.pode("batismos.ler") && (
            <CartaoLink
              href="/painel/batismos"
              rotulo="Batismos"
              valor={contadores.batismosPendentes}
              nota="Solicitações em andamento"
            />
          )}
        </div>
      </section>

      {/* ----------------------------------------------------------- NÚMEROS */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 className="painel__grupo" style={{ color: "var(--graphite-faint)", marginBottom: ".8rem" }}>
          A igreja em números
        </h2>
        <div className="cartoes">
          <Cartao rotulo="Membros" valor={totalMembros} nota="Com vínculo ativo" />
          <Cartao rotulo="Visitantes" valor={totalVisitantes} nota="Em acompanhamento" />
          <Cartao rotulo="Novos neste mês" valor={novosNoMes} nota={`${crescimento30d} nos últimos 30 dias`} />
          <Cartao rotulo="Células ativas" valor={celulasAtivas} nota="Reunindo semanalmente" />
        </div>
      </section>

      {/* --------------------------------------------------- CHEGOU AGORA */}
      {ctx.pode("submissoes.ler") && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Chegou agora</h2>
          <p className="secao-painel__desc">
            Últimos cadastros e mensagens vindos do site e do aplicativo.
          </p>

          {ultimasSubmissoes.length === 0 ? (
            <div className="vazio">Nada novo por aqui.</div>
          ) : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Quando</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimasSubmissoes.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/painel/caixa-entrada/${s.id}`} style={{ fontWeight: 600 }}>
                          {s.nome}
                        </Link>
                      </td>
                      <td>{rotuloTipo(s.tipo)}</td>
                      <td>{tempoRelativo(s.criadoEm)}</td>
                      <td>
                        <span className={`etiqueta etiqueta--${s.status === "NOVO" ? "novo" : "andamento"}`}>
                          {s.status === "NOVO" ? "Novo" : "Em análise"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------ PRÓXIMOS BATISMOS */}
      {ctx.pode("batismos.ler") && proximosBatismos.length > 0 && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Próximos batismos</h2>
          <p className="secao-painel__desc">Pessoas com data já definida.</p>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Data</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {proximosBatismos.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/painel/batismos/${b.id}`} style={{ fontWeight: 600 }}>
                        {b.nome}
                      </Link>
                    </td>
                    <td>
                      {b.dataBatismo
                        ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(b.dataBatismo)
                        : "—"}
                    </td>
                    <td>
                      <span className="etiqueta etiqueta--andamento">
                        {b.status === "AGENDADO" ? "Agendado" : "Aprovado"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function Cartao({ rotulo, valor, nota }: { rotulo: string; valor: number; nota: string }) {
  return (
    <div className="cartao">
      <span className="cartao__rotulo">{rotulo}</span>
      <span className="cartao__valor">{valor.toLocaleString("pt-BR")}</span>
      <span className="cartao__nota">{nota}</span>
    </div>
  );
}

function CartaoLink({
  href,
  rotulo,
  valor,
  nota,
  destaque,
}: {
  href: string;
  rotulo: string;
  valor: number;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <Link href={href} className={`cartao${destaque ? " cartao--destaque" : ""}`}>
      <span className="cartao__rotulo">{rotulo}</span>
      <span className="cartao__valor">{valor.toLocaleString("pt-BR")}</span>
      <span className="cartao__nota">{nota}</span>
    </Link>
  );
}

function primeiroNome(nome: string): string {
  return nome.split(" ")[0] ?? nome;
}

export function rotuloTipo(tipo: string): string {
  const mapa: Record<string, string> = {
    VISITANTE: "Visitante",
    NOVO_MEMBRO: "Novo membro",
    BATISMO: "Batismo",
    PEDIDO_ORACAO: "Oração",
    CONTATO: "Contato",
    INSCRICAO_CURSO: "Inscrição",
    QUERO_CELULA: "Célula",
    ACONSELHAMENTO: "Aconselhamento",
  };
  return mapa[tipo] ?? tipo;
}

export function tempoRelativo(data: Date): string {
  const segundos = Math.floor((Date.now() - data.getTime()) / 1000);
  if (segundos < 60) return "agora";
  if (segundos < 3600) return `${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  if (dias < 30) return `${dias} d`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(data);
}
