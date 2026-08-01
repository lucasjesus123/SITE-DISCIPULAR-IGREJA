import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { carregarEquipe, carregarFuncoes, carregarRepertorio } from "@/lib/services/louvor";
import { nomeDoMes } from "@/lib/louvor/escala";
import { resumirConfirmacoes, rotuloStatus, type StatusEscalado } from "@/lib/louvor/confirmacao";
import { SubnavLouvor } from "@/components/painel/louvor/SubnavLouvor";
import { FormNovoEvento } from "@/components/painel/louvor/FormNovoEvento";
import { FormEscalar } from "@/components/painel/louvor/FormEscalar";
import { FormMusicaEvento } from "@/components/painel/louvor/FormMusicaEvento";
import { BotaoPublicar, BotaoRemoverEscalado } from "@/components/painel/louvor/AcoesEscala";

export const dynamic = "force-dynamic";
export const metadata = { title: "Louvor · Escala" };

const PAPEL_ROTULO: Record<string, string> = {
  MINISTRANTE: "Ministrante", INSTRUMENTISTA: "Instrumentista", VOCAL: "Vocal", MULTIMIDIA: "Multimídia",
};

export default async function PaginaEscalaLouvor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("louvor.gerenciar");

  const escala = await ctx.db.escalaMinisterio.findFirst({
    where: { id },
    include: {
      eventos: {
        orderBy: [{ data: "asc" }, { hora: "asc" }],
        include: {
          escalados: {
            include: {
              membro: { select: { id: true, nome: true } },
              funcao: { select: { id: true, nome: true } },
            },
          },
          musicas: {
            orderBy: { ordem: "asc" },
            include: { musica: { select: { id: true, titulo: true, artista: true, tomPadrao: true } } },
          },
        },
      },
    },
  });
  if (!escala) notFound();

  const [equipe, funcoes, repertorio] = await Promise.all([
    carregarEquipe(ctx.db, escala.ministerioId),
    carregarFuncoes(ctx.db, escala.ministerioId),
    carregarRepertorio(ctx.db, escala.ministerioId),
  ]);

  const membrosSimples = equipe.map((m) => ({ id: m.id, nome: m.nome }));
  const musicasSimples = repertorio.map((m) => ({ id: m.id, titulo: m.titulo }));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo" style={{ textTransform: "capitalize" }}>
            Escala · {nomeDoMes(escala.mes)} / {escala.ano}
          </h1>
          <p className="painel__sub">Monte os cultos, escale a equipe por função e defina o repertório e o dress code.</p>
        </div>
        <BotaoPublicar escalaId={escala.id} publicada={escala.status === "PUBLICADA"} />
      </div>

      <SubnavLouvor />

      <section className="secao-painel" style={{ marginBottom: "1.4rem" }}>
        <h2 className="secao-painel__titulo">Adicionar evento</h2>
        <FormNovoEvento escalaId={escala.id} />
      </section>

      {escala.eventos.length === 0 ? (
        <div className="vazio">Nenhum evento nesta escala ainda. Adicione o primeiro culto acima.</div>
      ) : (
        <div className="stack" style={{ "--flow": "1.4rem" } as React.CSSProperties}>
          {escala.eventos.map((ev) => {
            const resumo = resumirConfirmacoes(ev.escalados.map((e) => e.status as StatusEscalado));
            const data = new Date(ev.data).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
            return (
              <section key={ev.id} className="lvr-evento">
                <header className="lvr-evento__cab">
                  <div>
                    <span className="lvr-evento__tipo">{ev.tipo}</span>
                    <h3 className="lvr-evento__titulo">{ev.titulo}</h3>
                    <p className="lvr-evento__quando">{data} · {ev.hora}</p>
                  </div>
                  <span className={`lvr-selo lvr-selo--${resumo.situacao}`}>{resumo.rotulo}</span>
                </header>

                {ev.dressCodeTexto && (
                  <div className="lvr-dresscode">
                    <span className="lvr-dresscode__rot">Dress code</span>
                    <strong>{ev.dressCodeTexto}</strong>
                  </div>
                )}

                <div className="lvr-grid2">
                  {/* Escalados */}
                  <div>
                    <p className="lvr-sub">Quem serve</p>
                    {ev.escalados.length === 0 ? (
                      <p className="lvr-nota">Ninguém escalado.</p>
                    ) : (
                      <ul className="lvr-escalados">
                        {ev.escalados.map((e) => (
                          <li key={e.id} className="lvr-escalado">
                            <div>
                              <strong>{e.membro.nome}</strong>
                              <span className="lvr-escalado__meta">
                                {e.funcao?.nome ?? PAPEL_ROTULO[e.papel]} ·{" "}
                                <span className={`lvr-status lvr-status--${e.status.toLowerCase()}`}>{rotuloStatus(e.status as StatusEscalado)}</span>
                              </span>
                            </div>
                            <BotaoRemoverEscalado escaladoId={e.id} escalaId={escala.id} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <FormEscalar eventoId={ev.id} membros={membrosSimples} funcoes={funcoes} />
                  </div>

                  {/* Repertório */}
                  <div>
                    <p className="lvr-sub">Repertório</p>
                    {ev.musicas.length === 0 ? (
                      <p className="lvr-nota">Sem músicas ainda.</p>
                    ) : (
                      <ol className="lvr-repertorio">
                        {ev.musicas.map((em) => (
                          <li key={em.id}>
                            <strong>{em.musica.titulo}</strong>
                            {em.musica.artista && <span className="lvr-nota"> · {em.musica.artista}</span>}
                            <span className="lvr-tom">{em.tomDoDia ?? em.musica.tomPadrao ?? "—"}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <FormMusicaEvento eventoId={ev.id} musicas={musicasSimples} />
                  </div>
                </div>

                {ev.observacoes && <p className="lvr-obs">{ev.observacoes}</p>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
