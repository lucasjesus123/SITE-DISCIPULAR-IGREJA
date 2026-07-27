import type { Papel } from "@prisma/client";
import { sessaoAtual, type SessaoAtual } from "@/lib/auth/session";
import { exigirTenant, type TenantResolvido } from "@/lib/tenant/resolve";
import { tenantDb, type TenantDb } from "@/lib/db/tenant-client";

/**
 * Autorização baseada em papel.
 *
 * A DISTINÇÃO QUE IMPORTA
 * "Autenticado" e "autorizado" são coisas diferentes. Um membro comum está
 * autenticado no app, mas não está autorizado a ler os pedidos de oração da
 * igreja inteira. Todo handler precisa responder DUAS perguntas:
 *   1. Quem é você?              -> sessaoAtual()
 *   2. Você pode fazer ISTO?     -> exigirPermissao()
 *
 * Sistemas vazam quando alguém responde só a primeira.
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
  | "arquivos.enviar";

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
    "oracao.ler",
    "batismos.ler",
    "celulas.ler",
    "agenda.gerenciar",
    "cursos.gerenciar",
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
  ]),

  /** Admin do tenant: tudo dentro da própria igreja. */
  ADMIN: new Set<Permissao>([
    "pessoas.ler", "pessoas.criar", "pessoas.editar", "pessoas.excluir",
    "pessoas.exportar", "pessoas.lerSensivel",
    "submissoes.ler", "submissoes.processar",
    "oracao.ler", "oracao.responder", "oracao.excluir",
    "batismos.ler", "batismos.aprovar",
    "celulas.ler", "celulas.gerenciar", "celulas.relatar",
    "agenda.gerenciar", "cursos.gerenciar", "mensagens.gerenciar",
    "site.ler", "site.editar", "site.publicar",
    "usuarios.ler", "usuarios.gerenciar",
    "config.gerenciar", "auditoria.ler", "arquivos.enviar",
  ]),
};

export function papelTem(papel: Papel, permissao: Permissao): boolean {
  return PERMISSOES_POR_PAPEL[papel].has(permissao);
}

// -----------------------------------------------------------------------------
// Erros de autorização
// -----------------------------------------------------------------------------

export class NaoAutenticadoError extends Error {
  constructor() {
    super("Faça login para continuar.");
    this.name = "NaoAutenticadoError";
  }
}

export class NaoAutorizadoError extends Error {
  constructor(public readonly permissao?: Permissao) {
    // Mensagem genérica: dizer QUAL permissão falta ajudaria a mapear o
    // modelo de autorização de fora.
    super("Você não tem permissão para esta ação.");
    this.name = "NaoAutorizadoError";
  }
}

// -----------------------------------------------------------------------------
// Contexto autorizado
// -----------------------------------------------------------------------------

/**
 * O objeto que todo handler do painel recebe. Note que ele já entrega o
 * cliente de banco ESCOPADO: não existe caminho em que o handler acesse
 * dados sem o filtro de tenant.
 */
export interface ContextoAutorizado {
  sessao: SessaoAtual;
  tenant: TenantResolvido;
  papel: Papel;
  db: TenantDb;
  pode: (permissao: Permissao) => boolean;
}

/** Exige apenas sessão válida (sem verificar igreja). */
export async function exigirSessao(): Promise<SessaoAtual> {
  const sessao = await sessaoAtual();
  if (!sessao) throw new NaoAutenticadoError();
  return sessao;
}

/**
 * Exige sessão + vínculo com a igreja DO HOSTNAME atual.
 *
 * Esta é a checagem que fecha a porta do multi-tenant. Repare que
 * comparamos `sessao.tenantId` com `tenant.id` — o tenant do HOSTNAME.
 * Se um pastor da Igreja A logado abrir o painel da Igreja B (colando a URL),
 * a sessão dele tem tenantId=A, o host resolve para B, os dois não batem, e o
 * acesso é negado. Sem esta linha, ele veria o painel da Igreja B.
 */
export async function exigirAcessoTenant(): Promise<ContextoAutorizado> {
  const sessao = await exigirSessao();
  const tenant = await exigirTenant();

  const mesmoTenant = sessao.tenantId === tenant.id;

  /**
   * Super admin acessando um tenant: permitido apenas em sessão de
   * impersonação explícita, que já foi registrada na auditoria da plataforma.
   * Sem esta restrição, bastaria uma conta de plataforma comprometida para
   * ler tudo de todas as igrejas sem deixar rastro.
   */
  const impersonacaoValida =
    sessao.plataformaAdmin && sessao.impersonadoPor !== null && sessao.tenantId === tenant.id;

  if (!mesmoTenant && !impersonacaoValida) {
    throw new NaoAutorizadoError();
  }

  const papel = sessao.papel ?? (sessao.plataformaAdmin ? "ADMIN" : null);
  if (!papel) throw new NaoAutorizadoError();

  return {
    sessao,
    tenant,
    papel,
    db: tenantDb(tenant.id),
    pode: (permissao: Permissao) => papelTem(papel, permissao),
  };
}

/** Exige acesso ao tenant E uma permissão específica. */
export async function exigirPermissao(permissao: Permissao): Promise<ContextoAutorizado> {
  const ctx = await exigirAcessoTenant();
  if (!ctx.pode(permissao)) {
    throw new NaoAutorizadoError(permissao);
  }
  return ctx;
}

/** Exige que o usuário seja administrador da PLATAFORMA (você). */
export async function exigirPlataformaAdmin(): Promise<SessaoAtual> {
  const sessao = await exigirSessao();
  if (!sessao.plataformaAdmin) throw new NaoAutorizadoError();
  // Sessão de impersonação não serve para voltar e administrar a plataforma:
  // seria uma forma de escalar de volta com um contexto já rebaixado.
  if (sessao.impersonadoPor) throw new NaoAutorizadoError();
  return sessao;
}

// -----------------------------------------------------------------------------
// Recorte adicional dentro do tenant
// -----------------------------------------------------------------------------

/**
 * Filtro extra aplicado ALÉM do escopo de tenant.
 *
 * Isolamento de tenant impede a Igreja A de ver a Igreja B. Mas dentro da
 * Igreja A ainda existe fronteira: um líder de célula não deve ler a ficha de
 * membros de outra célula. Este helper devolve o `where` parcial que
 * implementa esse recorte.
 *
 * Retorna `{}` para quem enxerga a igreja inteira.
 */
export function filtroDeEscopo(ctx: ContextoAutorizado): Record<string, unknown> {
  if (ctx.papel === "LIDER_CELULA") {
    // Sem célula atribuída, o líder não vê ninguém — falha fechada.
    // Um `{}` aqui daria a ele a igreja inteira.
    return { celulaId: ctx.sessao.celulaId ?? "__sem-celula__" };
  }
  return {};
}

/**
 * Remove campos sensíveis de uma pessoa quando quem lê não tem
 * `pessoas.lerSensivel`.
 *
 * Filtrar na SERIALIZAÇÃO, e não só na tela, é o que impede o vazamento por
 * payload: um `<PessoaCard>` que esconde o campo no JSX ainda mandaria o
 * texto para o navegador, visível no DevTools ou na resposta da API.
 */
export function filtrarCamposSensiveis<T extends { observacoesPastorais?: string | null }>(
  ctx: ContextoAutorizado,
  pessoa: T,
): T {
  if (ctx.pode("pessoas.lerSensivel")) return pessoa;
  return { ...pessoa, observacoesPastorais: null };
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
