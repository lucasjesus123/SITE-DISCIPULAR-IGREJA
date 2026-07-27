/**
 * Estado de carregamento do painel.
 *
 * Toda página sob /painel é `force-dynamic` e faz de 2 a 6 consultas ao banco
 * antes de renderizar. Sem este arquivo, o Next segura a navegação e a tela
 * anterior fica congelada — o usuário clica de novo, e cada clique repetido é
 * outra rodada de consultas. Um esqueleto imediato resolve a percepção e, de
 * quebra, reduz a carga que a impaciência gera no banco.
 *
 * É um Server Component estático de propósito: nada de estado, nada de dado.
 * Ele aparece justamente quando os dados ainda não existem.
 */
export default function CarregandoPainel() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>

      <div className="painel__topo">
        <div>
          <div style={barra("40%", "1.9rem")} />
          <div style={{ ...barra("62%", ".9rem"), marginTop: ".7rem" }} />
        </div>
      </div>

      <div className="cartoes" style={{ marginBottom: "2rem" }}>
        {[0, 1, 2].map((i) => (
          <div className="cartao" key={i} aria-hidden="true">
            <div style={barra("55%", ".7rem")} />
            <div style={{ ...barra("38%", "1.8rem"), marginTop: ".8rem" }} />
            <div style={{ ...barra("70%", ".7rem"), marginTop: ".8rem" }} />
          </div>
        ))}
      </div>

      <section className="secao-painel" aria-hidden="true">
        <div style={barra("28%", "1.1rem")} />
        <div style={{ display: "grid", gap: ".9rem", marginTop: "1.4rem" }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} style={barra(`${94 - i * 6}%`, "1.1rem")} />
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * Blocos cinzas com opacidade fixa em vez de animação de brilho.
 *
 * O painel roda em celular no meio do culto e em máquina modesta da secretaria;
 * uma animação em vinte elementos custa bateria e trava em hardware fraco, sem
 * comunicar nada além do que a forma já comunica.
 */
function barra(largura: string, altura: string): React.CSSProperties {
  return {
    width: largura,
    height: altura,
    borderRadius: "var(--radius, 6px)",
    background: "currentColor",
    opacity: 0.08,
  };
}
