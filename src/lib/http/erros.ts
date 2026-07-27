import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { logger } from "@/lib/logger";
import { NaoAutenticadoError, NaoAutorizadoError } from "@/lib/auth/rbac";
import { ViolacaoTenantError } from "@/lib/db/tenant-client";
import { CsrfInvalidoError } from "@/lib/security/csrf";
import { TenantIndisponivelError, TenantNaoEncontradoError } from "@/lib/tenant/resolve";
import { SenhaFracaError } from "@/lib/auth/password";

/**
 * Tradução de exceção para resposta HTTP.
 *
 * A REGRA CENTRAL
 * O cliente recebe uma mensagem redigida por nós. Nunca `erro.message` de uma
 * exceção não prevista, nunca stack trace, nunca a query que falhou.
 *
 * Por quê: um `PrismaClientKnownRequestError` cru revela nome de tabela, nome
 * de coluna, nome de constraint e às vezes o valor que causou o conflito.
 * Isso é um mapa do banco entregue de graça, e no caso do valor conflitante
 * pode ser dado pessoal de outro usuário.
 *
 * O que o cliente ganha em troca é o `ref`: um identificador que ele pode
 * mandar para o suporte e que localiza o erro completo no log do servidor.
 */

export interface CorpoErro {
  erro: string;
  /** Erros de validação, campo a campo. Seguro: são dados que o próprio
   *  cliente enviou. */
  campos?: Record<string, string[]>;
  /** Referência para correlacionar com o log do servidor. */
  ref?: string;
}

export function tratarErro(erro: unknown, contexto?: Record<string, unknown>): NextResponse<CorpoErro> {
  // ---- 400: entrada inválida
  if (erro instanceof ZodError) {
    const campos: Record<string, string[]> = {};
    for (const problema of erro.issues) {
      const chave = problema.path.join(".") || "_";
      (campos[chave] ??= []).push(problema.message);
    }
    return NextResponse.json(
      { erro: "Dados inválidos. Confira os campos destacados.", campos },
      { status: 400 },
    );
  }

  if (erro instanceof SenhaFracaError) {
    return NextResponse.json(
      { erro: erro.motivo, campos: { senha: [erro.motivo] } },
      { status: 400 },
    );
  }

  // ---- 401 / 403
  if (erro instanceof NaoAutenticadoError) {
    return NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 });
  }

  if (erro instanceof NaoAutorizadoError) {
    return NextResponse.json({ erro: "Você não tem permissão para esta ação." }, { status: 403 });
  }

  if (erro instanceof CsrfInvalidoError) {
    return NextResponse.json(
      { erro: "Sessão expirada. Recarregue a página e tente novamente." },
      { status: 403 },
    );
  }

  /**
   * Violação de tenant.
   *
   * Registramos como ERRO com destaque: em operação normal isto NUNCA deve
   * acontecer. Se aparecer no log, ou existe um bug de escopo, ou alguém está
   * sondando o isolamento. Nos dois casos, é para investigar hoje.
   *
   * Para o cliente devolvemos 404, não 403. Um 403 confirmaria que o recurso
   * existe em outra igreja — que é justamente a informação que o atacante
   * quer.
   */
  if (erro instanceof ViolacaoTenantError) {
    const ref = logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT", erro, {
      ...contexto,
      alerta: "investigar",
    });
    return NextResponse.json({ erro: "Registro não encontrado.", ref }, { status: 404 });
  }

  // ---- 404 / 503 de tenant
  if (erro instanceof TenantNaoEncontradoError) {
    return NextResponse.json(
      { erro: "Nenhuma igreja está vinculada a este endereço." },
      { status: 404 },
    );
  }

  if (erro instanceof TenantIndisponivelError) {
    return NextResponse.json(
      { erro: "Esta igreja está temporariamente indisponível." },
      { status: 503 },
    );
  }

  // ---- Erros do Prisma: tratados por CÓDIGO, nunca repassados
  if (typeof erro === "object" && erro !== null && "code" in erro) {
    const codigo = String((erro as { code: unknown }).code);

    if (codigo === "P2002") {
      // Violação de unicidade. Não dizemos QUAL campo: em um formulário de
      // cadastro, "este e-mail já existe" é enumeração de usuários.
      return NextResponse.json(
        { erro: "Já existe um registro com estes dados." },
        { status: 409 },
      );
    }
    if (codigo === "P2025") {
      return NextResponse.json({ erro: "Registro não encontrado." }, { status: 404 });
    }
    if (codigo === "P2003") {
      return NextResponse.json(
        { erro: "Não é possível concluir: existem registros vinculados." },
        { status: 409 },
      );
    }
  }

  // ---- 500: qualquer coisa não prevista
  const ref = logger.erro("Erro não tratado em rota", erro, contexto);
  return NextResponse.json(
    {
      erro: "Ocorreu um erro inesperado. Nossa equipe foi notificada.",
      ref,
    },
    { status: 500 },
  );
}

/** Resposta 429 padronizada, com Retry-After para o cliente se comportar. */
export function respostaLimiteExcedido(segundos: number): NextResponse<CorpoErro> {
  return NextResponse.json(
    { erro: "Muitas tentativas. Aguarde um momento e tente novamente." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(1, Math.ceil(segundos))) },
    },
  );
}

/** Envolve um handler de rota com o tratamento de erro padrão. */
export function comTratamentoDeErro<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (erro) {
      return tratarErro(erro);
    }
  };
}
