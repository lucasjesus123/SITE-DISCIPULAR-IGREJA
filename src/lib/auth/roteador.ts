import type { Papel } from "@prisma/client";

/**
 * Roteador de acesso — MÓDULO PURO (seção 2 do prompt dos apps).
 *
 * Uma mesma conta pode ser gestão E membro. Depois de autenticar:
 *  - quem tem papel de GESTÃO (líder, secretaria, pastor, admin) pode escolher
 *    entre o "Painel de Gestão" e o "App da Igreja", e alternar sem deslogar;
 *  - quem é SOMENTE membro vai direto para o app, sem tela de escolha.
 *
 * Sendo função pura, a matriz de papéis é testável sem sessão nem banco.
 */

/** Papéis que enxergam o painel de gestão (tudo que não é MEMBRO puro).
 *  papel nulo (sessão sem vínculo resolvido) é tratado como não-gestão. */
export function papelDeGestao(papel: Papel | null): boolean {
  return papel != null && papel !== "MEMBRO";
}

/**
 * Destino imediato após o login. Gestão vai para o painel por padrão (a troca
 * fica sempre acessível); membro vai direto para o app.
 */
export function destinoPadrao(papel: Papel | null): "/painel" | "/app" {
  return papelDeGestao(papel) ? "/painel" : "/app";
}

export interface OpcaoAcesso {
  chave: "painel" | "app";
  rotulo: string;
  descricao: string;
  href: string;
}

/**
 * Opções de acesso que a pessoa pode alternar. Membro puro só tem o app —
 * nesse caso a UI não mostra escolha nenhuma (destinoPadrao já resolve).
 */
export function opcoesDeAcesso(papel: Papel | null): OpcaoAcesso[] {
  const app: OpcaoAcesso = {
    chave: "app",
    rotulo: "App da Igreja",
    descricao: "Cultos ao vivo, contribuir, agenda, sua célula e o Kids dos seus filhos.",
    href: "/app",
  };
  if (!papelDeGestao(papel)) return [app];

  return [
    {
      chave: "painel",
      rotulo: "Painel de Gestão",
      descricao: "Pessoas, escalas, financeiro, kids, inscrições e o site da igreja.",
      href: "/painel",
    },
    app,
  ];
}

/** Deve mostrar a tela/menu de escolha? Só quando há mais de uma opção. */
export function podeAlternar(papel: Papel | null): boolean {
  return opcoesDeAcesso(papel).length > 1;
}
