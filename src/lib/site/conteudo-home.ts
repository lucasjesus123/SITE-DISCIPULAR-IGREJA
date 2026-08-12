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

/** Demais seções editáveis da home: "Acesse o app", "Próximos passos" e as
 *  faixas de Células, Oração e Newsletter. Ícones e números são fixos por
 *  posição; a igreja edita só os textos. */
export interface PassoHome {
  titulo: string;
  texto: string;
}
export interface SecoesHome {
  appTitulo: string; // vazio = "Acesse o app da <nome da igreja>" (dinâmico)
  appLead: string;
  appRecursos: string[]; // 6
  passosTitulo: string;
  passosLead: string;
  passos: PassoHome[]; // 5
  celulasTitulo: string;
  celulasTexto: string;
  oracaoTitulo: string;
  oracaoLead: string;
  newsletterTitulo: string;
  newsletterTexto: string;
  // Títulos das demais seções
  minisTitulo: string;
  minisLead: string;
  depoimentosTitulo: string;
  contribuaTitulo: string;
  contribuaTexto: string;
  contatoTitulo: string;
  contatoLead: string;
  agendaTitulo: string;
  // Botões e links da home (rótulo + destino). Link vazio nos do hero = usa o
  // destino dinâmico (ao vivo). Os demais têm destino padrão.
  heroBtn1Texto: string;
  heroBtn1Link: string;
  heroBtn2Texto: string;
  heroBtn2Link: string;
  mensagemLead: string;
  mensagemBtnTexto: string;
  mensagemBtnLink: string;
  appBtnTexto: string;
  appBtnLink: string;
  minisBtnTexto: string;
  minisBtnLink: string;
  celulasBtnTexto: string;
  celulasBtnLink: string;
  oracaoBtnTexto: string;
  oracaoBtnLink: string;
  contribuaBtnTexto: string;
  contribuaBtnLink: string;
}

export const SECOES_HOME_PADRAO: SecoesHome = {
  appTitulo: "",
  appLead: "Tudo o que você vive na igreja, agora na palma da mão. Assista aos cultos, contribua, acompanhe sua célula e muito mais — em um só lugar, do seu jeito.",
  appRecursos: [
    "Cultos e mensagens ao vivo",
    "Dízimos e ofertas por PIX",
    "Minha célula e grupos",
    "Kids ao vivo dos seus filhos",
    "Agenda e inscrições",
    "Avisos e devocional diário",
  ],
  passosTitulo: "Próximos passos",
  passosLead: "Um caminho simples para você avançar na sua jornada com Cristo.",
  passos: [
    { titulo: "Aceitei Jesus", texto: "Deu o primeiro passo? Conte pra gente." },
    { titulo: "Batismo", texto: "Inscreva-se no próximo batismo." },
    { titulo: "Célula", texto: "Encontre um grupo perto de você." },
    { titulo: "Trilha do Discípulo", texto: "Cursos e trilhas de crescimento." },
    { titulo: "Servir", texto: "Faça parte de um ministério." },
  ],
  celulasTitulo: "Encontre uma célula",
  celulasTexto: "Ninguém foi feito para caminhar sozinho. Achamos um grupo perto de você para viver a fé em comunidade.",
  oracaoTitulo: "Podemos orar por você?",
  oracaoLead: "Envie seu pedido de oração. Nossa equipe de intercessão vai clamar por você em particular.",
  newsletterTitulo: "Receba as novidades",
  newsletterTexto: "Devocional, avisos e eventos direto no seu e-mail.",
  minisTitulo: "Nossos ministérios",
  minisLead: "Há um lugar para você servir, crescer e viver em comunidade.",
  depoimentosTitulo: "Histórias da nossa família",
  contribuaTitulo: "Contribua com a obra",
  contribuaTexto: "Sua oferta e dízimo sustentam a missão e abençoam vidas. Pelo site ou direto no app.",
  contatoTitulo: "Venha nos visitar",
  contatoLead: "Estamos de portas abertas. Envie sua mensagem — ela chega direto no nosso WhatsApp.",
  agendaTitulo: "Próximos eventos",
  heroBtn1Texto: "▶ Assista ao vivo",
  heroBtn1Link: "",
  heroBtn2Texto: "Baixar o app",
  heroBtn2Link: "/app",
  mensagemLead: "Assista à palavra de domingo e acompanhe todas as transmissões ao vivo pelo nosso canal.",
  mensagemBtnTexto: "Ver todas as mensagens",
  mensagemBtnLink: "/mensagens",
  appBtnTexto: "Baixar agora",
  appBtnLink: "/app",
  minisBtnTexto: "Conhecer →",
  minisBtnLink: "/quem-somos",
  celulasBtnTexto: "Buscar grupo perto de mim",
  celulasBtnLink: "/celulas",
  oracaoBtnTexto: "Enviar pedido de oração",
  oracaoBtnLink: "/oracao",
  contribuaBtnTexto: "Contribuir com PIX",
  contribuaBtnLink: "/contribua",
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

/** Parse das demais seções (app, passos, faixas) — defensivo por campo. */
export function parseSecoesHome(json: string | null | undefined): SecoesHome {
  let o: Record<string, unknown> = {};
  if (json) {
    try {
      const v = JSON.parse(json);
      if (v && typeof v === "object" && !Array.isArray(v)) o = v as Record<string, unknown>;
    } catch {
      // JSON quebrado: tudo no padrão.
    }
  }
  const recIn = Array.isArray(o.appRecursos) ? o.appRecursos : [];
  const appRecursos = SECOES_HOME_PADRAO.appRecursos.map((d, i) => texto(recIn[i]) || d);
  const pasIn = Array.isArray(o.passos) ? o.passos : [];
  const passos = SECOES_HOME_PADRAO.passos.map((d, i) => {
    const r = (pasIn[i] ?? {}) as Record<string, unknown>;
    return { titulo: texto(r.titulo) || d.titulo, texto: texto(r.texto) || d.texto };
  });
  const p = SECOES_HOME_PADRAO;
  return {
    appTitulo: texto(o.appTitulo), // vazio permitido (=> título dinâmico com o nome da igreja)
    appLead: texto(o.appLead) || p.appLead,
    appRecursos,
    passosTitulo: texto(o.passosTitulo) || p.passosTitulo,
    passosLead: texto(o.passosLead) || p.passosLead,
    passos,
    celulasTitulo: texto(o.celulasTitulo) || p.celulasTitulo,
    celulasTexto: texto(o.celulasTexto) || p.celulasTexto,
    oracaoTitulo: texto(o.oracaoTitulo) || p.oracaoTitulo,
    oracaoLead: texto(o.oracaoLead) || p.oracaoLead,
    newsletterTitulo: texto(o.newsletterTitulo) || p.newsletterTitulo,
    newsletterTexto: texto(o.newsletterTexto) || p.newsletterTexto,
    minisTitulo: texto(o.minisTitulo) || p.minisTitulo,
    minisLead: texto(o.minisLead) || p.minisLead,
    depoimentosTitulo: texto(o.depoimentosTitulo) || p.depoimentosTitulo,
    contribuaTitulo: texto(o.contribuaTitulo) || p.contribuaTitulo,
    contribuaTexto: texto(o.contribuaTexto) || p.contribuaTexto,
    contatoTitulo: texto(o.contatoTitulo) || p.contatoTitulo,
    contatoLead: texto(o.contatoLead) || p.contatoLead,
    agendaTitulo: texto(o.agendaTitulo) || p.agendaTitulo,
    heroBtn1Texto: texto(o.heroBtn1Texto) || p.heroBtn1Texto,
    heroBtn1Link: texto(o.heroBtn1Link), // vazio = destino dinâmico (ao vivo)
    heroBtn2Texto: texto(o.heroBtn2Texto) || p.heroBtn2Texto,
    heroBtn2Link: texto(o.heroBtn2Link) || p.heroBtn2Link,
    mensagemLead: texto(o.mensagemLead) || p.mensagemLead,
    mensagemBtnTexto: texto(o.mensagemBtnTexto) || p.mensagemBtnTexto,
    mensagemBtnLink: texto(o.mensagemBtnLink) || p.mensagemBtnLink,
    appBtnTexto: texto(o.appBtnTexto) || p.appBtnTexto,
    appBtnLink: texto(o.appBtnLink) || p.appBtnLink,
    minisBtnTexto: texto(o.minisBtnTexto) || p.minisBtnTexto,
    minisBtnLink: texto(o.minisBtnLink) || p.minisBtnLink,
    celulasBtnTexto: texto(o.celulasBtnTexto) || p.celulasBtnTexto,
    celulasBtnLink: texto(o.celulasBtnLink) || p.celulasBtnLink,
    oracaoBtnTexto: texto(o.oracaoBtnTexto) || p.oracaoBtnTexto,
    oracaoBtnLink: texto(o.oracaoBtnLink) || p.oracaoBtnLink,
    contribuaBtnTexto: texto(o.contribuaBtnTexto) || p.contribuaBtnTexto,
    contribuaBtnLink: texto(o.contribuaBtnLink) || p.contribuaBtnLink,
  };
}

/** Serializa as demais seções; null se nada foi preenchido (volta ao padrão). */
export function serializarSecoesHome(v: {
  appTitulo?: string; appLead?: string; appRecursos?: string[];
  passosTitulo?: string; passosLead?: string; passos?: { titulo?: string; texto?: string }[];
  celulasTitulo?: string; celulasTexto?: string;
  oracaoTitulo?: string; oracaoLead?: string;
  newsletterTitulo?: string; newsletterTexto?: string;
  minisTitulo?: string; minisLead?: string; depoimentosTitulo?: string;
  contribuaTitulo?: string; contribuaTexto?: string;
  contatoTitulo?: string; contatoLead?: string; agendaTitulo?: string;
  heroBtn1Texto?: string; heroBtn1Link?: string; heroBtn2Texto?: string; heroBtn2Link?: string;
  mensagemLead?: string; mensagemBtnTexto?: string; mensagemBtnLink?: string;
  appBtnTexto?: string; appBtnLink?: string; minisBtnTexto?: string; minisBtnLink?: string;
  celulasBtnTexto?: string; celulasBtnLink?: string; oracaoBtnTexto?: string; oracaoBtnLink?: string;
  contribuaBtnTexto?: string; contribuaBtnLink?: string;
}): string | null {
  const appRecursos = (v.appRecursos ?? []).slice(0, 6).map(texto);
  const passos = (v.passos ?? []).slice(0, 5).map((x) => ({ titulo: texto(x.titulo), texto: texto(x.texto) }));
  const obj = {
    appTitulo: texto(v.appTitulo), appLead: texto(v.appLead), appRecursos,
    passosTitulo: texto(v.passosTitulo), passosLead: texto(v.passosLead), passos,
    celulasTitulo: texto(v.celulasTitulo), celulasTexto: texto(v.celulasTexto),
    oracaoTitulo: texto(v.oracaoTitulo), oracaoLead: texto(v.oracaoLead),
    newsletterTitulo: texto(v.newsletterTitulo), newsletterTexto: texto(v.newsletterTexto),
    minisTitulo: texto(v.minisTitulo), minisLead: texto(v.minisLead), depoimentosTitulo: texto(v.depoimentosTitulo),
    contribuaTitulo: texto(v.contribuaTitulo), contribuaTexto: texto(v.contribuaTexto),
    contatoTitulo: texto(v.contatoTitulo), contatoLead: texto(v.contatoLead), agendaTitulo: texto(v.agendaTitulo),
    heroBtn1Texto: texto(v.heroBtn1Texto), heroBtn1Link: texto(v.heroBtn1Link), heroBtn2Texto: texto(v.heroBtn2Texto), heroBtn2Link: texto(v.heroBtn2Link),
    mensagemLead: texto(v.mensagemLead), mensagemBtnTexto: texto(v.mensagemBtnTexto), mensagemBtnLink: texto(v.mensagemBtnLink),
    appBtnTexto: texto(v.appBtnTexto), appBtnLink: texto(v.appBtnLink), minisBtnTexto: texto(v.minisBtnTexto), minisBtnLink: texto(v.minisBtnLink),
    celulasBtnTexto: texto(v.celulasBtnTexto), celulasBtnLink: texto(v.celulasBtnLink), oracaoBtnTexto: texto(v.oracaoBtnTexto), oracaoBtnLink: texto(v.oracaoBtnLink),
    contribuaBtnTexto: texto(v.contribuaBtnTexto), contribuaBtnLink: texto(v.contribuaBtnLink),
  };
  const algo = Object.values(obj).some((x) =>
    typeof x === "string" ? x : x.some((c: unknown) => (typeof c === "string" ? c : Boolean((c as { titulo?: string; texto?: string }).titulo || (c as { texto?: string }).texto))),
  );
  return algo ? JSON.stringify(obj) : null;
}
