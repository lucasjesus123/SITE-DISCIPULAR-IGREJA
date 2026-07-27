import { promises as dns } from "node:dns";
import { prisma } from "@/lib/db/prisma";
import { gerarToken } from "@/lib/crypto";
import { logger } from "@/lib/logger";

/**
 * Vinculação de domínio próprio do cliente.
 *
 * É o recurso que o cliente mais quer ("coloco meu domínio e vira meu site")
 * e o que mais precisa de cuidado, porque um domínio mal vinculado é
 * sequestro de tráfego.
 *
 * O ATAQUE QUE ISTO IMPEDE
 * Sem verificação, o dono da Igreja A cadastra `igrejab.com.br` na conta dele.
 * Se um dia a Igreja B apontar o DNS para a nossa plataforma — ou se ela já
 * for cliente e o cadastro ficar duplicado — o tráfego dela passa a servir o
 * conteúdo da Igreja A. Pior: cookies de sessão emitidos naquele domínio
 * ficam acessíveis à configuração do atacante.
 *
 * A DEFESA
 * 1. `hostname` é UNIQUE GLOBAL na tabela: um domínio nunca pertence a dois.
 * 2. Nada é servido enquanto o status não for VERIFICADO.
 * 3. A verificação exige um registro TXT em `_discipular.<dominio>` com um
 *    token que só quem controla o DNS consegue publicar.
 */

export interface ResultadoVerificacao {
  verificado: boolean;
  mensagem: string;
  /** O que o cliente precisa publicar no DNS. */
  registroEsperado?: { nome: string; tipo: "TXT"; valor: string };
}

/** Cadastra um domínio como PENDENTE e devolve as instruções de DNS. */
export async function cadastrarDominio(
  tenantId: string,
  hostname: string,
): Promise<{ ok: boolean; mensagem: string; token?: string }> {
  // Um domínio já cadastrado por OUTRO tenant não pode ser reivindicado.
  // A mensagem é genérica: dizer "este domínio já pertence a outra igreja"
  // confirmaria que aquela igreja é cliente da plataforma.
  const existente = await prisma.tenantDomain.findUnique({
    where: { hostname },
    select: { tenantId: true },
  });

  if (existente && existente.tenantId !== tenantId) {
    return { ok: false, mensagem: "Não foi possível cadastrar este domínio." };
  }

  if (existente) {
    return { ok: false, mensagem: "Este domínio já está cadastrado nesta igreja." };
  }

  const token = gerarToken(24);

  const jaTemPrincipal = await prisma.tenantDomain.count({
    where: { tenantId, principal: true },
  });

  await prisma.tenantDomain.create({
    data: {
      tenantId,
      hostname,
      tokenVerificacao: token,
      status: "PENDENTE",
      principal: jaTemPrincipal === 0,
    },
  });

  return { ok: true, mensagem: "Domínio cadastrado. Agora publique o registro DNS.", token };
}

/**
 * Consulta o DNS e verifica o token.
 *
 * A consulta é feita pelo NOSSO servidor, para um nome que nós construímos a
 * partir de um hostname já validado por regex. Não há entrada livre virando
 * consulta de rede — o que fecharia a porta para usar o servidor como
 * scanner interno.
 */
export async function verificarDominio(
  tenantId: string,
  dominioId: string,
): Promise<ResultadoVerificacao> {
  const dominio = await prisma.tenantDomain.findFirst({
    where: { id: dominioId, tenantId },
    select: { id: true, hostname: true, tokenVerificacao: true, status: true },
  });

  if (!dominio) {
    return { verificado: false, mensagem: "Domínio não encontrado." };
  }

  const nomeRegistro = `_discipular.${dominio.hostname}`;
  const valorEsperado = `discipular-verificacao=${dominio.tokenVerificacao}`;

  const registroEsperado = {
    nome: nomeRegistro,
    tipo: "TXT" as const,
    valor: valorEsperado,
  };

  // Revalidação do formato antes de consultar. O hostname já passou pelo
  // schema Zod na entrada, mas ele pode ter vindo do banco por outro caminho.
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(dominio.hostname)) {
    return { verificado: false, mensagem: "Domínio em formato inválido.", registroEsperado };
  }

  try {
    // Timeout: uma consulta DNS pendurada seguraria o worker.
    const registros = await Promise.race([
      dns.resolveTxt(nomeRegistro),
      new Promise<never>((_, rejeitar) =>
        setTimeout(() => rejeitar(new Error("timeout")), 5_000),
      ),
    ]);

    // Cada registro TXT vem como array de fragmentos (limite de 255 bytes
    // por string do protocolo); precisamos juntá-los antes de comparar.
    const valores = registros.map((partes) => partes.join(""));

    if (valores.some((v) => v.trim() === valorEsperado)) {
      await prisma.$transaction([
        prisma.tenantDomain.update({
          where: { id: dominio.id },
          data: { status: "VERIFICADO", verificadoEm: new Date(), ultimoErro: null },
        }),
      ]);

      return {
        verificado: true,
        mensagem: "Domínio verificado. Ele já está servindo o site da igreja.",
      };
    }

    await prisma.tenantDomain.update({
      where: { id: dominio.id },
      data: { ultimoErro: "Registro TXT encontrado, mas o valor não confere." },
    });

    return {
      verificado: false,
      mensagem:
        "Encontramos o registro, mas o valor não confere. Confira se copiou o texto inteiro.",
      registroEsperado,
    };
  } catch (erro) {
    const codigo = (erro as { code?: string }).code;

    const mensagem =
      codigo === "ENOTFOUND" || codigo === "ENODATA"
        ? "Ainda não encontramos o registro. A propagação do DNS pode levar algumas horas."
        : "Não conseguimos consultar o DNS agora. Tente novamente em alguns minutos.";

    await prisma.tenantDomain
      .update({
        where: { id: dominio.id },
        data: { status: "ERRO", ultimoErro: mensagem.slice(0, 500) },
      })
      .catch(() => {});

    logger.aviso("Falha ao verificar domínio", { dominioId, codigo });

    return { verificado: false, mensagem, registroEsperado };
  }
}

/** Define qual domínio é o principal do tenant (usado em links e no PWA). */
export async function definirPrincipal(tenantId: string, dominioId: string): Promise<boolean> {
  const dominio = await prisma.tenantDomain.findFirst({
    where: { id: dominioId, tenantId, status: "VERIFICADO" },
    select: { id: true },
  });

  // Só domínio VERIFICADO pode ser principal: caso contrário os links
  // canônicos e o e-mail apontariam para um endereço que não responde.
  if (!dominio) return false;

  await prisma.$transaction([
    prisma.tenantDomain.updateMany({ where: { tenantId }, data: { principal: false } }),
    prisma.tenantDomain.update({ where: { id: dominioId }, data: { principal: true } }),
  ]);

  return true;
}

export async function removerDominio(tenantId: string, dominioId: string): Promise<boolean> {
  const { count } = await prisma.tenantDomain.deleteMany({
    where: { id: dominioId, tenantId },
  });
  return count > 0;
}
