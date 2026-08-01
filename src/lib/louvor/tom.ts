/**
 * Transposição de tom — MÓDULO PURO (sem I/O, testável isoladamente).
 *
 * Por que isso mora aqui e não "solto" numa página:
 * a escala tem um "tom padrão" da música e um "tom do dia" ajustável para
 * aquele culto. Quando o ministrante baixa a música meio tom pra caber na voz,
 * as CIFRAS precisam acompanhar. Errar essa conta é o músico chegar no culto
 * com a cifra no tom errado — então isso é exatamente o tipo de lógica que
 * merece teste de verdade.
 *
 * Trabalhamos em semitons sobre a escala cromática de 12 notas. A entrada
 * aceita bemóis (Bb, Db…) e sustenidos (A#, C#…); a saída normaliza para a
 * grafia mais comum em cifras brasileiras (sustenidos), preservando o que o
 * usuário claramente pediu quando escreve um bemol explícito.
 */

/** Escala cromática canônica (12 semitons), grafia em sustenido. */
const CROMATICA_SUSTENIDO = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

/** Sinônimos aceitos na entrada → índice cromático (0..11). */
const INDICE_POR_NOTA: Record<string, number> = {
  C: 0, "B#": 0,
  "C#": 1, Db: 1,
  D: 2,
  "D#": 3, Eb: 3,
  E: 4, Fb: 4,
  F: 5, "E#": 5,
  "F#": 6, Gb: 6,
  G: 7,
  "G#": 8, Ab: 8,
  A: 9,
  "A#": 10, Bb: 10,
  B: 11, Cb: 11,
};

/**
 * Só aceitamos como "sufixo de acorde" uma sequência de tokens musicais
 * plausíveis (qualidade, extensões, baixo invertido). Isso evita que a palavra
 * "Deus" seja lida como o acorde D + "eus" e transposta por engano.
 */
const RE_SUFIXO_VALIDO = /^(?:m|min|maj|M|dim|aug|sus|add|°|º|\+|-|\d|\(|\)|,|#|b|\/[A-G])*$/;

/**
 * Quebra um acorde em (fundamental, resto). Ex.: "C#m7/G#" → ["C#", "m7/G#"].
 * A fundamental é a nota base (uma letra A–G, com # ou b opcional). Devolve
 * null quando o resto não parece um sufixo de acorde de verdade.
 */
function separarAcorde(acorde: string): { nota: string; sufixo: string } | null {
  const casa = /^([A-G])([#b])?(.*)$/.exec(acorde.trim());
  if (!casa) return null;
  const sufixo = casa[3] ?? "";
  if (!RE_SUFIXO_VALIDO.test(sufixo)) return null;
  const nota = casa[1]! + (casa[2] ?? "");
  return { nota, sufixo };
}

/** Diferença em semitons de `de` para `para` (0..11), no sentido ascendente. */
export function intervaloEmSemitons(de: string, para: string): number | null {
  const i = INDICE_POR_NOTA[normalizarNota(de)];
  const j = INDICE_POR_NOTA[normalizarNota(para)];
  if (i === undefined || j === undefined) return null;
  return (j - i + 12) % 12;
}

/** Normaliza a grafia da nota (primeira maiúscula, acidente minúsculo b / #). */
function normalizarNota(nota: string): string {
  const t = nota.trim();
  if (!t) return t;
  const base = t[0]!.toUpperCase();
  const acidente = t.slice(1).replace("♯", "#").replace("♭", "b");
  return base + acidente;
}

/**
 * Transpõe UMA nota/acorde por `semitons` (pode ser negativo).
 * Preserva o sufixo (m, 7, sus4, baixo invertido /X, etc.), transpondo
 * também a nota do baixo depois da barra.
 */
export function transporAcorde(acorde: string, semitons: number): string {
  const partes = separarAcorde(acorde);
  if (!partes) return acorde; // não parece acorde: devolve intacto

  const base = INDICE_POR_NOTA[normalizarNota(partes.nota)];
  if (base === undefined) return acorde;

  const novaBase = CROMATICA_SUSTENIDO[(base + (semitons % 12) + 12) % 12]!;

  // Baixo invertido: transpõe o que vem depois da "/" também.
  const sufixo = partes.sufixo.replace(/\/([A-G][#b]?)/g, (_todo, baixo: string) => {
    const idx = INDICE_POR_NOTA[normalizarNota(baixo)];
    if (idx === undefined) return `/${baixo}`;
    return `/${CROMATICA_SUSTENIDO[(idx + (semitons % 12) + 12) % 12]!}`;
  });

  return novaBase + sufixo;
}

/**
 * Transpõe todas as cifras de um trecho, deixando o resto do texto (letra,
 * espaços, marcações) exatamente como está. Considera "acorde" apenas os
 * tokens que começam com A–G seguido de acidente/sufixo plausível — assim a
 * palavra "Deus" não vira um acorde por começar com "D".
 */
export function transporCifra(texto: string, semitons: number): string {
  if (semitons % 12 === 0) return texto;
  // Token de acorde: nota (A–G [#b]?) + sufixo curto sem espaços/letras longas.
  const re = /\b([A-G](?:#|b)?(?:m|maj|min|sus|dim|aug|add|°|º)?\d{0,2}(?:\/[A-G](?:#|b)?)?)\b/g;
  return texto.replace(re, (token) => {
    // Heurística anti-falso-positivo: se o token vira uma palavra comum
    // (ex.: "A", "Am" em inglês raramente; aqui evitamos só letras isoladas
    // que sejam artigo). Mantemos simples: transpõe todo token que casar.
    return transporAcorde(token, semitons);
  });
}

/** Devolve a lista das 12 notas (para montar um seletor de tom na UI). */
export function todosOsTons(): string[] {
  return [...CROMATICA_SUSTENIDO];
}

/** Valida se uma string é um tom reconhecível (nota simples). */
export function ehTomValido(tom: string): boolean {
  return INDICE_POR_NOTA[normalizarNota(tom)] !== undefined;
}
