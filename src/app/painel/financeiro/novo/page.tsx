import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioMovimento } from "@/components/painel/financeiro/FormularioMovimento";
import { FormularioTransferencia } from "@/components/painel/financeiro/FormularioTransferencia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo lançamento" };

export default async function NovoLancamento() {
  const ctx = await exigirPermissao("financeiro.gerenciar");

  const [campi, contas] = await Promise.all([
    ctx.db.campus.findMany({ select: { id: true, nome: true }, orderBy: { ordem: "asc" } }),
    ctx.db.contaContabil.findMany({
      where: { ativo: true },
      select: { id: true, nome: true, natureza: true, campusId: true },
      orderBy: [{ ordem: "asc" }, { codigo: "asc" }],
    }),
  ]);

  const contasFisicas = contas.filter((c) => c.natureza === "ATIVO").map((c) => ({ id: c.id, nome: c.nome, campusId: c.campusId }));
  const receitas = contas.filter((c) => c.natureza === "RECEITA").map((c) => ({ id: c.id, nome: c.nome }));
  const despesas = contas.filter((c) => c.natureza === "DESPESA").map((c) => ({ id: c.id, nome: c.nome }));

  // Hoje em São Paulo, no formato YYYY-MM-DD para o <input type=date>.
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  const semContas = contasFisicas.length === 0;

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Novo lançamento</h1>
          <p className="painel__sub">Entrada, saída ou transferência entre contas.</p>
        </div>
        <Link href="/painel/financeiro" className="btn btn--ghost">← Voltar</Link>
      </div>

      {semContas ? (
        <div className="vazio">
          Nenhuma conta cadastrada. Cadastre as contas (Caixa, Banco, PIX) e as categorias
          (Dízimo, Oferta, Aluguel…) antes de lançar. (Os dados de demonstração já trazem um
          plano de contas de exemplo.)
        </div>
      ) : (
        <div className="split" style={{ alignItems: "start" }}>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Entrada / Saída</h2>
            <p className="secao-painel__desc">Dízimo, oferta, doação — ou uma despesa paga.</p>
            <FormularioMovimento
              campi={campi}
              contasFisicas={contasFisicas}
              receitas={receitas}
              despesas={despesas}
              hoje={hoje}
            />
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Transferência</h2>
            <p className="secao-painel__desc">Mover dinheiro entre contas (ex.: caixa → banco). Conserva o total.</p>
            <FormularioTransferencia campi={campi} contasFisicas={contasFisicas} hoje={hoje} />
          </section>
        </div>
      )}
    </>
  );
}
