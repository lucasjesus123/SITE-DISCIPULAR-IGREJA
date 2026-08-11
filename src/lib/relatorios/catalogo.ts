/**
 * Catálogo da Central de Relatórios (metadados PUROS — sem Prisma/React).
 *
 * Adicionar um relatório = uma entrada aqui + um `case` no carregador
 * (src/lib/relatorios/dados.ts). O seletor e o menu leem daqui.
 */

export type RelatorioChave =
  | "financeiro"
  | "entradas"
  | "saidas"
  | "secretaria"
  | "visitantes"
  | "batismos"
  | "apresentacoes"
  | "novos-membros"
  | "celulas";

export interface RelatorioDef {
  chave: RelatorioChave;
  rotulo: string;
  grupo: "Financeiro" | "Secretaria" | "Pessoas" | "Células";
  icone: string;
  descricao: string;
  /** Gaveta/módulo exigido (some se a igreja não contratou). */
  modulo?: "financeiro" | "celulas";
}

export const RELATORIOS: RelatorioDef[] = [
  { chave: "financeiro", rotulo: "Financeiro completo", grupo: "Financeiro", icone: "💰", descricao: "Entradas e saídas do período, com totais e saldo.", modulo: "financeiro" },
  { chave: "entradas", rotulo: "Apenas entradas", grupo: "Financeiro", icone: "📈", descricao: "Só as receitas (dízimos, ofertas, contribuições).", modulo: "financeiro" },
  { chave: "saidas", rotulo: "Apenas saídas", grupo: "Financeiro", icone: "📉", descricao: "Só as despesas do período.", modulo: "financeiro" },

  { chave: "secretaria", rotulo: "Secretaria (geral)", grupo: "Secretaria", icone: "🗂️", descricao: "Resumo de todos os cadastros da secretaria no período." },
  { chave: "visitantes", rotulo: "Visitantes", grupo: "Secretaria", icone: "👋", descricao: "Todos os visitantes registrados no período." },
  { chave: "batismos", rotulo: "Batismos", grupo: "Secretaria", icone: "💧", descricao: "Inscrições e batismos no período." },
  { chave: "apresentacoes", rotulo: "Apresentação de crianças", grupo: "Secretaria", icone: "🧒", descricao: "Crianças apresentadas no período." },

  { chave: "novos-membros", rotulo: "Novos membros", grupo: "Pessoas", icone: "🧍", descricao: "Pessoas que viraram membros no período." },

  { chave: "celulas", rotulo: "Células", grupo: "Células", icone: "🏠", descricao: "Encontros, presença, visitantes e decisões nas células.", modulo: "celulas" },
];

const POR_CHAVE = new Map(RELATORIOS.map((r) => [r.chave, r]));

export function relatorioPorChave(chave: string): RelatorioDef | null {
  return POR_CHAVE.get(chave as RelatorioChave) ?? null;
}

/** Agrupa para exibição (mantém a ordem de inserção dos grupos). */
export function relatoriosPorGrupo(): { grupo: string; itens: RelatorioDef[] }[] {
  const ordem: string[] = [];
  const mapa = new Map<string, RelatorioDef[]>();
  for (const r of RELATORIOS) {
    if (!mapa.has(r.grupo)) { mapa.set(r.grupo, []); ordem.push(r.grupo); }
    mapa.get(r.grupo)!.push(r);
  }
  return ordem.map((grupo) => ({ grupo, itens: mapa.get(grupo)! }));
}
