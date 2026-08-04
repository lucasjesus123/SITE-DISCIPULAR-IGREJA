import type { Permissao } from "@/lib/auth/permissoes";
import type { TenantPlan } from "@prisma/client";

/**
 * MÓDULOS ("gavetas") do SaaS — PURO e testável.
 *
 * Cada igreja (tenant) contrata só o que quer: às vezes o site inteiro, às
 * vezes só o app, só o Louvor, só o Kids… Um módulo é uma GAVETA: ao ligar,
 * suas telas aparecem e ele se conecta ao resto (os dados já se conversam).
 * Ao desligar, some da navegação e as rotas são barradas no servidor.
 *
 * Diferença para PERMISSÃO:
 *   - MÓDULO   = o que a IGREJA contratou (nível de produto).
 *   - PERMISSÃO = o que o PAPEL da pessoa pode fazer dentro do que existe.
 * Um item só aparece quando o módulo está ligado E o papel tem a permissão.
 */

export type ModuloChave =
  | "site" // site público (home, páginas)
  | "gestao" // painel de gestão (pessoas, secretaria, oração, batismos)
  | "app" // app de membros (PWA)
  | "louvor" // ministério de louvor
  | "kids" // ministério infantil
  | "financeiro" // financeiro + contribuir/PIX
  | "inscricoes" // inscrições/eventos
  | "celulas" // células
  | "escola" // escola/cursos
  | "comunicacao"; // whatsapp, automações, disparos

export interface Modulo {
  chave: ModuloChave;
  nome: string;
  descricao: string;
  /** Alguns módulos são a base do painel e não podem ser desligados. */
  essencial?: boolean;
}

/** Catálogo dos módulos, na ordem de exibição no Super Admin. */
export const MODULOS: Modulo[] = [
  { chave: "gestao", nome: "Gestão", descricao: "Painel: pessoas, secretaria, oração, batismos, usuários.", essencial: true },
  { chave: "site", nome: "Site público", descricao: "Site institucional da igreja (whitelabel)." },
  { chave: "app", nome: "App de Membros", descricao: "Aplicativo (PWA): feed, palavra, contribuir, agenda, perfil." },
  { chave: "louvor", nome: "Louvor", descricao: "Ministério de louvor: escala, equipe, repertório, chat." },
  { chave: "kids", nome: "Kids", descricao: "Ministério infantil: check-in seguro, passaporte, chamar os pais." },
  { chave: "financeiro", nome: "Financeiro", descricao: "Tesouraria (partidas dobradas) + Contribuir/PIX no app." },
  { chave: "inscricoes", nome: "Inscrições", descricao: "Eventos e cursos com inscrição em um toque." },
  { chave: "celulas", nome: "Células", descricao: "Rede de pequenos grupos." },
  { chave: "escola", nome: "Escola", descricao: "Cursos e trilhas de discipulado." },
  { chave: "comunicacao", nome: "Comunicação", descricao: "WhatsApp, automações e disparos." },
];

export type ConfigModulos = Record<ModuloChave, boolean>;

/** Padrão de uma igreja nova: tudo ligado (você desliga o que não vendeu). */
export const MODULOS_PADRAO: ConfigModulos = {
  gestao: true,
  site: true,
  app: true,
  louvor: true,
  kids: true,
  financeiro: true,
  inscricoes: true,
  celulas: true,
  escola: true,
  comunicacao: true,
};

/** Módulo ligado? `gestao` é essencial e nunca fica desligado. */
export function moduloAtivo(config: Partial<ConfigModulos> | null | undefined, chave: ModuloChave): boolean {
  if (chave === "gestao") return true;
  if (!config) return MODULOS_PADRAO[chave];
  return config[chave] ?? MODULOS_PADRAO[chave];
}

/** Normaliza um config parcial (do banco) para o conjunto completo. */
export function normalizarModulos(parcial: Partial<ConfigModulos> | null | undefined): ConfigModulos {
  const out = { ...MODULOS_PADRAO };
  if (parcial) {
    for (const m of MODULOS) {
      if (typeof parcial[m.chave] === "boolean") out[m.chave] = parcial[m.chave] as boolean;
    }
  }
  out.gestao = true; // essencial
  return out;
}

/**
 * Um item de navegação/rota vira visível quando o MÓDULO está ligado E o PAPEL
 * tem a permissão. `undefined` em qualquer um dos dois = não exige aquele lado.
 */
export function itemLiberado(
  config: Partial<ConfigModulos> | null | undefined,
  modulo: ModuloChave | undefined,
  temPermissao: boolean,
): boolean {
  if (!temPermissao) return false;
  if (!modulo) return true;
  return moduloAtivo(config, modulo);
}

/**
 * Preset de módulos por plano — um ponto de partida ao criar/mudar o plano.
 * O admin ainda pode ligar/desligar módulo a módulo depois.
 *   - ESSENCIAL: o básico de uma igreja (site, app, comunicação, células).
 *   - CRESCIMENTO / MULTISEDE: tudo ligado (diferem em limites, não em módulos).
 */
export function modulosDoPlano(plano: TenantPlan): ConfigModulos {
  if (plano === "ESSENCIAL") {
    return {
      gestao: true, site: true, app: true, comunicacao: true, celulas: true,
      louvor: false, kids: false, financeiro: false, inscricoes: false, escola: false,
    };
  }
  // CRESCIMENTO e MULTISEDE: tudo.
  return { ...MODULOS_PADRAO };
}

/** Mapa de qual permissão "pertence" a qual módulo (para telas e nav). */
export const MODULO_DA_PERMISSAO: Partial<Record<Permissao, ModuloChave>> = {
  "louvor.gerenciar": "louvor",
  "kids.gerenciar": "kids",
  "financeiro.gerenciar": "financeiro",
  "inscricoes.gerenciar": "inscricoes",
  "celulas.ler": "celulas",
  "celulas.gerenciar": "celulas",
  "cursos.gerenciar": "escola",
  "whatsapp.gerenciar": "comunicacao",
  "automacoes.gerenciar": "comunicacao",
  "site.editar": "site",
  "mensagens.gerenciar": "site",
};
