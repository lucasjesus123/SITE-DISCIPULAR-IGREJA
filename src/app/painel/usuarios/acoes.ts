"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Papel } from "@prisma/client";

import { auditar } from "@/lib/audit";
import { hashSenha, SenhaFracaError, verificacaoFalsa } from "@/lib/auth/password";
import { exigirPermissao, papeisAtribuiveis, type ContextoAutorizado } from "@/lib/auth/rbac";
import { solicitarReset } from "@/lib/auth/recuperacao";
import { gerarToken } from "@/lib/crypto";
// Uso auditado (SEC-006): apenas modelos GLOBAIS (Tenant/User/Membership/Sessao),
// sempre com tenantId à mão ou alvo resolvido no escopo antes de mutar. Ver AUDITORIA_SEGURANCA.md §5.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/db/prisma";
import { enviarEmail, escaparHtml } from "@/lib/email/enviar";
import { isProd } from "@/lib/env";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite, type RegraLimite } from "@/lib/security/rate-limit";
import {
  email as emailSchema,
  id as idSchema,
  idOpcional,
  nomePessoa,
} from "@/lib/validation/comum";

/**
 * =============================================================================
 * GESTÃO DE USUÁRIOS DA IGREJA (Membership)
 * =============================================================================
 *
 * ESTA É A TELA QUE DEFINE QUEM PODE O QUÊ.
 *
 * Todas as outras telas do painel confiam no `papel` gravado em `Membership`.
 * Logo, quem controla esta tela controla o sistema inteiro: uma falha aqui não
 * vaza um registro, ela entrega o painel. Por isso cada trava abaixo está
 * comentada com o ataque concreto que ela impede.
 *
 * ATENÇÃO A UM DETALHE DE ARQUITETURA QUE É FÁCIL ERRAR
 * `Membership`, `User` e `Sessao` são modelos GLOBAIS (ver a classificação em
 * src/lib/db/tenant-client.ts). O cliente escopado NÃO injeta `tenantId` neles:
 * ele os deixa passar direto. Ou seja, aqui o filtro por igreja é
 * responsabilidade EXPLÍCITA de cada consulta — e é por isso que todo `where`
 * deste arquivo carrega `tenantId: ctx.tenant.id` escrito à mão, com o id vindo
 * de `exigirPermissao()` (que o resolve pelo hostname), nunca de um argumento.
 *
 * Um `prisma.membership.findUnique({ where: { id } })` sem o tenantId seria um
 * IDOR direto: bastaria colar o id de um membership de outra igreja para
 * promovê-lo, rebaixá-lo ou removê-lo.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
}

const PAPEIS = ["ADMIN", "PASTOR", "SECRETARIA", "LIDER_CELULA", "MEMBRO"] as const;

/**
 * Rate limit próprio para o convite.
 *
 * O balde genérico do painel (120/min) é folgado demais para esta ação: o
 * convite cria conta na plataforma e dispara e-mail para um endereço escolhido
 * por quem chama. Sem um teto apertado, a tela vira duas coisas ruins de uma
 * vez — uma máquina de spam com a reputação do nosso domínio, e uma forma
 * barata de sondar quais e-mails já existem observando o tempo de resposta.
 */
const REGRA_CONVITE: RegraLimite = {
  escopo: "convite-usuario",
  maximo: 10,
  janelaSegundos: 600,
  bloqueioSegundos: 1_800,
};

/**
 * Resposta ÚNICA do convite, usada tanto quando criamos uma conta nova quanto
 * quando apenas vinculamos uma conta que já existia na plataforma.
 *
 * POR QUE A MENSAGEM É A MESMA NOS DOIS CASOS
 * `User` é global: a mesma pessoa pode pastorear duas igrejas. Se o retorno
 * dissesse "conta criada" em um caso e "usuário já existia" no outro, o admin
 * de QUALQUER igreja poderia varrer uma lista de e-mails e descobrir quem tem
 * conta na plataforma — e, com isso, quem frequenta alguma igreja. Convicção
 * religiosa é dado pessoal SENSÍVEL na LGPD; esse oráculo é vazamento, não
 * detalhe de usabilidade.
 *
 * A diferença de comportamento existe (uma conta nova recebe link para definir
 * senha; uma conta existente recebe só o aviso de acesso), mas ela acontece na
 * caixa de entrada da pessoa convidada — que é quem tem direito de saber.
 */
const MENSAGEM_CONVITE =
  "Acesso concedido. Enviamos as instruções de entrada para o e-mail informado. " +
  "Nenhuma senha é exibida nesta tela nem repassada por outro canal.";

// -----------------------------------------------------------------------------
// Convidar
// -----------------------------------------------------------------------------

const schemaConvite = z.object({
  nome: nomePessoa,
  email: emailSchema,
  papel: z.enum(PAPEIS),
  /** Obrigatório apenas para LIDER_CELULA — é o recorte de visão dele. */
  celulaId: idOpcional,
});

export async function convidarUsuario(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("usuarios.gerenciar");

    const limite = await verificarLimite(REGRA_CONVITE, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return {
        ok: false,
        mensagem: `Muitos convites seguidos. Tente novamente em ${limite.tentarEmSegundos}s.`,
      };
    }

    const dados = schemaConvite.parse(dadosBrutos);

    /**
     * TRAVA 1 — ANTI-ESCALONAMENTO DE PRIVILÉGIO
     *
     * `papeisAtribuiveis(ctx.papel)` é a lista fechada do que ESTE ator pode
     * conceder. Sem ela, um PASTOR (que tem `usuarios.ler`, e num futuro
     * ajuste da matriz poderia ganhar `usuarios.gerenciar`) convidaria um
     * e-mail próprio como ADMIN e passaria a ter acesso a faturamento,
     * configurações e exclusão de dados. É o caminho mais curto de "conta
     * comprometida de pastor" para "controle total da igreja".
     */
    const atribuiveis = papeisAtribuiveis(ctx.papel);
    if (!atribuiveis.includes(dados.papel)) {
      return {
        ok: false,
        mensagem: "Você não pode conceder este papel.",
        campos: { papel: ["Papel fora do seu alcance."] },
      };
    }

    const celulaId = await resolverCelula(ctx, dados.papel, dados.celulaId);
    if (celulaId.erro) return celulaId.erro;

    /**
     * TRAVA 2 — LIMITE DE USUÁRIOS DO PLANO
     *
     * O teto vive em `Tenant.limiteUsuarios`, que só a plataforma edita. Sem
     * esta checagem, a tela de convites seria o caminho para uma igreja no
     * plano Essencial operar com 40 usuários — e, como cada usuário ativo é
     * sessão, consulta e escrita numa VPS compartilhada, o custo cairia sobre
     * as outras igrejas.
     *
     * A contagem é refeita DENTRO da transação mais abaixo: duas requisições
     * simultâneas passariam por uma checagem feita aqui fora.
     */
    const tenant = await prisma.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { limiteUsuarios: true, nome: true },
    });
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };

    const usuario = await prisma.user.findUnique({
      where: { email: dados.email },
      select: { id: true, ativo: true },
    });

    /**
     * Vínculo já existente NESTA igreja.
     *
     * Dizer isto NÃO contradiz a mensagem neutra: quem está olhando esta tela
     * já enxerga a lista de membros da própria igreja. O que não podemos
     * revelar é a existência da conta na PLATAFORMA — ou seja, em igrejas das
     * quais este admin não participa.
     */
    if (usuario) {
      const jaVinculado = await prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: ctx.tenant.id, userId: usuario.id } },
        select: { ativo: true },
      });
      if (jaVinculado) {
        return {
          ok: false,
          mensagem: jaVinculado.ativo
            ? "Esta pessoa já tem acesso a esta igreja."
            : "Esta pessoa já está na lista com o acesso desativado. Reative em vez de convidar de novo.",
        };
      }
    }

    /**
     * O hash da senha temporária é calculado FORA da transação.
     *
     * `hashSenha` gasta ~100ms de CPU de propósito (scrypt memory-hard). Dentro
     * de uma transação isso seguraria uma conexão do pool por todo esse tempo —
     * e o pool é o recurso mais escasso quando a igreja inteira usa o sistema
     * no domingo à noite.
     */
    const senhaHash = usuario ? null : (await gerarCredencialTemporaria()).hash;

    const { membershipId, userId, contaCriada, estourouLimite } = await prisma.$transaction(
      async (tx) => {
        const ativos = await tx.membership.count({
          where: { tenantId: ctx.tenant.id, ativo: true },
        });
        if (ativos >= tenant.limiteUsuarios) {
          return { membershipId: "", userId: "", contaCriada: false, estourouLimite: true };
        }

        let alvo = usuario;
        if (!alvo) {
          // Só chega aqui quando o hash foi gerado acima. A checagem existe
          // para que uma futura reordenação do código quebre no compilador em
          // vez de gravar um usuário com credencial vazia.
          if (senhaHash === null) throw new Error("Credencial temporária ausente.");

          alvo = await tx.user.create({
            data: {
              email: dados.email,
              nome: dados.nome,
              senhaHash,
              // Nasce "recém-alterada": qualquer sessão anterior (não deve
              // haver nenhuma) já seria recusada por `sessaoAtual()`.
              senhaAtualizadaEm: new Date(),
            },
            select: { id: true, ativo: true },
          });
        }

        const membership = await tx.membership.create({
          data: {
            tenantId: ctx.tenant.id,
            userId: alvo.id,
            papel: dados.papel,
            celulaId: celulaId.valor,
            ativo: true,
          },
          select: { id: true },
        });

        return {
          membershipId: membership.id,
          userId: alvo.id,
          contaCriada: usuario === null,
          estourouLimite: false,
        };
      },
    );

    if (estourouLimite) {
      return {
        ok: false,
        mensagem:
          `O plano desta igreja permite ${tenant.limiteUsuarios} usuários ativos. ` +
          `Desative alguém que não usa mais o painel ou fale com o suporte para ampliar o plano.`,
      };
    }

    if (contaCriada) {
      /**
       * Conta nova: a senha temporária existe apenas como hash no banco e
       * morre com esta função. Em vez de exibi-la para o admin (que a repassaria
       * por WhatsApp, onde ela ficaria guardada para sempre), disparamos o fluxo
       * normal de definição de senha: a pessoa prova o controle do e-mail e
       * escolhe a própria senha. O admin nunca conhece a credencial de ninguém.
       */
      await solicitarReset(dados.email, {
        host: ctx.tenant.hostCanonico,
        nomeIgreja: ctx.tenant.nome,
        tenantId: ctx.tenant.id,
      });
    } else {
      /**
       * Conta existente: não tocamos na senha. Redefinir a credencial de alguém
       * porque ele foi adicionado a mais uma igreja seria sequestro de conta
       * disfarçado de provisionamento — e daria a um admin de igreja um caminho
       * para tomar a conta de um pastor que serve em outra.
       *
       * Aqui o `verificacaoFalsa()` iguala o tempo de CPU ao do caminho que
       * criou conta (scrypt). Sem ele, a diferença de latência entre os dois
       * caminhos responderia justamente a pergunta que a mensagem neutra se
       * recusa a responder.
       */
      await verificacaoFalsa();
      void avisarAcessoConcedido(dados.email, ctx.tenant.nome, ctx.tenant.hostCanonico);
    }

    await auditar(ctx, {
      acao: "usuario.convidar",
      alvoTipo: "Membership",
      alvoId: membershipId,
      // Sem e-mail e sem nome: `mascarar()` já removeria o e-mail, mas a
      // auditoria não precisa deles — o `alvoUserId` resolve a identidade para
      // quem tem acesso legítimo ao banco.
      detalhes: { alvoUserId: userId, papel: dados.papel, celulaId: celulaId.valor, contaCriada },
    });

    revalidatePath("/painel/usuarios");

    return { ok: true, mensagem: MENSAGEM_CONVITE };
  } catch (erro) {
    return traduzirErro(erro, "convidarUsuario");
  }
}

// -----------------------------------------------------------------------------
// Alterar papel
// -----------------------------------------------------------------------------

const schemaPapel = z.object({
  papel: z.enum(PAPEIS),
  celulaId: idOpcional,
});

export async function alterarPapelUsuario(
  membershipIdBruto: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("usuarios.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const membershipId = idSchema.parse(membershipIdBruto);
    const dados = schemaPapel.parse(dadosBrutos);

    const alvo = await carregarMembership(ctx, membershipId);
    if (!alvo) return { ok: false, mensagem: "Registro não encontrado." };

    /**
     * TRAVA — NINGUÉM ALTERA O PRÓPRIO PAPEL
     *
     * Sem isto, "alterar papel" seria autopromoção com um clique: uma
     * SECRETARIA que ganhasse acesso a esta tela por engano de configuração se
     * tornaria ADMIN, e um ADMIN que perdesse a confiança da igreja poderia
     * blindar a si mesmo. Mudança de papel é sempre decisão de OUTRA pessoa —
     * é o mesmo princípio de não se aprovar o próprio pagamento.
     */
    if (alvo.userId === ctx.sessao.userId) {
      return {
        ok: false,
        mensagem: "Você não pode alterar o seu próprio papel. Peça a outro administrador.",
      };
    }

    /**
     * TRAVA — AUTORIDADE SOBRE OS DOIS LADOS DA MUDANÇA
     *
     * Verificamos o papel NOVO (não conceder acima do próprio nível) e também o
     * papel ATUAL do alvo. A segunda metade é a que costuma faltar: sem ela,
     * quem não pode CRIAR um ADMIN ainda conseguiria REBAIXAR um — trancando o
     * administrador legítimo para fora e assumindo a igreja por eliminação.
     */
    const atribuiveis = papeisAtribuiveis(ctx.papel);
    if (!atribuiveis.includes(dados.papel) || !atribuiveis.includes(alvo.papel)) {
      return { ok: false, mensagem: "Você não tem permissão para alterar este usuário." };
    }

    const celula = await resolverCelula(ctx, dados.papel, dados.celulaId);
    if (celula.erro) return celula.erro;

    /**
     * TRAVA — O ÚLTIMO ADMIN ATIVO NÃO PODE SER REBAIXADO
     *
     * Uma igreja sem nenhum ADMIN ativo perde para sempre o acesso a usuários,
     * configurações e auditoria do próprio painel: não sobra ninguém capaz de
     * promover alguém de volta. Recuperar isso exigiria intervenção manual do
     * fornecedor no banco — exatamente o tipo de acesso que o resto do sistema
     * trabalha para tornar excepcional e auditado.
     */
    if (alvo.papel === "ADMIN" && dados.papel !== "ADMIN" && alvo.ativo) {
      const outros = await contarAdminsAtivos(ctx.tenant.id, membershipId);
      if (outros === 0) {
        return {
          ok: false,
          mensagem:
            "Este é o último administrador ativo da igreja. Promova outra pessoa a administrador antes de rebaixar esta.",
        };
      }
    }

    await prisma.membership.update({
      where: { id: alvo.id },
      data: {
        papel: dados.papel,
        // Sair de LIDER_CELULA limpa a célula: um `celulaId` esquecido num
        // membership de outro papel é lixo que confunde `filtroDeEscopo()` na
        // próxima vez que a pessoa voltar a liderar.
        celulaId: celula.valor,
      },
    });

    /**
     * Não revogamos sessões aqui de propósito.
     *
     * `sessaoAtual()` relê o `Membership` a CADA requisição — o papel não fica
     * guardado no cookie justamente para que rebaixamento tenha efeito
     * imediato, inclusive nas abas já abertas. Revogar seria redundante e
     * derrubaria alguém no meio de um cadastro sem necessidade.
     */

    await auditar(ctx, {
      acao: "usuario.alterarPapel",
      alvoTipo: "Membership",
      alvoId: alvo.id,
      detalhes: {
        alvoUserId: alvo.userId,
        papelAnterior: alvo.papel,
        papelNovo: dados.papel,
        celulaId: celula.valor,
      },
    });

    revalidatePath("/painel/usuarios");

    return { ok: true, mensagem: "Papel atualizado." };
  } catch (erro) {
    return traduzirErro(erro, "alterarPapelUsuario");
  }
}

// -----------------------------------------------------------------------------
// Ativar / desativar
// -----------------------------------------------------------------------------

export async function alterarAtivacaoUsuario(
  membershipIdBruto: string,
  ativoBruto: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("usuarios.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const membershipId = idSchema.parse(membershipIdBruto);
    const ativo = z.boolean().parse(ativoBruto);

    const alvo = await carregarMembership(ctx, membershipId);
    if (!alvo) return { ok: false, mensagem: "Registro não encontrado." };

    // Mesma trava do papel: desativar a si mesmo é como fechar a porta com a
    // chave dentro — e, se o ator for o único admin, tranca a igreja inteira.
    if (alvo.userId === ctx.sessao.userId) {
      return { ok: false, mensagem: "Você não pode desativar o seu próprio acesso." };
    }

    const atribuiveis = papeisAtribuiveis(ctx.papel);
    if (!atribuiveis.includes(alvo.papel)) {
      return { ok: false, mensagem: "Você não tem permissão para alterar este usuário." };
    }

    // Trava do último admin: desativar tem o mesmo efeito prático de rebaixar.
    if (!ativo && alvo.papel === "ADMIN" && alvo.ativo) {
      const outros = await contarAdminsAtivos(ctx.tenant.id, membershipId);
      if (outros === 0) {
        return {
          ok: false,
          mensagem:
            "Este é o último administrador ativo da igreja. Promova outra pessoa antes de desativar esta.",
        };
      }
    }

    await prisma.membership.update({ where: { id: alvo.id }, data: { ativo } });

    const sessoesRevogadas = ativo ? 0 : await revogarSessoesNoTenant(alvo.userId, ctx.tenant.id);

    await auditar(ctx, {
      acao: ativo ? "usuario.reativar" : "usuario.desativar",
      alvoTipo: "Membership",
      alvoId: alvo.id,
      detalhes: { alvoUserId: alvo.userId, papel: alvo.papel, sessoesRevogadas },
    });

    revalidatePath("/painel/usuarios");

    return {
      ok: true,
      mensagem: ativo
        ? "Acesso reativado."
        : `Acesso desativado${sessoesRevogadas > 0 ? ` e ${sessoesRevogadas} sessão(ões) encerrada(s)` : ""}.`,
    };
  } catch (erro) {
    return traduzirErro(erro, "alterarAtivacaoUsuario");
  }
}

// -----------------------------------------------------------------------------
// Remover
// -----------------------------------------------------------------------------

export async function removerUsuario(membershipIdBruto: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("usuarios.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const membershipId = idSchema.parse(membershipIdBruto);

    const alvo = await carregarMembership(ctx, membershipId);
    if (!alvo) return { ok: false, mensagem: "Registro não encontrado." };

    if (alvo.userId === ctx.sessao.userId) {
      return { ok: false, mensagem: "Você não pode remover o seu próprio acesso." };
    }

    const atribuiveis = papeisAtribuiveis(ctx.papel);
    if (!atribuiveis.includes(alvo.papel)) {
      return { ok: false, mensagem: "Você não tem permissão para remover este usuário." };
    }

    if (alvo.papel === "ADMIN" && alvo.ativo) {
      const outros = await contarAdminsAtivos(ctx.tenant.id, membershipId);
      if (outros === 0) {
        return {
          ok: false,
          mensagem:
            "Este é o último administrador ativo da igreja. Promova outra pessoa antes de remover esta.",
        };
      }
    }

    /**
     * Removemos o VÍNCULO, nunca a conta.
     *
     * `User` é global: a mesma pessoa pode servir em duas igrejas. Apagar a
     * conta porque uma igreja a dispensou destruiria o acesso dela à outra —
     * um admin de igreja teria, na prática, poder de exclusão sobre dados de
     * uma igreja que ele nem enxerga.
     */
    await prisma.membership.delete({ where: { id: alvo.id } });

    const sessoesRevogadas = await revogarSessoesNoTenant(alvo.userId, ctx.tenant.id);

    await auditar(ctx, {
      acao: "usuario.remover",
      alvoTipo: "Membership",
      alvoId: alvo.id,
      detalhes: { alvoUserId: alvo.userId, papel: alvo.papel, sessoesRevogadas },
    });

    revalidatePath("/painel/usuarios");

    return {
      ok: true,
      mensagem: `Acesso removido${sessoesRevogadas > 0 ? ` e ${sessoesRevogadas} sessão(ões) encerrada(s)` : ""}.`,
    };
  } catch (erro) {
    return traduzirErro(erro, "removerUsuario");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/**
 * Carrega um membership GARANTINDO que ele é desta igreja.
 *
 * O `tenantId` no `where` é o controle de acesso desta função inteira — sem
 * ele, `id` viria do cliente e serviria para promover, rebaixar ou remover
 * usuários de qualquer outra igreja da plataforma (IDOR clássico). E como
 * `Membership` é modelo global, o cliente escopado não corrige o esquecimento.
 *
 * Devolve `null` tanto para "não existe" quanto para "existe em outra igreja":
 * distinguir os dois transformaria a tela num oráculo de ids válidos.
 */
async function carregarMembership(
  ctx: ContextoAutorizado,
  membershipId: string,
): Promise<{ id: string; userId: string; papel: Papel; ativo: boolean } | null> {
  return prisma.membership.findFirst({
    where: { id: membershipId, tenantId: ctx.tenant.id },
    select: { id: true, userId: true, papel: true, ativo: true },
  });
}

/** Quantos ADMIN ativos a igreja tem, ignorando um membership específico. */
async function contarAdminsAtivos(tenantId: string, exceto: string): Promise<number> {
  return prisma.membership.count({
    where: { tenantId, papel: "ADMIN", ativo: true, id: { not: exceto } },
  });
}

/**
 * Revoga as sessões daquele usuário NAQUELA igreja.
 *
 * O recorte por `tenantAtivoId` é o ponto: quem serve em duas igrejas e é
 * removido de uma não pode ser deslogado da outra. Filtrar só por `userId`
 * daria a um admin de igreja o poder de derrubar a sessão de alguém em uma
 * igreja que ele não administra.
 *
 * Por que revogar, se `sessaoAtual()` já recusa o tenant quando o membership
 * some: porque a linha de sessão continua viva e voltaria a valer se o vínculo
 * fosse recriado depois. Revogar fecha essa janela e força reautenticação.
 */
async function revogarSessoesNoTenant(userId: string, tenantId: string): Promise<number> {
  const { count } = await prisma.sessao.updateMany({
    where: { userId, tenantAtivoId: tenantId, revogadaEm: null },
    data: { revogadaEm: new Date() },
  });
  return count;
}

/**
 * Valida a célula de um LIDER_CELULA.
 *
 * A consulta vai por `ctx.db` (escopado), então a célula é obrigatoriamente
 * desta igreja. Aceitar um `celulaId` sem conferir deixaria o membership
 * apontando para uma célula de outra igreja: o isolamento de dados continuaria
 * intacto (o escopo de tenant é aplicado em toda leitura), mas o líder ficaria
 * com um recorte que não corresponde a nada — vendo zero pessoas e abrindo
 * chamado de suporte, ou pior, sendo silenciosamente promovido a "vê a igreja
 * inteira" se alguém um dia relaxar `filtroDeEscopo()`.
 */
async function resolverCelula(
  ctx: ContextoAutorizado,
  papel: Papel,
  celulaId: string | undefined,
): Promise<{ valor: string | null; erro?: ResultadoAcao }> {
  if (papel !== "LIDER_CELULA") return { valor: null };

  if (!celulaId) {
    return {
      valor: null,
      erro: {
        ok: false,
        mensagem: "Escolha qual célula esta pessoa lidera.",
        campos: { celulaId: ["Obrigatório para líder de célula."] },
      },
    };
  }

  const celula = await ctx.db.celula.findFirst({
    where: { id: celulaId },
    select: { id: true },
  });

  if (!celula) {
    return {
      valor: null,
      erro: { ok: false, mensagem: "Célula não encontrada.", campos: { celulaId: ["Inválida."] } },
    };
  }

  return { valor: celula.id };
}

/**
 * Senha temporária e o hash dela, do mesmo sorteio.
 *
 * A senha em claro é descartada assim que o hash é calculado: ela nunca volta
 * para o chamador, nunca vai para a tela e nunca entra na auditoria. Serve
 * apenas para que a linha de `User` nasça com um `senhaHash` válido — o acesso
 * real acontece pelo link de definição de senha enviado por e-mail.
 */
async function gerarCredencialTemporaria(): Promise<{ hash: string }> {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const senha = `${gerarToken(9)}-${gerarToken(9)}`;
    try {
      return { hash: await hashSenha(senha) };
    } catch (erro) {
      // `hashSenha` aplica a política de senha. A chance de um valor aleatório
      // ser recusado é desprezível, mas "desprezível" não é "impossível" — e
      // falhar um convite por azar de sorteio seria um bug irreproduzível.
      if (!(erro instanceof SenhaFracaError)) throw erro;
    }
  }
  throw new Error("Não foi possível gerar uma senha temporária válida.");
}

/**
 * Aviso para quem JÁ tinha conta na plataforma.
 *
 * Sem link de ação e sem credencial: a pessoa entra com a senha que já usa. O
 * e-mail existe como alarme — se ela não esperava ganhar acesso a esta igreja,
 * acabou de descobrir que alguém a adicionou.
 *
 * Disparado sem `await` por quem chama: SMTP lento ou fora do ar não pode
 * transformar "conceder acesso" em erro na tela.
 */
async function avisarAcessoConcedido(
  para: string,
  nomeIgreja: string,
  host: string,
): Promise<void> {
  const link = `${isProd ? "https" : "http"}://${host}/login`;

  await enviarEmail({
    para,
    assunto: `Você recebeu acesso ao painel — ${nomeIgreja}`,
    texto: [
      `Você foi adicionado à equipe de ${nomeIgreja} no Discipular.`,
      ``,
      `Entre em ${link} com o e-mail e a senha que você já usa.`,
      `Sua senha não foi alterada e ninguém desta igreja tem acesso a ela.`,
      ``,
      `Se você não esperava isto, procure o responsável pela igreja.`,
    ].join("\n"),
    html: [
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#0B0D11;max-width:520px;margin:0 auto;padding:24px">`,
      `<h1 style="font-size:20px;margin:0 0 16px">Você recebeu acesso ao painel</h1>`,
      // `escaparHtml` em todo dado que veio de um formulário: o nome da igreja
      // é editável pelo cliente, e sem escape viraria HTML dentro do e-mail.
      `<p style="margin:0 0 16px">Você foi adicionado à equipe de <strong>${escaparHtml(nomeIgreja)}</strong> no Discipular.</p>`,
      `<p style="margin:0 0 16px">Entre em <a href="${escaparHtml(link)}">${escaparHtml(link)}</a> com o e-mail e a senha que você já usa. Sua senha não foi alterada.</p>`,
      `<p style="margin:0;font-size:14px;color:#4a4a4a">Se você não esperava isto, procure o responsável pela igreja.</p>`,
      `</div>`,
    ].join(""),
  }).catch(() => {
    /* `enviarEmail` não lança; o catch garante que a promessa solta nunca
       vire "unhandled rejection". */
  });
}

/**
 * Traduz exceções para uma resposta segura.
 *
 * Nada de mensagem do Prisma, nome de constraint ou stack trace chega ao
 * navegador. Em especial, P2002 nesta tela seria "e-mail já cadastrado" — que é
 * exatamente o oráculo que `MENSAGEM_CONVITE` existe para evitar.
 */
function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const problema of erro.issues) {
      (campos[problema.path.join(".") || "_"] ??= []).push(problema.message);
    }
    return { ok: false, mensagem: "Dados inválidos.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") {
    return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  }
  if (nome === "NaoAutorizadoError") {
    return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  }
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT na gestão de usuários", erro, { acao });
    return { ok: false, mensagem: "Registro não encontrado." };
  }

  const codigo = (erro as { code?: string }).code;
  if (codigo === "P2002") {
    // Violação de unicidade — nesta tela, quase sempre uma corrida entre dois
    // convites para o mesmo e-mail. A mensagem é deliberadamente muda sobre
    // QUAL índice foi violado: dizer "e-mail já cadastrado" reconstruiria o
    // oráculo de enumeração que `MENSAGEM_CONVITE` existe para eliminar.
    return { ok: false, mensagem: "Não foi possível concluir agora. Tente novamente." };
  }
  if (codigo === "P2025") {
    return { ok: false, mensagem: "Registro não encontrado." };
  }

  const ref = logger.erro("Falha em Server Action de usuários", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
