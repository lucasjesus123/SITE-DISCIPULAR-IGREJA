import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { Mascote } from "@/components/kids/Mascote";
import { FormCheckin } from "@/components/kids/FormCheckin";
import { CartaoEmSala } from "@/components/kids/CartaoEmSala";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kids" };

export default async function PaginaKids() {
  const ctx = await exigirPermissao("kids.gerenciar");

  const hoje = new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())}T00:00:00.000Z`);

  const [salas, emSala] = await Promise.all([
    ctx.db.salaKids.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
    ctx.db.sessaoSalaKids.findMany({
      where: { status: "EM_SALA", cultoData: hoje },
      orderBy: { checkinEm: "desc" },
      select: {
        id: true,
        sala: { select: { nome: true } },
        crianca: {
          select: {
            id: true, nome: true, alergias: true, restricoes: true,
            responsaveis: { select: { responsavelUserId: true, nome: true, autorizadoRetirar: true } },
          },
        },
      },
    }),
  ]);

  const emSalaIds = new Set(emSala.map((s) => s.crianca.id));
  const criancas = await ctx.db.crianca.findMany({
    where: { excluidoEm: null, id: { notIn: [...emSalaIds] } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, salaPadraoId: true },
  });

  return (
    <>
      <div className="painel__topo">
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Mascote tamanho={64} />
          <div>
            <h1 className="painel__titulo">Kids</h1>
            <p className="painel__sub">Check-in e check-out seguro do Ministério Infantil.</p>
          </div>
        </div>
        <Link href="/painel/kids/criancas" className="btn btn--ghost">Crianças & salas</Link>
      </div>

      <div className="split" style={{ alignItems: "start" }}>
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Check-in</h2>
          {salas.length === 0 ? (
            <div className="vazio">Crie uma sala primeiro (em “Crianças & salas”).</div>
          ) : criancas.length === 0 ? (
            <div className="vazio">Nenhuma criança disponível para check-in.</div>
          ) : (
            <FormCheckin criancas={criancas} salas={salas} />
          )}
        </section>

        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Em sala agora ({emSala.length})</h2>
          {emSala.length === 0 ? (
            <div className="vazio">Nenhuma criança em sala neste culto.</div>
          ) : (
            <div className="kids-grid">
              {emSala.map((s) => (
                <CartaoEmSala
                  key={s.id}
                  sessaoId={s.id}
                  nome={s.crianca.nome}
                  sala={s.sala.nome}
                  alergias={s.crianca.alergias}
                  restricoes={s.crianca.restricoes}
                  responsaveis={s.crianca.responsaveis}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
