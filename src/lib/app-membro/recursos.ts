/**
 * Recursos visíveis no App de Membros — MÓDULO PURO.
 *
 * Duas camadas decidem o que o membro vê (spec seção 3.5):
 *
 *  (a) TOGGLES GLOBAIS — o admin liga/desliga cada recurso para a igreja toda.
 *      Recurso desligado NÃO aparece para ninguém, nem na navegação.
 *
 *  (b) LIBERAÇÃO POR VÍNCULO — "Meus Filhos" (Kids) e "Minhas Escalas" (Louvor)
 *      só aparecem para quem TEM filho vinculado / serve no ministério. Nunca
 *      liberado manualmente para estranhos.
 *
 * Regras de segurança embutidas:
 *  - "Contribuir" exige gateway PIX ativo; sem isso, some (não quebra).
 *  - "Minha Célula" só quando a igreja usa células E o membro está numa.
 *  - Início e Perfil são a base: sempre presentes (não há toggle que os remova).
 *
 * Sendo função pura, dá para testar a matriz inteira sem banco nem sessão.
 */

export interface TogglesApp {
  inicio: boolean;
  palavra: boolean;
  contribuir: boolean;
  agenda: boolean;
  celula: boolean;
  perfil: boolean;
  notificacoes: boolean;
}

/** Vínculos do membro + capacidades da igreja que liberam itens condicionais. */
export interface ContextoMembro {
  /** Igreja tem chave PIX configurada? (Contribuir depende disso.) */
  pixConfigurado: boolean;
  /** Membro tem filho vinculado no Kids? (libera "Meus Filhos".) */
  temFilhoKids: boolean;
  /** Membro serve em algum ministério? (libera "Minhas Escalas".) */
  serveMinisterio: boolean;
  /** Membro está numa célula? (Minha Célula depende disso + toggle.) */
  emCelula: boolean;
}

export type ChaveRecurso = "inicio" | "palavra" | "contribuir" | "agenda" | "celula" | "perfil";

export interface ItemApp {
  chave: ChaveRecurso;
  rotulo: string;
  href: string;
}

const TABBAR: ItemApp[] = [
  { chave: "inicio", rotulo: "Início", href: "/app" },
  { chave: "palavra", rotulo: "Palavra", href: "/app/mensagens" },
  { chave: "contribuir", rotulo: "Contribuir", href: "/app/contribuir" },
  { chave: "agenda", rotulo: "Agenda", href: "/app/agenda" },
  { chave: "celula", rotulo: "Célula", href: "/app/celulas" },
  { chave: "perfil", rotulo: "Perfil", href: "/app/perfil" },
];

/** Toggles padrão (a igreja começa com o essencial ligado; célula opcional). */
export const TOGGLES_PADRAO: TogglesApp = {
  inicio: true,
  palavra: true,
  contribuir: true,
  agenda: true,
  celula: false,
  perfil: true,
  notificacoes: true,
};

/**
 * Itens da barra do app, na ordem, já filtrados pelos toggles e vínculos.
 * A tabbar deve caber em ≤5 itens (acessibilidade do alvo de toque), então
 * quando "Célula" está ligada o conjunto é: Início, Palavra, Contribuir,
 * Agenda/Célula, Perfil — priorizamos os 5 primeiros itens elegíveis.
 */
export function navDoApp(toggles: TogglesApp, ctx: ContextoMembro): ItemApp[] {
  const elegiveis = TABBAR.filter((item) => {
    switch (item.chave) {
      case "inicio":
      case "perfil":
        return true; // base — sempre
      case "contribuir":
        // exige toggle E gateway PIX ativo
        return toggles.contribuir && ctx.pixConfigurado;
      case "celula":
        // exige toggle E o membro estar numa célula
        return toggles.celula && ctx.emCelula;
      case "palavra":
        return toggles.palavra;
      case "agenda":
        return toggles.agenda;
    }
  });

  // Limite de 5 na barra: mantém Início e Perfil (âncoras) e corta do meio.
  if (elegiveis.length <= 5) return elegiveis;
  const meio = elegiveis.filter((i) => i.chave !== "inicio" && i.chave !== "perfil");
  return [TABBAR[0]!, ...meio.slice(0, 3), TABBAR[TABBAR.length - 1]!];
}

/** Itens condicionais do Perfil, liberados só por vínculo. */
export function itensDoPerfil(ctx: ContextoMembro): ChaveRecurso[] | string[] {
  const itens: string[] = ["contribuicoes", "privacidade"];
  if (ctx.temFilhoKids) itens.unshift("meus_filhos");
  if (ctx.serveMinisterio) itens.push("minhas_escalas");
  return itens;
}

/** Um recurso específico está disponível para este membro? */
export function recursoDisponivel(chave: ChaveRecurso, toggles: TogglesApp, ctx: ContextoMembro): boolean {
  return navDoApp(toggles, ctx).some((i) => i.chave === chave);
}
