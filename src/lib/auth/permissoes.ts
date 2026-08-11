import type { Papel } from "@prisma/client";

/**
 * Matriz de permissões — MÓDULO PURO.
 *
 * Isolado de rbac.ts de propósito: aqui não há NENHUM import de servidor
 * (nada de next/headers, sessão ou Prisma). Assim um componente client
 * (ex.: o menu lateral) pode importar `papelTem`/`Permissao` para esconder
 * itens que o usuário não pode abrir, SEM arrastar código de servidor para
 * dentro do bundle do navegador.
 *
 * Esconder item de menu é usabilidade, não segurança: a autorização real
 * continua no servidor, em exigirPermissao() (src/lib/auth/rbac.ts).
 */

/**
 * Permissões atômicas. Preferimos uma lista explícita a checar papel direto
 * no handler (`if (papel === "ADMIN")`), porque assim mudar quem pode o quê
 * é uma alteração em UM arquivo, e não uma caçada por condicionais espalhadas.
 */
export type Permissao =
  // Pessoas
  | "pessoas.ler"
  | "pessoas.criar"
  | "pessoas.editar"
  | "pessoas.excluir"
  | "pessoas.exportar"
  /** Observações pastorais: dado sensível, separado da leitura comum. */
  | "pessoas.lerSensivel"
  // Triagem de formulários
  | "submissoes.ler"
  | "submissoes.processar"
  // Secretaria (cadastros: visitantes, batismo, apresentação, integração, decisão)
  | "secretaria.gerenciar"
  // Pedidos de oração
  | "oracao.ler"
  | "oracao.responder"
  | "oracao.excluir"
  // Batismos
  | "batismos.ler"
  | "batismos.aprovar"
  // Células
  | "celulas.ler"
  | "celulas.gerenciar"
  | "celulas.relatar"
  // Agenda, cursos, mensagens
  | "agenda.gerenciar"
  | "cursos.gerenciar"
  | "mensagens.gerenciar"
  // Site whitelabel
  | "site.ler"
  | "site.editar"
  | "site.publicar"
  // Configurações e usuários
  | "usuarios.ler"
  | "usuarios.gerenciar"
  | "config.gerenciar"
  | "auditoria.ler"
  | "arquivos.enviar"
  // WhatsApp (conectar número, enviar, automações)
  | "whatsapp.gerenciar"
  // Financeiro (lançar, estornar, transferir, ver saldos)
  | "financeiro.gerenciar"
  // Inscrições (criar eventos/cursos, ver inscritos)
  | "inscricoes.gerenciar"
  // Kids (ministério infantil: cadastro, check-in/out)
  | "kids.gerenciar"
  // Automações (editar templates de mensagem)
  | "automacoes.gerenciar"
  // Louvor (ministério: equipe, escala, repertório, chat)
  | "louvor.gerenciar";

/**
 * Matriz de permissões.
 *
 * Princípio do menor privilégio: começamos pelo MEMBRO (quase nada) e vamos
 * somando. Assim, uma permissão nova criada no futuro fica indisponível para
 * todos até alguém decidir conscientemente quem a recebe — em vez de vazar
 * para todo mundo por padrão.
 */
const PERMISSOES_POR_PAPEL: Record<Papel, ReadonlySet<Permissao>> = {
  /** Membro comum: usa o app, não administra nada. Nenhuma permissão de
   *  gestão. O que ele pode ver sobre si mesmo é tratado por rotas próprias
   *  que filtram por userId, não por permissão. */
  MEMBRO: new Set<Permissao>([]),

  /** Líder de célula: enxerga APENAS a própria célula. O recorte por célula
   *  é aplicado em `filtroDeEscopo()`, não aqui. */
  LIDER_CELULA: new Set<Permissao>([
    "pessoas.ler",
    "celulas.ler",
    "celulas.relatar",
    "oracao.ler",
  ]),

  /** Secretaria: opera os cadastros do dia a dia. Deliberadamente SEM
   *  acesso a observações pastorais, a usuários e ao site. */
  SECRETARIA: new Set<Permissao>([
    "pessoas.ler",
    "pessoas.criar",
    "pessoas.editar",
    "submissoes.ler",
    "submissoes.processar",
    "secretaria.gerenciar",
    "oracao.ler",
    "batismos.ler",
    "celulas.ler",
    "agenda.gerenciar",
    "cursos.gerenciar",
    "inscricoes.gerenciar",
    "kids.gerenciar",
    "automacoes.gerenciar",
    "louvor.gerenciar",
    "arquivos.enviar",
    "site.ler",
  ]),

  /** Pastor: gestão pastoral completa, incluindo dado sensível e o site.
   *  Não mexe em usuários nem em configuração de faturamento. */
  PASTOR: new Set<Permissao>([
    "pessoas.ler",
    "pessoas.criar",
    "pessoas.editar",
    "pessoas.exportar",
    "pessoas.lerSensivel",
    "submissoes.ler",
    "submissoes.processar",
    "secretaria.gerenciar",
    "oracao.ler",
    "oracao.responder",
    "batismos.ler",
    "batismos.aprovar",
    "celulas.ler",
    "celulas.gerenciar",
    "celulas.relatar",
    "agenda.gerenciar",
    "cursos.gerenciar",
    "mensagens.gerenciar",
    "site.ler",
    "site.editar",
    "site.publicar",
    "usuarios.ler",
    "arquivos.enviar",
    "whatsapp.gerenciar",
    "financeiro.gerenciar",
    "inscricoes.gerenciar",
    "kids.gerenciar",
    "automacoes.gerenciar",
    "louvor.gerenciar",
  ]),

  /** Admin do tenant: tudo dentro da própria igreja. */
  ADMIN: new Set<Permissao>([
    "pessoas.ler", "pessoas.criar", "pessoas.editar", "pessoas.excluir",
    "pessoas.exportar", "pessoas.lerSensivel",
    "submissoes.ler", "submissoes.processar", "secretaria.gerenciar",
    "oracao.ler", "oracao.responder", "oracao.excluir",
    "batismos.ler", "batismos.aprovar",
    "celulas.ler", "celulas.gerenciar", "celulas.relatar",
    "agenda.gerenciar", "cursos.gerenciar", "mensagens.gerenciar",
    "site.ler", "site.editar", "site.publicar",
    "usuarios.ler", "usuarios.gerenciar",
    "config.gerenciar", "auditoria.ler", "arquivos.enviar",
    "whatsapp.gerenciar", "financeiro.gerenciar", "inscricoes.gerenciar", "kids.gerenciar",
    "automacoes.gerenciar", "louvor.gerenciar",
  ]),
};

export function papelTem(papel: Papel, permissao: Permissao): boolean {
  return PERMISSOES_POR_PAPEL[papel].has(permissao);
}

/** Lista de papéis que um usuário pode ATRIBUIR a outro.
 *  Impede escalonamento: uma secretaria não promove ninguém a admin. */
export function papeisAtribuiveis(papelDoAtor: Papel): Papel[] {
  switch (papelDoAtor) {
    case "ADMIN":
      return ["ADMIN", "PASTOR", "SECRETARIA", "LIDER_CELULA", "MEMBRO"];
    case "PASTOR":
      // Pastor não cria admin — isso é decisão de quem contrata o plano.
      return ["SECRETARIA", "LIDER_CELULA", "MEMBRO"];
    default:
      return [];
  }
}
