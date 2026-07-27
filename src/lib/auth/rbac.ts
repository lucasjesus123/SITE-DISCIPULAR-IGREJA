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
 * A matriz de permissões (tipo Permissao, papelTem, papeisAtribuiveis) foi
 * movida para ./permissoes.ts — um módulo PURO, sem imports de servidor —
 * para que componentes client possam usá-la sem puxar next/headers para o
 * bundle. Reexportamos aqui para não quebrar os imports existentes.
 */
export { papelTem, papeisAtribuiveis } from "@/lib/auth/permissoes";
export type { Permissao } from "@/lib/auth/permissoes";
import { papelTem, type Permissao } from "@/lib/auth/permissoes";


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
