import { exigirPermissao, filtroDeEscopo } from "@/lib/auth/rbac";
import { ORDEM_JORNADA, ROTULO_ETAPA, etapaAnterior, proximaEtapa } from "@/lib/pessoas/jornada";
import { CartaoKanban } from "@/components/painel/CartaoKanban";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acompanhamento" };

const POR_COLUNA = 60;

export default async function PaginaAcompanhamento() {
  const ctx = await exigirPermissao("pessoas.ler");
  const escopo = filtroDeEscopo(ctx);
  const podeMover = ctx.pode("pessoas.editar");

  const pessoas = await ctx.db.pessoa.findMany({
    where: { excluidoEm: null, status: { in: ORDEM_JORNADA }, ...escopo },
    select: { id: true, nome: true, telefone: true, email: true, status: true },
    orderBy: { criadoEm: "desc" },
    take: POR_COLUNA * ORDEM_JORNADA.length,
  });

  const porEtapa = new Map(ORDEM_JORNADA.map((s) => [s, [] as typeof pessoas]));
  for (const p of pessoas) porEtapa.get(p.status)?.push(p);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Acompanhamento</h1>
          <p className="painel__sub">
            A jornada de cada pessoa — do visitante ao membro. {podeMover ? "Use as setas para avançar ou voltar." : ""}
          </p>
        </div>
      </div>

      <div className="kanban">
        {ORDEM_JORNADA.map((status) => {
          const lista = porEtapa.get(status) ?? [];
          return (
            <section className="kb-coluna" key={status} aria-label={ROTULO_ETAPA[status]}>
              <header className="kb-coluna__topo">
                <span>{ROTULO_ETAPA[status]}</span>
                <span className="kb-coluna__contagem">{lista.length}</span>
              </header>
              <div className="kb-coluna__lista">
                {lista.length === 0 ? (
                  <p className="kb-vazio">Ninguém aqui.</p>
                ) : (
                  lista.map((p) =>
                    podeMover ? (
                      <CartaoKanban
                        key={p.id}
                        pessoa={{ id: p.id, nome: p.nome, telefone: p.telefone, contato: p.telefone ?? p.email }}
                        anterior={etapaAnterior(status)}
                        proxima={proximaEtapa(status)}
                      />
                    ) : (
                      <article className="kb-card" key={p.id}>
                        <p className="kb-card__nome">{p.nome}</p>
                        {(p.telefone ?? p.email) && <p className="kb-card__contato">{p.telefone ?? p.email}</p>}
                      </article>
                    ),
                  )
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
