import { cache } from "react";
import { tenantDb } from "@/lib/db/tenant-client";
import { normalizarTema, type TemaTenant } from "@/lib/site/theme";

/**
 * Carregamento dos dados do site público.
 *
 * DESEMPENHO
 * Uma página do site faz 6 consultas. Sem cuidado, cada componente puxaria as
 * suas e um único acesso viraria 20 idas ao banco — que, com 30 igrejas
 * ativas, é o gargalo antes de qualquer outra coisa.
 *
 * Duas medidas: `cache()` do React deduplica dentro da renderização, e as
 * consultas independentes vão juntas em `Promise.all`.
 *
 * SEGURANÇA
 * Tudo passa por `tenantDb(tenantId)`, então nenhuma consulta aqui consegue
 * enxergar outra igreja, mesmo que o filtro seja esquecido.
 */

export interface DadosSite {
  config: ConfigSite;
  tema: TemaTenant;
  campi: CampusPublico[];
  agenda: AgendaPublica[];
  celulas: CelulaPublica[];
  cursos: CursoPublico[];
  paginas: { slug: string; titulo: string; ordemMenu: number | null }[];
}

export interface ConfigSite {
  nomeExibicao: string;
  tagline: string | null;
  descricaoSeo: string | null;
  heroTitulo: string | null;
  heroSubtitulo: string | null;
  heroEyebrow: string | null;
  heroCtaTexto: string | null;
  heroCtaLink: string | null;
  heroImagemId: string | null;
  fundoImagemId: string | null;
  logoClaroId: string | null;
  logoEscuroId: string | null;
  faviconId: string | null;
  emailContato: string | null;
  telefoneContato: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  spotify: string | null;
  pixChave: string | null;
  pixTitular: string | null;
  pixDescricao: string | null;
  modulos: Record<string, boolean>;
}

export interface CampusPublico {
  id: string;
  nome: string;
  descricao: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  mapaEmbedUrl: string | null;
  telefone: string | null;
  principal: boolean;
}

export interface AgendaPublica {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  diaSemana: number | null;
  horario: string | null;
  dataHora: Date | null;
  destaque: boolean;
  campusNome: string | null;
}

export interface CelulaPublica {
  id: string;
  nome: string;
  diaSemana: number | null;
  horario: string | null;
  bairro: string | null;
  cidade: string | null;
  liderNome: string | null;
}

export interface CursoPublico {
  id: string;
  nome: string;
  slug: string;
  resumo: string | null;
  descricao: string | null;
  diaSemana: number | null;
  horario: string | null;
  precoCentavos: number | null;
  periodicidade: string | null;
  inscricoesAbertas: boolean;
}

const CONFIG_PADRAO: ConfigSite = {
  nomeExibicao: "Igreja",
  tagline: null,
  descricaoSeo: null,
  heroTitulo: null,
  heroSubtitulo: null,
  heroEyebrow: null,
  heroCtaTexto: null,
  heroCtaLink: null,
  heroImagemId: null,
  fundoImagemId: null,
  logoClaroId: null,
  logoEscuroId: null,
  faviconId: null,
  emailContato: null,
  telefoneContato: null,
  whatsapp: null,
  instagram: null,
  facebook: null,
  youtube: null,
  spotify: null,
  pixChave: null,
  pixTitular: null,
  pixDescricao: null,
  modulos: {},
};

export const carregarDadosSite = cache(async (tenantId: string): Promise<DadosSite> => {
  const db = tenantDb(tenantId);

  const [config, campi, agenda, celulas, cursos, paginas] = await Promise.all([
    db.siteConfig.findFirst(),
    db.campus.findMany({
      where: { ativo: true },
      orderBy: [{ principal: "desc" }, { ordem: "asc" }],
      // `select` explícito, nunca `include` amplo: assim um campo novo e
      // sensível adicionado ao modelo não vaza para o site público sozinho.
      select: {
        id: true, nome: true, descricao: true, logradouro: true, numero: true,
        bairro: true, cidade: true, uf: true, mapaEmbedUrl: true,
        telefone: true, principal: true,
      },
      take: 20,
    }),
    db.agendaItem.findMany({
      where: { ativo: true, publicoSite: true },
      orderBy: [{ destaque: "desc" }, { ordem: "asc" }, { diaSemana: "asc" }],
      select: {
        id: true, tipo: true, titulo: true, descricao: true, diaSemana: true,
        horario: true, dataHora: true, destaque: true,
        campus: { select: { nome: true } },
      },
      take: 30,
    }),
    db.celula.findMany({
      where: { ativa: true },
      orderBy: [{ cidade: "asc" }, { bairro: "asc" }],
      // O endereço da célula NÃO entra aqui: é a casa de um membro. O público
      // vê bairro e cidade; o endereço exato vai por contato direto.
      select: {
        id: true, nome: true, diaSemana: true, horario: true,
        bairro: true, cidade: true, liderNome: true,
      },
      take: 200,
    }),
    db.curso.findMany({
      where: { ativo: true },
      orderBy: { ordem: "asc" },
      select: {
        id: true, nome: true, slug: true, resumo: true, descricao: true,
        diaSemana: true, horario: true, precoCentavos: true,
        periodicidade: true, inscricoesAbertas: true,
      },
      take: 30,
    }),
    db.sitePagina.findMany({
      where: { publicada: true, mostrarMenu: true },
      orderBy: { ordemMenu: "asc" },
      select: { slug: true, titulo: true, ordemMenu: true },
      take: 20,
    }),
  ]);

  return {
    config: config
      ? {
          ...CONFIG_PADRAO,
          ...config,
          modulos: (config.modulos as Record<string, boolean> | null) ?? {},
        }
      : CONFIG_PADRAO,
    tema: normalizarTema(config),
    campi,
    agenda: agenda.map((a) => ({
      id: a.id, tipo: a.tipo, titulo: a.titulo, descricao: a.descricao,
      diaSemana: a.diaSemana, horario: a.horario, dataHora: a.dataHora,
      destaque: a.destaque, campusNome: a.campus?.nome ?? null,
    })),
    celulas,
    cursos,
    paginas,
  };
});

/** Uma página específica do site, com os blocos de conteúdo. */
export const carregarPagina = cache(async (tenantId: string, slug: string) => {
  const db = tenantDb(tenantId);
  return db.sitePagina.findFirst({
    where: { slug, publicada: true },
    select: {
      slug: true, titulo: true, seoTitulo: true, seoDescricao: true, blocos: true,
    },
  });
});

/** Últimas mensagens publicadas, para a home e a página de mensagens. */
export const carregarMensagens = cache(async (tenantId: string, limite = 6) => {
  const db = tenantDb(tenantId);
  return db.mensagem.findMany({
    where: { publicado: true },
    orderBy: [{ destaque: "desc" }, { data: "desc" }],
    select: {
      id: true, titulo: true, slug: true, descricao: true, preletor: true,
      serie: true, youtubeVideoId: true, data: true,
    },
    take: Math.min(limite, 50),
  });
});

/**
 * Pedidos de oração marcados como públicos, para o mural do site.
 *
 * Três filtros ao mesmo tempo, todos necessários:
 *   - visibilidade PUBLICO  -> a pessoa escolheu explicitamente publicar
 *   - anonimo false         -> anônimo nunca vai para o site (regra do schema)
 *   - status != ARQUIVADO   -> pedido retirado some do mural
 *
 * E o `select` devolve só título e categoria — o TEXTO do pedido não vai para
 * o site público nem quando marcado como público, porque a pessoa que
 * escreveu "meu marido me traiu" ao pedir oração não previu que aquilo ficaria
 * indexado pelo Google.
 */
export const carregarMuralPublico = cache(async (tenantId: string, limite = 12) => {
  const db = tenantDb(tenantId);
  return db.pedidoOracao.findMany({
    where: {
      visibilidade: "PUBLICO",
      anonimo: false,
      status: { in: ["RECEBIDO", "ORANDO", "RESPONDIDO"] },
    },
    orderBy: { criadoEm: "desc" },
    select: {
      id: true,
      titulo: true,
      categoria: true,
      status: true,
      contadorOracoes: true,
      criadoEm: true,
      nomeSolicitante: true,
    },
    take: Math.min(limite, 50),
  });
});

export const NOMES_DIAS = [
  "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
] as const;

export function nomeDia(dia: number | null): string {
  if (dia === null || dia < 0 || dia > 6) return "";
  return NOMES_DIAS[dia]!;
}

export function formatarPreco(centavos: number | null, periodicidade: string | null): string | null {
  if (centavos === null) return null;
  const valor = (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  return periodicidade === "MENSAL" ? `${valor} por mês` : valor;
}
