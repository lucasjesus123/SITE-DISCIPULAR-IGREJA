/**
 * Estado de carregamento do site público.
 *
 * Toda página do site é `force-dynamic` e resolve o tenant pelo hostname antes
 * de qualquer consulta — na pior das hipóteses são 6 idas ao banco antes do
 * primeiro byte. Sem este arquivo, o navegador fica na página anterior enquanto
 * isso acontece, e o visitante que clicou em "Células" acha que o link está
 * quebrado e clica de novo. Cada clique repetido é outra rodada de consultas
 * na mesma VPS que atende as outras igrejas.
 *
 * Ele imita o esqueleto editorial (faixa escura com respiro, título largo,
 * três cartões) para que a troca pelo conteúdo real não empurre a página.
 *
 * Estático de propósito: nada de estado, nada de dado, nada de animação de
 * brilho. Ele aparece exatamente quando ainda não há dado nenhum, e uma
 * animação em vinte elementos custa bateria no celular de quem está no ponto
 * de ônibus.
 */
export default function CarregandoSite() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <section className="section theme-dark" aria-hidden="true">
        <div className="container">
          <div style={barra("11rem", ".7rem")} />
          <div style={{ ...barra("min(85%, 40rem)", "clamp(2.6rem, 6vw, 4.4rem)"), marginTop: "1.8rem" }} />
          <div style={{ ...barra("min(70%, 34rem)", "1.1rem"), marginTop: "1.8rem" }} />
          <div style={{ ...barra("min(52%, 26rem)", "1.1rem"), marginTop: ".7rem" }} />
        </div>
      </section>

      <section className="section theme-light" aria-hidden="true">
        <div className="container">
          <div style={barra("9rem", ".7rem")} />
          <div style={{ ...barra("min(60%, 30rem)", "2.4rem"), marginTop: "1.6rem" }} />

          <div className="grid cols-3" style={{ marginTop: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            {[0, 1, 2].map((i) => (
              <div className="card" key={i}>
                <div style={barra("30%", ".7rem")} />
                <div style={{ ...barra("75%", "1.7rem"), marginTop: ".6rem" }} />
                <div style={{ ...barra("100%", ".9rem"), marginTop: "1rem" }} />
                <div style={{ ...barra("88%", ".9rem"), marginTop: ".5rem" }} />
                <div style={{ ...barra("64%", ".9rem"), marginTop: ".5rem" }} />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Blocos com `currentColor` e opacidade baixa: assim o esqueleto herda o
 * contraste certo tanto na seção escura quanto na clara, sem precisar de uma
 * cor fixa que ficaria invisível numa das duas.
 */
function barra(largura: string, altura: string): React.CSSProperties {
  return {
    width: largura,
    height: altura,
    maxWidth: "100%",
    borderRadius: "var(--radius)",
    background: "currentColor",
    opacity: 0.1,
  };
}
