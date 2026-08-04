/**
 * Conteúdo editável da home (ministérios e depoimentos) — PURO e testável.
 *
 * Guardado como JSON no SiteConfig de cada igreja. O parse é DEFENSIVO: JSON
 * inválido, tipo errado ou lista vazia caem no padrão — a home nunca quebra
 * nem fica vazia. A serialização descarta itens incompletos.
 */

export interface Ministerio {
  titulo: string;
  descricao: string;
  icone?: string; // caractere/emoji simples exibido no card
}

export interface Depoimento {
  texto: string;
  nome: string;
  papel: string;
}

export const MINISTERIOS_PADRAO: Ministerio[] = [
  { titulo: "Louvor", descricao: "Uma equipe que conduz a igreja à presença de Deus com excelência e coração.", icone: "♪" },
  { titulo: "Kids", descricao: "Um espaço seguro, lúdico e cheio de amor onde as crianças aprendem sobre Jesus.", icone: "☺" },
  { titulo: "Células", descricao: "Grupos pequenos nos lares para cultivar comunhão, cuidado e crescimento.", icone: "◎" },
];

export const DEPOIMENTOS_PADRAO: Depoimento[] = [
  { texto: "Cheguei quebrado e fui acolhido como filho. Hoje sirvo no louvor e minha família foi restaurada.", nome: "Rafael M.", papel: "Membro há 3 anos" },
  { texto: "Minha célula virou minha segunda casa. Encontrei amigos verdadeiros e um propósito.", nome: "Carla S.", papel: "Líder de célula" },
  { texto: "Meus filhos amam o Kids e pedem pra vir todo domingo. Que segurança de coração!", nome: "Juliana P.", papel: "Mãe e voluntária" },
];

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function comoArray(json: string | null | undefined): unknown[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function parseMinisterios(json: string | null | undefined): Ministerio[] {
  const itens = comoArray(json)
    .map((o) => {
      const r = o as Record<string, unknown>;
      return { titulo: texto(r.titulo), descricao: texto(r.descricao), icone: texto(r.icone) || undefined };
    })
    .filter((m) => m.titulo && m.descricao)
    .slice(0, 6);
  return itens.length > 0 ? itens : MINISTERIOS_PADRAO;
}

export function parseDepoimentos(json: string | null | undefined): Depoimento[] {
  const itens = comoArray(json)
    .map((o) => {
      const r = o as Record<string, unknown>;
      return { texto: texto(r.texto), nome: texto(r.nome), papel: texto(r.papel) };
    })
    .filter((d) => d.texto && d.nome)
    .slice(0, 6);
  return itens.length > 0 ? itens : DEPOIMENTOS_PADRAO;
}

/** Serializa descartando itens incompletos; devolve null se nada válido. */
export function serializarMinisterios(itens: { titulo?: string; descricao?: string; icone?: string }[]): string | null {
  const limpos = itens
    .map((m) => ({ titulo: texto(m.titulo), descricao: texto(m.descricao), icone: texto(m.icone) || undefined }))
    .filter((m) => m.titulo && m.descricao);
  return limpos.length > 0 ? JSON.stringify(limpos) : null;
}

export function serializarDepoimentos(itens: { texto?: string; nome?: string; papel?: string }[]): string | null {
  const limpos = itens
    .map((d) => ({ texto: texto(d.texto), nome: texto(d.nome), papel: texto(d.papel) }))
    .filter((d) => d.texto && d.nome);
  return limpos.length > 0 ? JSON.stringify(limpos) : null;
}
