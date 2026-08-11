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

/** Bloco "Novo por aqui": título, chamada, 4 cards e a frase do card escuro,
 *  mais o versículo do topo (hero). Os ícones dos 4 cards são fixos (SVG de
 *  traço, por posição) — a igreja edita só os textos. */
export interface CardBoasVindas {
  titulo: string;
  texto: string;
}
export interface BoasVindas {
  titulo: string;
  lead: string;
  cards: CardBoasVindas[];
  frase: string;
  versiculo: string;
}

export const BOAS_VINDAS_PADRAO: BoasVindas = {
  titulo: "Seja muito bem-vindo.",
  lead: "A gente preparou tudo pra você se sentir em casa desde o primeiro momento. Veja o que esperar:",
  cards: [
    { titulo: "Acolhimento", texto: "Nossa equipe te recebe e acompanha na chegada." },
    { titulo: "Duração", texto: "Os cultos duram cerca de 2 horas." },
    { titulo: "Intimidade com Deus", texto: "Um tempo de adoração e presença para se encontrar com Ele." },
    { titulo: "Kids", texto: "Espaço seguro e divertido para as crianças." },
  ],
  frase: "Você foi feito para fazer parte.",
  versiculo: "“Alegrei-me quando me disseram: Vamos à casa do Senhor.” — Salmos 122:1",
};

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

/**
 * Parse do bloco "Novo por aqui". DEFENSIVO e por campo: qualquer campo vazio
 * ou inválido cai no padrão, então uma edição parcial nunca esvazia a home.
 * Os 4 cards têm ícone fixo por posição; aqui só entram os textos.
 */
export function parseBoasVindas(json: string | null | undefined): BoasVindas {
  let obj: Record<string, unknown> = {};
  if (json) {
    try {
      const v = JSON.parse(json);
      if (v && typeof v === "object" && !Array.isArray(v)) obj = v as Record<string, unknown>;
    } catch {
      // JSON quebrado: fica no padrão.
    }
  }
  const cardsIn = Array.isArray(obj.cards) ? obj.cards : [];
  const cards = BOAS_VINDAS_PADRAO.cards.map((padrao, i) => {
    const r = (cardsIn[i] ?? {}) as Record<string, unknown>;
    return { titulo: texto(r.titulo) || padrao.titulo, texto: texto(r.texto) || padrao.texto };
  });
  return {
    titulo: texto(obj.titulo) || BOAS_VINDAS_PADRAO.titulo,
    lead: texto(obj.lead) || BOAS_VINDAS_PADRAO.lead,
    cards,
    frase: texto(obj.frase) || BOAS_VINDAS_PADRAO.frase,
    versiculo: texto(obj.versiculo) || BOAS_VINDAS_PADRAO.versiculo,
  };
}

/** Serializa o bloco "Novo por aqui"; null se tudo em branco (volta ao padrão). */
export function serializarBoasVindas(v: {
  titulo?: string; lead?: string; frase?: string; versiculo?: string;
  cards?: { titulo?: string; texto?: string }[];
}): string | null {
  const cards = (v.cards ?? []).slice(0, 4).map((c) => ({ titulo: texto(c.titulo), texto: texto(c.texto) }));
  const obj = {
    titulo: texto(v.titulo), lead: texto(v.lead),
    frase: texto(v.frase), versiculo: texto(v.versiculo), cards,
  };
  const vazio = !obj.titulo && !obj.lead && !obj.frase && !obj.versiculo && cards.every((c) => !c.titulo && !c.texto);
  return vazio ? null : JSON.stringify(obj);
}
