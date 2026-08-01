/**
 * Geometria das "ondas de seda" do login — PURA e determinística (sem random,
 * sem Date), por isso testável. Gera os paths SVG que o componente FundoOndas
 * apenas renderiza.
 */

export const LARGURA_ONDA = 1200; // uma volta; o traço vai até 2×LARGURA p/ loop

/** Path de uma senoide de x=0 até 2×LARGURA (desliza sem emenda). */
export function linha(baseY: number, amp: number, wl: number, fase: number): string {
  let d = "";
  for (let x = 0; x <= 2 * LARGURA_ONDA; x += 10) {
    const y = baseY + amp * Math.sin((2 * Math.PI * x) / wl + fase);
    d += `${x === 0 ? "M" : "L"}${x} ${y.toFixed(1)} `;
  }
  return d.trim();
}

export type LinhaOnda = { d: string; o: number };

/** Um feixe de `qtd` linhas paralelas com leve torção de fase. */
export function feixe(qtd: number, centro: number, espalhamento: number, amp: number, wl: number, torcao: number): LinhaOnda[] {
  const linhas: LinhaOnda[] = [];
  for (let i = 0; i < qtd; i++) {
    const t = qtd > 1 ? i / (qtd - 1) : 0.5;
    const baseY = centro + (t - 0.5) * espalhamento;
    const o = 0.22 + 0.5 * Math.sin(Math.PI * t);
    linhas.push({ d: linha(baseY, amp, wl, i * torcao), o });
  }
  return linhas;
}
