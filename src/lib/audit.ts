import { prisma } from "@/lib/db/prisma";
import { ipHashAtual, userAgentAtual } from "@/lib/http/contexto";
import type { ContextoAutorizado } from "@/lib/auth/rbac";

/**
 * Trilha de auditoria.
 *
 * PARA QUE SERVE DE VERDADE
 * Não é burocracia. Quando um pastor perguntar "quem apagou a ficha da
 * Maria?" ou "alguém andou lendo os pedidos de oração?", esta tabela é a
 * única resposta possível. Sem ela, um acesso indevido é indetectável e
 * inauditável — e sob a LGPD a igreja é a controladora dos dados, então a
 * responsabilidade é dela.
 *
 * O QUE NUNCA PODE ENTRAR AQUI
 * Senha, hash de senha, token de sessão, chave PIX, conteúdo integral de
 * pedido de oração. A função `mascarar()` abaixo é a última barreira — mas a
 * primeira é não passar esses dados.
 */

/** Campos que são apagados de qualquer payload antes de gravar. */
const CAMPOS_PROIBIDOS = new Set([
  "senha", "senhaHash", "password", "passwordHash", "senhaAtual", "novaSenha",
  "token", "tokenHash", "tokenVerificacao", "accessToken", "refreshToken",
  "secret", "apiKey", "chave", "pixChave", "authorization", "cookie",
  "dadosBancariosCriptografados", "csrf", "_csrf",
]);

/** Campos que ficam registrados como "alterado", mas com o valor mascarado. */
const CAMPOS_SENSIVEIS = new Set([
  "cpf", "rg", "observacoesPastorais", "pedido", "respostaTestemunho",
  "respostas", "notaInterna", "email", "telefone", "emailContato",
  "telefoneContato",
]);

/**
 * Limpa recursivamente um objeto antes de gravá-lo em `detalhes`.
 * Profundidade limitada: um payload profundamente aninhado enviado de
 * propósito não pode virar stack overflow no caminho de auditoria.
 */
export function mascarar(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 6) return "[profundo demais]";
  if (valor === null || valor === undefined) return valor;

  if (Array.isArray(valor)) {
    // Arrays gigantes seriam um vetor de enchimento da tabela de auditoria.
    return valor.slice(0, 50).map((v) => mascarar(v, profundidade + 1));
  }

  if (valor instanceof Date) return valor.toISOString();

  if (typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
      const chaveNormalizada = chave.toLowerCase();

      if (CAMPOS_PROIBIDOS.has(chave) || CAMPOS_PROIBIDOS.has(chaveNormalizada)) {
        continue; // nem a chave é registrada
      }
      if (CAMPOS_SENSIVEIS.has(chave) || CAMPOS_SENSIVEIS.has(chaveNormalizada)) {
        saida[chave] = v === null || v === undefined ? null : "[alterado]";
        continue;
      }
      saida[chave] = mascarar(v, profundidade + 1);
    }
    return saida;
  }

  if (typeof valor === "string") {
    // Trunca para não deixar um campo de texto livre inflar a tabela.
    return valor.length > 500 ? `${valor.slice(0, 500)}…` : valor;
  }

  return valor;
}

export interface EntradaAuditoria {
  /** Verbo no formato "recurso.acao": "pessoa.excluir", "oracao.ler". */
  acao: string;
  alvoTipo?: string;
  alvoId?: string;
  detalhes?: Record<string, unknown>;
}

/**
 * Registra uma ação no log da igreja.
 *
 * Falha de auditoria NÃO derruba a operação: se o log quebrar, o pastor ainda
 * consegue cadastrar o membro. A alternativa (falhar a operação) transformaria
 * um problema de observabilidade em indisponibilidade.
 *
 * A contrapartida é que uma falha silenciosa aqui cria um ponto cego. Por
 * isso o erro vai para o log da aplicação — ver `logger.erro`.
 */
export async function auditar(
  ctx: ContextoAutorizado,
  entrada: EntradaAuditoria,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: ctx.tenant.id,
        atorUserId: ctx.sessao.userId,
        atorNome: ctx.sessao.nome,
        atorPapel: ctx.papel,
        impersonadoPor: ctx.sessao.impersonadoPor,
        acao: entrada.acao.slice(0, 80),
        alvoTipo: entrada.alvoTipo?.slice(0, 60),
        alvoId: entrada.alvoId?.slice(0, 60),
        detalhes: entrada.detalhes
          ? (mascarar(entrada.detalhes) as object)
          : undefined,
        ipHash: await ipHashAtual(),
        userAgent: await userAgentAtual(),
      },
    });
  } catch (erro) {
    console.error("[auditoria] falha ao gravar", {
      acao: entrada.acao,
      tenantId: ctx.tenant.id,
      // Só a mensagem, nunca o objeto de erro inteiro — ele carrega a query
      // com os parâmetros, ou seja, dados pessoais.
      erro: erro instanceof Error ? erro.message : "desconhecido",
    });
  }
}

/**
 * Auditoria da PLATAFORMA (ações do super admin).
 * Tabela separada para que nenhum admin de igreja consiga lê-la.
 */
export async function auditarPlataforma(entrada: {
  atorUserId?: string;
  atorEmail?: string;
  acao: string;
  alvoTipo?: string;
  alvoId?: string;
  detalhes?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        atorUserId: entrada.atorUserId,
        atorEmail: entrada.atorEmail,
        acao: entrada.acao.slice(0, 80),
        alvoTipo: entrada.alvoTipo?.slice(0, 60),
        alvoId: entrada.alvoId?.slice(0, 60),
        detalhes: entrada.detalhes ? (mascarar(entrada.detalhes) as object) : undefined,
        ipHash: await ipHashAtual(),
      },
    });
  } catch (erro) {
    console.error("[auditoria-plataforma] falha ao gravar", {
      acao: entrada.acao,
      erro: erro instanceof Error ? erro.message : "desconhecido",
    });
  }
}

/**
 * Auditoria de eventos de AUTENTICAÇÃO, que acontecem antes de existir
 * contexto autorizado (login, falha de login, reset de senha).
 */
export async function auditarAutenticacao(entrada: {
  acao: "login.sucesso" | "login.falha" | "logout" | "senha.reset.solicitado" | "senha.reset.concluido" | "senha.alterada";
  email?: string;
  userId?: string;
  tenantId?: string | null;
  motivo?: string;
}): Promise<void> {
  try {
    const dados = {
      atorUserId: entrada.userId,
      atorEmail: entrada.email?.slice(0, 254),
      acao: entrada.acao,
      alvoTipo: "auth",
      detalhes: entrada.motivo ? { motivo: entrada.motivo } : undefined,
      ipHash: await ipHashAtual(),
    };

    // Eventos de autenticação vão SEMPRE para o log da plataforma (é onde a
    // investigação de invasão começa) e, quando há igreja, também para o log
    // dela — o admin da igreja tem direito de ver os logins do próprio time.
    await prisma.platformAuditLog.create({ data: dados });

    if (entrada.tenantId) {
      await prisma.auditLog.create({
        data: {
          tenantId: entrada.tenantId,
          atorUserId: entrada.userId,
          atorNome: entrada.email?.slice(0, 160),
          acao: entrada.acao,
          alvoTipo: "auth",
          detalhes: entrada.motivo ? { motivo: entrada.motivo } : undefined,
          ipHash: await ipHashAtual(),
          userAgent: await userAgentAtual(),
        },
      });
    }
  } catch (erro) {
    console.error("[auditoria-auth] falha ao gravar", {
      acao: entrada.acao,
      erro: erro instanceof Error ? erro.message : "desconhecido",
    });
  }
}
