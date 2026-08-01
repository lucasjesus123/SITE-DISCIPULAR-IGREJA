import { exigirPermissao } from "@/lib/auth/rbac";
import { garantirMinisterioLouvor, carregarRepertorio } from "@/lib/services/louvor";
import { SubnavLouvor } from "@/components/painel/louvor/SubnavLouvor";
import { FormNovaMusica } from "@/components/painel/louvor/FormNovaMusica";
import { Transpositor } from "@/components/painel/louvor/Transpositor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Louvor · Repertório" };

export default async function PaginaRepertorioLouvor() {
  const ctx = await exigirPermissao("louvor.gerenciar");
  const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);
  const musicas = await carregarRepertorio(ctx.db, ministerioId);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Repertório & Cifras</h1>
          <p className="painel__sub">Biblioteca de músicas do ministério. Cole a cifra e transponha o tom na hora.</p>
        </div>
      </div>

      <SubnavLouvor />

      <section className="secao-painel" style={{ marginBottom: "1.4rem" }}>
        <h2 className="secao-painel__titulo">Nova música</h2>
        <FormNovaMusica />
      </section>

      {musicas.length === 0 ? (
        <div className="vazio">Nenhuma música no repertório ainda.</div>
      ) : (
        <div className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
          {musicas.map((m) => (
            <section key={m.id} className="lvr-musica">
              <header className="lvr-musica__cab">
                <div>
                  <h3 className="lvr-musica__titulo">{m.titulo}</h3>
                  {m.artista && <p className="lvr-nota">{m.artista}</p>}
                </div>
                {m.tomPadrao && <span className="lvr-tom lvr-tom--grande">{m.tomPadrao}</span>}
              </header>
              <div className="lvr-musica__links">
                {m.linkCifra && <a href={m.linkCifra} target="_blank" rel="noopener noreferrer" className="lvr-link">Cifra ↗</a>}
                {m.linkVideo && <a href={m.linkVideo} target="_blank" rel="noopener noreferrer" className="lvr-link">Vídeo ↗</a>}
                {m.linkLetra && <a href={m.linkLetra} target="_blank" rel="noopener noreferrer" className="lvr-link">Letra ↗</a>}
              </div>
              {m.cifra && <Transpositor cifra={m.cifra} tomPadrao={m.tomPadrao} />}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
