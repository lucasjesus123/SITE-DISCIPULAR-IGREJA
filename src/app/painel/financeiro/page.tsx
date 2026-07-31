import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { formatarCentavos } from "@/lib/financeiro/dinheiro";
import {
  ativoPorCongregacao,
  consolidadoAtivo,
  saldosDasContas,
  totaisResultado,
} from "@/lib/financeiro/saldos";
import { BotaoEstorno } from "@/components/painel/financeiro/BotaoEstorno";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financeiro" };

const FMT_DATA = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PaginaFinanceiro() {
  const ctx = await exigirPermissao("financeiro.gerenciar");

  const [saldos, campi, lancamentos] = await Promise.all([
    saldosDasContas(ctx.db),
    ctx.db.campus.findMany({ select: { id: true, nome: true }, orderBy: { ordem: "asc" } }),
    ctx.db.lancamentoFinanceiro.findMany({
      orderBy: { criadoEm: "desc" },
      take: 15,
      select: {
        id: true, historico: true, campusId: true, valorCentavos: true,
        dataCaixa: true, estornado: true, estornoDeId: true,
      },
    }),
  ]);

  const nomeCampus = new Map(campi.map((c) => [c.id, c.nome]));
  const consolidado = consolidadoAtivo(saldos);
  const porCong = ativoPorCongregacao(saldos);
  const { receitas, despesas } = totaisResultado(saldos);
  const contasAtivo = saldos.filter((s) => s.natureza === "ATIVO");
  const contasResultado = saldos.filter((s) => s.natureza === "RECEITA" || s.natureza === "DESPESA");

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Financeiro</h1>
          <p className="painel__sub">Caixa consolidado da matriz e por congregação, em tempo real.</p>
        </div>
        <Link href="/painel/financeiro/novo" className="btn">+ Novo lançamento</Link>
      </div>

      {/* Cartões-resumo */}
      <section style={{ marginBottom: "2rem" }}>
        <div className="cartoes">
          <div className="cartao cartao--destaque">
            <span className="cartao__rotulo">Consolidado (matriz)</span>
            <span className="cartao__valor">{formatarCentavos(consolidado)}</span>
            <span className="cartao__nota">Soma de todas as contas de caixa/banco/pix</span>
          </div>
          <div className="cartao">
            <span className="cartao__rotulo">Entradas (receitas)</span>
            <span className="cartao__valor">{formatarCentavos(receitas)}</span>
            <span className="cartao__nota">Dízimos, ofertas, doações</span>
          </div>
          <div className="cartao">
            <span className="cartao__rotulo">Saídas (despesas)</span>
            <span className="cartao__valor">{formatarCentavos(despesas)}</span>
            <span className="cartao__nota">Aluguel, missões, salários…</span>
          </div>
        </div>
      </section>

      {/* Por congregação */}
      {porCong.size > 0 && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Por congregação</h2>
          <div className="cartoes">
            {[...porCong.entries()].map(([campusId, saldo]) => (
              <div className="cartao" key={campusId}>
                <span className="cartao__rotulo">{nomeCampus.get(campusId) ?? "Congregação"}</span>
                <span className="cartao__valor">{formatarCentavos(saldo)}</span>
                <span className="cartao__nota">Em caixa</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Saldos por conta */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Saldos por conta</h2>
        {contasAtivo.length === 0 ? (
          <div className="vazio">Nenhuma conta cadastrada ainda.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Código</th><th>Conta</th><th>Congregação</th><th style={{ textAlign: "right" }}>Saldo</th></tr>
              </thead>
              <tbody>
                {contasAtivo.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{c.codigo}</td>
                    <td style={{ fontWeight: 600 }}>{c.nome}</td>
                    <td style={{ color: "var(--pnl-text-dim)" }}>{c.campusId ? nomeCampus.get(c.campusId) ?? "—" : "Matriz"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatarCentavos(c.saldoCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Resultado (receitas x despesas) */}
      {contasResultado.length > 0 && (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Entradas e saídas por categoria</h2>
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Categoria</th><th>Tipo</th><th style={{ textAlign: "right" }}>Total</th></tr>
              </thead>
              <tbody>
                {contasResultado.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.nome}</td>
                    <td>
                      <span className={`etiqueta etiqueta--${c.natureza === "RECEITA" ? "novo" : "urgente"}`}>
                        {c.natureza === "RECEITA" ? "Entrada" : "Saída"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatarCentavos(c.saldoCentavos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Últimos lançamentos */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Últimos lançamentos</h2>
        {lancamentos.length === 0 ? (
          <div className="vazio">Nenhum lançamento ainda. Comece em “Novo lançamento”.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr><th>Data</th><th>Histórico</th><th>Congregação</th><th style={{ textAlign: "right" }}>Valor</th><th></th></tr>
              </thead>
              <tbody>
                {lancamentos.map((l) => (
                  <tr key={l.id} style={l.estornado ? { opacity: 0.55 } : undefined}>
                    <td style={{ whiteSpace: "nowrap" }}>{FMT_DATA.format(l.dataCaixa)}</td>
                    <td>
                      {l.historico}
                      {l.estornado && <span className="etiqueta etiqueta--concluido" style={{ marginLeft: ".5rem" }}>Estornado</span>}
                      {l.estornoDeId && <span className="etiqueta etiqueta--andamento" style={{ marginLeft: ".5rem" }}>Estorno</span>}
                    </td>
                    <td style={{ color: "var(--pnl-text-dim)" }}>{nomeCampus.get(l.campusId) ?? "—"}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{formatarCentavos(l.valorCentavos)}</td>
                    <td style={{ textAlign: "right" }}>
                      {!l.estornado && !l.estornoDeId && <BotaoEstorno lancamentoId={l.id} />}
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
