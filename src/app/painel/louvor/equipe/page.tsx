import { exigirPermissao } from "@/lib/auth/rbac";
import { garantirMinisterioLouvor, carregarEquipe, carregarFuncoes } from "@/lib/services/louvor";
import { SubnavLouvor } from "@/components/painel/louvor/SubnavLouvor";
import { FormNovoMembro } from "@/components/painel/louvor/FormNovoMembro";
import { BotaoRemoverMembro } from "@/components/painel/louvor/AcoesEscala";

export const dynamic = "force-dynamic";
export const metadata = { title: "Louvor · Equipe" };

export default async function PaginaEquipeLouvor() {
  const ctx = await exigirPermissao("louvor.gerenciar");
  const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

  const [equipe, funcoes] = await Promise.all([
    carregarEquipe(ctx.db, ministerioId),
    carregarFuncoes(ctx.db, ministerioId),
  ]);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Equipe do Louvor</h1>
          <p className="painel__sub">Cadastre os integrantes e as funções que cada um exerce.</p>
        </div>
      </div>

      <SubnavLouvor />

      <div className="split" style={{ alignItems: "start" }}>
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Novo integrante</h2>
          <FormNovoMembro funcoes={funcoes} />
        </section>

        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Integrantes ({equipe.length})</h2>
          {equipe.length === 0 ? (
            <div className="vazio">Nenhum integrante ainda.</div>
          ) : (
            <div className="stack" style={{ "--flow": ".6rem" } as React.CSSProperties}>
              {equipe.map((m) => (
                <div key={m.id} className="lvr-membro">
                  <div>
                    <strong>{m.nome}</strong>
                    {m.ehLider && <span className="lvr-tag-lider">Líder</span>}
                    <div className="lvr-membro__funcoes">
                      {m.funcoes.length === 0
                        ? <span className="lvr-nota">sem função definida</span>
                        : m.funcoes.map((mf) => <span key={mf.funcao.id} className="lvr-chip">{mf.funcao.nome}</span>)}
                    </div>
                  </div>
                  <BotaoRemoverMembro membroId={m.id} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
