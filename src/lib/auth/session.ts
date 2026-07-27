import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { gerarToken, hashToken } from "@/lib/crypto";
import { isProd } from "@/lib/env";
import { ipHashAtual, userAgentAtual } from "@/lib/http/contexto";
import type { Papel } from "@prisma/client";

/**
 * Sessões opacas e revogáveis.
 *
 * POR QUE NÃO JWT
 * JWT é atraente porque não precisa consultar o banco. Esse é exatamente o
 * problema: não dá para revogar. Se um pastor for demitido, ou um notebook
 * for roubado, ou um token vazar num log, o JWT continua válido até expirar.
 * Num sistema que guarda pedido de oração sobre doença e crise conjugal, isso
 * é inaceitável.
 *
 * O custo é uma consulta indexada por requisição autenticada — irrelevante
 * para 90 usuários simultâneos, e deduplicada por requisição com `cache()`.
 *
 * O QUE FICA NO BANCO
 * Apenas o HMAC do token. Um dump do banco não permite montar cookie válido.
 */

const NOME_COOKIE = isProd ? "__Host-discipular-sessao" : "discipular-sessao";

/** 8 horas. Curto o bastante para limitar o dano de uma sessão sequestrada. */
const DURACAO_SEGUNDOS = 8 * 60 * 60;

/**
 * Renovação deslizante: se a sessão foi usada nos últimos 30 minutos, não
 * gravamos nada. Sem essa folga, cada requisição viraria um UPDATE, e com 90
 * usuários ativos isso seria escrita constante no mesmo punhado de linhas.
 */
const INTERVALO_RENOVACAO_MS = 30 * 60 * 1000;

export interface SessaoAtual {
  sessaoId: string;
  userId: string;
  email: string;
  nome: string;
  plataformaAdmin: boolean;
  /** Igreja ativa. Null quando o usuário está na área da plataforma. */
  tenantId: string | null;
  /** Papel do usuário NA igreja ativa. Null se não houver igreja ativa. */
  papel: Papel | null;
  /** Célula que o usuário lidera, quando papel = LIDER_CELULA. */
  celulaId: string | null;
  /** E-mail do super admin, quando esta é uma sessão de impersonação. */
  impersonadoPor: string | null;
  expiraEm: Date;
}

// -----------------------------------------------------------------------------
// Criação
// -----------------------------------------------------------------------------

export async function criarSessao(params: {
  userId: string;
  tenantId: string | null;
  impersonadoPor?: string | null;
}): Promise<{ token: string; expiraEm: Date }> {
  const token = gerarToken(32);
  const expiraEm = new Date(Date.now() + DURACAO_SEGUNDOS * 1000);

  await prisma.sessao.create({
    data: {
      tokenHash: hashToken(token),
      userId: params.userId,
      tenantAtivoId: params.tenantId,
      impersonadoPor: params.impersonadoPor ?? null,
      ipHash: await ipHashAtual(),
      userAgent: await userAgentAtual(),
      expiraEm,
    },
  });

  const jar = await cookies();
  jar.set(NOME_COOKIE, token, {
    // Inacessível a JavaScript: um XSS não consegue ler a sessão.
    httpOnly: true,
    // Só trafega em HTTPS.
    secure: isProd,
    /**
     * Lax e não Strict: com Strict, quem clica num link do WhatsApp para o
     * site da igreja chegaria deslogado, o que faria o usuário achar que o
     * sistema está quebrado. Lax já bloqueia POST cross-site, que é o vetor
     * de CSRF que importa — e temos mais duas camadas além dele.
     */
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SEGUNDOS,
  });

  return { token, expiraEm };
}

// -----------------------------------------------------------------------------
// Leitura
// -----------------------------------------------------------------------------

/**
 * Sessão atual, ou null.
 *
 * Deduplicada por requisição: um layout + 5 componentes que chamam isto
 * geram UMA consulta, não seis.
 */
export const sessaoAtual = cache(async (): Promise<SessaoAtual | null> => {
  const jar = await cookies();
  const token = jar.get(NOME_COOKIE)?.value;
  if (!token) return null;

  // Busca pelo HASH. O token em claro nunca vai para uma cláusula WHERE
  // que possa acabar num log de query lenta do Postgres.
  const sessao = await prisma.sessao.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      tenantAtivoId: true,
      impersonadoPor: true,
      criadaEm: true,
      expiraEm: true,
      revogadaEm: true,
      ultimoUsoEm: true,
      user: {
        select: {
          id: true,
          email: true,
          nome: true,
          ativo: true,
          plataformaAdmin: true,
          senhaAtualizadaEm: true,
        },
      },
    },
  });

  if (!sessao) return null;
  if (sessao.revogadaEm) return null;
  if (sessao.expiraEm <= new Date()) return null;

  // Conta desativada derruba a sessão imediatamente, sem esperar expirar.
  if (!sessao.user.ativo) return null;

  /**
   * Sessões anteriores à última troca de senha são inválidas.
   *
   * É isto que faz "trocar a senha" realmente expulsar o invasor: sem esta
   * checagem, quem já estava logado continuaria logado depois de a vítima
   * trocar a senha, que é justamente a reação de quem percebe a invasão.
   */
  if (sessao.criadaEm < sessao.user.senhaAtualizadaEm) {
    return null;
  }

  // Papel na igreja ativa. Consultado a cada requisição, e não guardado no
  // cookie: revogar o acesso de alguém precisa ter efeito imediato, não só
  // no próximo login.
  let papel: Papel | null = null;
  let celulaId: string | null = null;

  if (sessao.tenantAtivoId) {
    const membership = await prisma.membership.findUnique({
      where: {
        tenantId_userId: { tenantId: sessao.tenantAtivoId, userId: sessao.userId },
      },
      select: { papel: true, ativo: true, celulaId: true },
    });

    // Membership removido ou desativado: a sessão perde o tenant ativo.
    // A sessão em si continua (o usuário pode ter outras igrejas), mas ele
    // não enxerga mais nada desta.
    if (!membership || !membership.ativo) {
      // Exceção: super admin em impersonação legítima.
      if (!(sessao.user.plataformaAdmin && sessao.impersonadoPor)) {
        return {
          sessaoId: sessao.id,
          userId: sessao.userId,
          email: sessao.user.email,
          nome: sessao.user.nome,
          plataformaAdmin: sessao.user.plataformaAdmin,
          tenantId: null,
          papel: null,
          celulaId: null,
          impersonadoPor: sessao.impersonadoPor,
          expiraEm: sessao.expiraEm,
        };
      }
    } else {
      papel = membership.papel;
      celulaId = membership.celulaId;
    }
  }

  // Renovação deslizante, com folga para não escrever a cada requisição.
  const agora = Date.now();
  if (agora - sessao.ultimoUsoEm.getTime() > INTERVALO_RENOVACAO_MS) {
    // Sem await: prolongar a sessão não precisa bloquear a renderização.
    void prisma.sessao
      .update({
        where: { id: sessao.id },
        data: {
          ultimoUsoEm: new Date(agora),
          expiraEm: new Date(agora + DURACAO_SEGUNDOS * 1000),
        },
      })
      .catch(() => {
        /* falha em renovar não deve derrubar a requisição */
      });
  }

  return {
    sessaoId: sessao.id,
    userId: sessao.userId,
    email: sessao.user.email,
    nome: sessao.user.nome,
    plataformaAdmin: sessao.user.plataformaAdmin,
    tenantId: sessao.tenantAtivoId,
    papel,
    celulaId,
    impersonadoPor: sessao.impersonadoPor,
    expiraEm: sessao.expiraEm,
  };
});

// -----------------------------------------------------------------------------
// Encerramento
// -----------------------------------------------------------------------------

/** Logout: revoga no banco E limpa o cookie. Só limpar o cookie deixaria a
 *  sessão viva para quem tivesse copiado o token. */
export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(NOME_COOKIE)?.value;

  if (token) {
    await prisma.sessao
      .updateMany({
        where: { tokenHash: hashToken(token), revogadaEm: null },
        data: { revogadaEm: new Date() },
      })
      .catch(() => {});
  }

  jar.delete(NOME_COOKIE);
}

/** Revoga TODAS as sessões de um usuário. Usado na troca de senha e no
 *  botão "sair de todos os dispositivos". */
export async function revogarTodasSessoes(userId: string, exceto?: string): Promise<number> {
  const { count } = await prisma.sessao.updateMany({
    where: {
      userId,
      revogadaEm: null,
      ...(exceto ? { id: { not: exceto } } : {}),
    },
    data: { revogadaEm: new Date() },
  });
  return count;
}

/** Troca a igreja ativa da sessão, revalidando o vínculo. */
export async function trocarTenantAtivo(sessaoId: string, tenantId: string, userId: string): Promise<boolean> {
  // A validação do membership é feita AQUI, no servidor. Se confiássemos no
  // tenantId enviado pelo cliente, qualquer usuário entraria em qualquer
  // igreja só trocando o valor no formulário.
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { ativo: true },
  });

  if (!membership?.ativo) return false;

  await prisma.sessao.update({
    where: { id: sessaoId },
    data: { tenantAtivoId: tenantId },
  });
  return true;
}

/** Remove sessões vencidas. Chamado pela rotina de manutenção. */
export async function limparSessoesVencidas(): Promise<number> {
  const { count } = await prisma.sessao.deleteMany({
    where: {
      OR: [
        { expiraEm: { lt: new Date() } },
        { revogadaEm: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return count;
}
