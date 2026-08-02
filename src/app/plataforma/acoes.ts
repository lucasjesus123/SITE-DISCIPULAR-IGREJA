"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma, TenantPlan, TenantStatus } from "@prisma/client";

import { exigirPlataformaAdmin, exigirSessao } from "@/lib/auth/rbac";
import { criarSessao, encerrarSessao } from "@/lib/auth/session";
import { hashSenha, SenhaFracaError } from "@/lib/auth/password";
import { auditarPlataforma } from "@/lib/audit";
import { gerarToken } from "@/lib/crypto";
import { prisma } from "@/lib/db/prisma";
import { tenantDb } from "@/lib/db/tenant-client";
import { env, isProd } from "@/lib/env";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import {
  cadastrarDominio,
  definirPrincipal,
  removerDominio,
  verificarDominio,
} from "@/lib/services/dominios";
import { schemaBlocos } from "@/lib/validation/blocos";
import {
  email as emailSchema,
  hostname as hostnameSchema,
  id as idSchema,
  nomePessoa,
  telefoneOpcional,
  textoLimpo,
} from "@/lib/validation/comum";

/**
 * =============================================================================
 * SERVER ACTIONS DA PLATAFORMA (super admin — o dono do SaaS)
 * =============================================================================
 *
 * O CICLO É O MESMO DO PAINEL, COM UMA DIFERENÇA IMPORTANTE
 *
 *   1. exigirPlataformaAdmin()  — autentica e exige `plataformaAdmin = true`
 *   2. rate limit               — teto por usuário, mesmo para o dono
 *   3. Zod                      — os argumentos são entrada não confiável
 *   4. prisma (modelos globais) / tenantDb(id) (dados de igreja)
 *   5. auditarPlataforma()      — quem fez o quê, sempre
 *
 * A DIFERENÇA: AQUI O tenantId VEM DO CLIENTE — E TUDO BEM
 *
 * A regra de ouro do sistema é "o tenant nunca vem de parâmetro". Ela vale para
 * o painel da igreja, onde o tenant é uma consequência de QUEM está pedindo:
 * deixar o usuário escolher o tenant seria deixá-lo escolher os dados alheios.
 *
 * Na área da plataforma a relação é outra: o super admin administra TODAS as
 * igrejas, então o alvo é necessariamente um argumento — como o `id` de
 * qualquer recurso em qualquer CRUD. O que protege aqui é a autorização
 * (`exigirPlataformaAdmin`, que também exige o domínio raiz via layout), não a
 * origem do identificador.
 *
 * Ainda assim, todo acesso a DADO DE IGREJA passa por `tenantDb(id)` — ver
 * `provisionarConteudoInicial()` aqui e `contarUso()` em igrejas/[id]/page.tsx.
 *
 * O rate limit não é encenação: se a conta do dono for comprometida, ele é o
 * que impede o atacante de suspender 300 igrejas em dois segundos.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  /** Preenchido só por `criarIgreja` — a senha temporária é exibida UMA vez. */
  senhaTemporaria?: string;
  /** Preenchido por ações que levam a outra tela (impersonação, criação). */
  url?: string;
  /** Instruções de DNS devolvidas pelo serviço de domínios. */
  registroDns?: { nome: string; tipo: "TXT"; valor: string };
}

// -----------------------------------------------------------------------------
// Constantes de plano
// -----------------------------------------------------------------------------

/**
 * Limites padrão por plano. Ficam aqui, e não no schema, porque são política
 * comercial: mudam com frequência e não devem exigir migração de banco. O
 * valor efetivo de cada igreja vive na linha do Tenant e pode ser ajustado
 * caso a caso por `ajustarLimites`.
 */
const LIMITES_POR_PLANO: Record<
  TenantPlan,
  { limiteUsuarios: number; limitePessoas: number; limiteStorageMb: number }
> = {
  ESSENCIAL: { limiteUsuarios: 5, limitePessoas: 2_000, limiteStorageMb: 512 },
  CRESCIMENTO: { limiteUsuarios: 15, limitePessoas: 10_000, limiteStorageMb: 2_048 },
  MULTISEDE: { limiteUsuarios: 40, limitePessoas: 50_000, limiteStorageMb: 8_192 },
};

/**
 * Slugs que a plataforma usa para si e que, portanto, jamais podem virar
 * subdomínio de igreja.
 *
 * Esta lista ESPELHA `SLUGS_RESERVADOS` de src/lib/tenant/resolve.ts, que não
 * é exportada. A duplicação é consciente e o desalinhamento é seguro em uma
 * direção só: se aqui houver um nome a mais, o pior que acontece é recusarmos
 * um slug que funcionaria. O inverso — aceitar aqui um slug que a plataforma
 * usa — criaria uma igreja em `api.` ou `login.`, sombreando um endereço
 * nosso. Por isso esta lista é deliberadamente MAIOR que a de lá.
 */
const SLUGS_RESERVADOS = new Set([
  "www", "app", "api", "admin", "painel", "plataforma", "super", "root",
  "mail", "smtp", "imap", "pop", "ftp", "ns", "ns1", "ns2", "mx",
  "cdn", "static", "assets", "media", "img", "files", "storage",
  "status", "docs", "doc", "blog", "suporte", "ajuda", "help", "conta",
  "login", "logout", "auth", "sso", "oauth", "sair", "entrar",
  "webhook", "webhooks", "hooks", "dev", "staging", "stage", "test", "teste",
  "localhost", "internal", "intranet", "vpn", "git", "grafana", "metrics",
  "billing", "pagamento", "checkout", "discipular",
]);

// -----------------------------------------------------------------------------
// Criação de igreja
// -----------------------------------------------------------------------------

const schemaNovaIgreja = z.object({
  nome: textoLimpo(160, 3),
  /** Opcional: se vazio, derivamos do nome. */
  slug: z
    .union([
      z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use apenas letras minúsculas, números e hífen.")
        .min(3)
        .max(40),
      z.literal(""),
    ])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  razaoSocial: z.union([textoLimpo(200), z.literal("")]).optional().transform((v) => (v === "" ? undefined : v)),
  cnpj: z
    .union([
      z
        .string()
        .trim()
        .transform((v) => v.replace(/\D/g, ""))
        .pipe(z.string().length(14, "CNPJ deve ter 14 dígitos.")),
      z.literal(""),
    ])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),

  plano: z.enum(["ESSENCIAL", "CRESCIMENTO", "MULTISEDE"]).default("ESSENCIAL"),
  status: z.enum(["TRIAL", "ATIVO"]).default("TRIAL"),
  /** Dias de avaliação. Só usado quando o status é TRIAL. */
  diasTrial: z.coerce.number().int().min(1).max(180).default(30),

  // Administrador inicial da igreja.
  adminNome: nomePessoa,
  adminEmail: emailSchema,
  adminTelefone: telefoneOpcional,
});

/**
 * Cria uma igreja completa e pronta para uso: Tenant, identidade visual
 * padrão, configuração do "ao vivo", páginas base do site e o primeiro
 * usuário ADMIN com senha temporária.
 *
 * POR QUE PROVISIONAR TUDO DE UMA VEZ
 * Um tenant sem SiteConfig faz o site quebrar na primeira visita; um tenant
 * sem usuário ADMIN não tem como ser configurado. Deixar essas peças para
 * "depois" transformaria cada venda nova numa sequência de passos manuais que
 * alguém eventualmente esquece — e o cliente estreia o produto num erro 500.
 */
export async function criarIgreja(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const dados = schemaNovaIgreja.parse(dadosBrutos);

    const slugBase = dados.slug ?? derivarSlug(dados.nome);
    if (!slugBase) {
      return {
        ok: false,
        mensagem: "Não foi possível derivar um endereço a partir do nome. Informe o slug manualmente.",
        campos: { slug: ["Informe um endereço válido."] },
      };
    }
    if (SLUGS_RESERVADOS.has(slugBase)) {
      return {
        ok: false,
        mensagem: "Este endereço é reservado pela plataforma.",
        campos: { slug: ["Escolha outro endereço."] },
      };
    }

    const slug = await slugDisponivel(slugBase);
    if (!slug) {
      return {
        ok: false,
        mensagem: "Não encontramos uma variação livre deste endereço. Escolha outro.",
        campos: { slug: ["Endereço já em uso."] },
      };
    }

    const limites = LIMITES_POR_PLANO[dados.plano];

    /**
     * Senha temporária forte, gerada pelo servidor.
     *
     * Não pedimos ao operador que invente uma: senha escolhida na hora do
     * cadastro é curta, reutilizada e frequentemente compartilhada por
     * WhatsApp. Esta aqui é aleatória, é mostrada UMA vez na tela e nunca vai
     * para a auditoria nem para o log — `mascarar()` já removeria o campo,
     * mas a defesa real é simplesmente não passar o valor adiante.
     */
    const { senha: senhaTemporaria, hash: senhaHash } = await gerarCredencialTemporaria();

    /**
     * O usuário pode já existir: o mesmo pastor pode cuidar de duas igrejas, e
     * `User` é global de propósito. Nesse caso NÃO tocamos na senha dele —
     * redefinir a senha de uma conta existente porque ela foi adicionada a
     * outra igreja seria um sequestro de conta disfarçado de provisionamento.
     */
    const usuarioExistente = await prisma.user.findUnique({
      where: { email: dados.adminEmail },
      select: { id: true, ativo: true },
    });

    const agora = new Date();
    const trialExpiraEm =
      dados.status === "TRIAL"
        ? new Date(agora.getTime() + dados.diasTrial * 24 * 60 * 60 * 1000)
        : null;

    // ---- Etapa 1: modelos GLOBAIS, em uma transação.
    const { tenantId, userId, usuarioReaproveitado } = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          slug,
          nome: dados.nome,
          razaoSocial: dados.razaoSocial ?? null,
          cnpj: dados.cnpj ?? null,
          status: dados.status,
          plano: dados.plano,
          trialExpiraEm,
          limiteUsuarios: limites.limiteUsuarios,
          limitePessoas: limites.limitePessoas,
          limiteStorageMb: limites.limiteStorageMb,
        },
        select: { id: true },
      });

      const user =
        usuarioExistente ??
        (await tx.user.create({
          data: {
            email: dados.adminEmail,
            nome: dados.adminNome,
            telefone: dados.adminTelefone ?? null,
            senhaHash,
            // `senhaAtualizadaEm` = agora faz com que qualquer sessão anterior
            // (não deve haver nenhuma) já nasça inválida.
            senhaAtualizadaEm: agora,
          },
          select: { id: true, ativo: true },
        }));

      await tx.membership.create({
        data: { tenantId: tenant.id, userId: user.id, papel: "ADMIN", ativo: true },
      });

      return {
        tenantId: tenant.id,
        userId: user.id,
        usuarioReaproveitado: usuarioExistente !== null,
      };
    });

    // ---- Etapa 2: modelos da IGREJA, pelo cliente escopado.
    //
    // Não cabem na transação acima porque `tenantDb()` só pode ser construído
    // depois que o tenant existe — e é justamente esse cliente que garante que
    // nada aqui grave no tenant errado. Se algo falhar, desfazemos a criação
    // por completo (o `onDelete: Cascade` leva membership e config junto):
    // uma igreja meio provisionada é pior que nenhuma, porque parece pronta.
    try {
      await provisionarConteudoInicial(tenantId, dados.nome);
    } catch (erro) {
      logger.erro("Falha ao provisionar conteúdo inicial; revertendo a igreja", erro, { tenantId });
      await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {});
      return {
        ok: false,
        mensagem: "Não foi possível concluir a criação da igreja. Nada foi mantido pela metade.",
      };
    }

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "tenant.criar",
      alvoTipo: "Tenant",
      alvoId: tenantId,
      detalhes: {
        slug,
        nome: dados.nome,
        plano: dados.plano,
        status: dados.status,
        adminUserId: userId,
        usuarioReaproveitado,
      },
    });

    revalidatePath("/plataforma");
    revalidatePath("/plataforma/igrejas");

    return {
      ok: true,
      mensagem: usuarioReaproveitado
        ? `Igreja criada. O e-mail informado já tinha conta na plataforma, então a senha atual dele foi mantida.`
        : `Igreja criada. Anote a senha temporária agora — ela não será exibida de novo.`,
      // Só faz sentido devolver a senha quando a conta foi criada agora.
      senhaTemporaria: usuarioReaproveitado ? undefined : senhaTemporaria,
      url: `/plataforma/igrejas/${tenantId}`,
    };
  } catch (erro) {
    return traduzirErro(erro, "criarIgreja");
  }
}

// -----------------------------------------------------------------------------
// Ciclo de vida da igreja
// -----------------------------------------------------------------------------

const schemaStatus = z.object({
  status: z.enum(["TRIAL", "ATIVO", "SUSPENSO", "CANCELADO"]),
  motivo: z.union([textoLimpo(300), z.literal("")]).optional().transform((v) => (v === "" ? undefined : v)),
  /**
   * Para CANCELADO exigimos que o operador digite o slug da igreja.
   * É a mesma ideia do "digite o nome do repositório para excluir": impede o
   * clique errado numa lista onde todas as linhas parecem iguais.
   */
  confirmacao: z.string().trim().max(63).optional(),
});

/**
 * Muda o status comercial da igreja.
 *
 * O QUE CADA STATUS FAZ NA PRÁTICA (ver src/lib/tenant/resolve.ts)
 *   TRIAL/ATIVO — site no ar, painel liberado.
 *   SUSPENSO    — `exigirTenant()` recusa: site fora do ar e painel bloqueado.
 *                 Os dados continuam intactos; é cobrança, não punição.
 *   CANCELADO   — além do bloqueio, marcamos `excluidoEm`, o que faz o
 *                 hostname deixar de resolver. É o começo do descarte, e por
 *                 isso é o único que pede confirmação explícita.
 */
export async function alterarStatusIgreja(
  tenantIdBruto: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const dados = schemaStatus.parse(dadosBrutos);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, nome: true, status: true },
    });
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };

    if (dados.status === "CANCELADO" && dados.confirmacao !== tenant.slug) {
      return {
        ok: false,
        mensagem: `Para cancelar, digite exatamente o endereço da igreja: ${tenant.slug}`,
        campos: { confirmacao: ["Confirmação não confere."] },
      };
    }

    const cancelando = dados.status === "CANCELADO";

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        status: dados.status,
        // Reativar limpa a marca de exclusão; cancelar a aplica.
        excluidoEm: cancelando ? new Date() : null,
      },
    });

    /**
     * Cancelamento e suspensão derrubam as sessões abertas daquela igreja.
     *
     * Sem isso, quem já estava logado continuaria trabalhando no painel até a
     * sessão vencer — e uma igreja "suspensa por inadimplência" que segue
     * funcionando por oito horas não está suspensa.
     */
    let sessoesRevogadas = 0;
    if (dados.status === "SUSPENSO" || cancelando) {
      const { count } = await prisma.sessao.updateMany({
        where: { tenantAtivoId: tenantId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
      sessoesRevogadas = count;
    }

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "tenant.alterarStatus",
      alvoTipo: "Tenant",
      alvoId: tenantId,
      detalhes: {
        slug: tenant.slug,
        statusAnterior: tenant.status,
        statusNovo: dados.status,
        motivo: dados.motivo,
        sessoesRevogadas,
      },
    });

    revalidatePath("/plataforma");
    revalidatePath("/plataforma/igrejas");
    revalidatePath(`/plataforma/igrejas/${tenantId}`);

    return { ok: true, mensagem: `Situação alterada para ${rotuloStatus(dados.status)}.` };
  } catch (erro) {
    return traduzirErro(erro, "alterarStatusIgreja");
  }
}

const schemaPlano = z.object({
  plano: z.enum(["ESSENCIAL", "CRESCIMENTO", "MULTISEDE"]),
  /** Aplicar os limites padrão do novo plano por cima dos atuais. */
  aplicarLimitesDoPlano: z.coerce.boolean().default(true),
});

/** Troca o plano e, opcionalmente, realinha os limites. */
export async function alterarPlano(
  tenantIdBruto: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const dados = schemaPlano.parse(dadosBrutos);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plano: true, slug: true },
    });
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };

    const novos = LIMITES_POR_PLANO[dados.plano];

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        plano: dados.plano,
        ...(dados.aplicarLimitesDoPlano ? novos : {}),
      },
    });

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "tenant.alterarPlano",
      alvoTipo: "Tenant",
      alvoId: tenantId,
      detalhes: {
        slug: tenant.slug,
        planoAnterior: tenant.plano,
        planoNovo: dados.plano,
        limitesRealinhados: dados.aplicarLimitesDoPlano,
      },
    });

    revalidatePath(`/plataforma/igrejas/${tenantId}`);
    revalidatePath("/plataforma/igrejas");

    return { ok: true, mensagem: `Plano alterado para ${dados.plano}.` };
  } catch (erro) {
    return traduzirErro(erro, "alterarPlano");
  }
}

/**
 * Limites individuais.
 *
 * Os tetos existem porque a plataforma roda numa VPS compartilhada: um valor
 * digitado com um zero a mais viraria permissão para uma igreja consumir o
 * disco e o banco de todas as outras. O teto aqui é a última linha antes de
 * "quota" virar "sem quota".
 */
const schemaLimites = z.object({
  limiteUsuarios: z.coerce.number().int().min(1).max(500),
  limitePessoas: z.coerce.number().int().min(1).max(500_000),
  limiteStorageMb: z.coerce.number().int().min(64).max(102_400),
});

export async function ajustarLimites(
  tenantIdBruto: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const dados = schemaLimites.parse(dadosBrutos);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true, limiteUsuarios: true, limitePessoas: true, limiteStorageMb: true },
    });
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };

    await prisma.tenant.update({ where: { id: tenantId }, data: dados });

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "tenant.ajustarLimites",
      alvoTipo: "Tenant",
      alvoId: tenantId,
      detalhes: { slug: tenant.slug, antes: tenant, depois: dados },
    });

    revalidatePath(`/plataforma/igrejas/${tenantId}`);

    return { ok: true, mensagem: "Limites atualizados." };
  } catch (erro) {
    return traduzirErro(erro, "ajustarLimites");
  }
}

// -----------------------------------------------------------------------------
// Domínios
// -----------------------------------------------------------------------------

/**
 * Vincula um domínio próprio a uma igreja.
 *
 * A checagem extra que o serviço não faz: recusamos qualquer hostname que caia
 * DENTRO do domínio da plataforma. Sem ela, cadastrar `app.discipular.app` ou
 * o próprio `discipular.app` como domínio de um cliente faria o resolvedor
 * entregar aquele host para o tenant — inclusive o host onde vive esta área de
 * super admin. Subdomínio da plataforma é atribuído pelo `slug`, nunca por
 * cadastro manual.
 */
export async function adicionarDominio(
  tenantIdBruto: string,
  hostnameBruto: unknown,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const host = hostnameSchema.parse(hostnameBruto);

    const raiz = env.ROOT_DOMAIN;
    if (host === raiz || host.endsWith(`.${raiz}`) || host === "localhost" || host.endsWith(".localhost")) {
      return {
        ok: false,
        mensagem: "Endereços dentro do domínio da plataforma são atribuídos pelo slug da igreja.",
        campos: { hostname: ["Domínio não permitido."] },
      };
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };

    const resultado = await cadastrarDominio(tenantId, host);

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "dominio.cadastrar",
      alvoTipo: "TenantDomain",
      alvoId: host,
      // `tokenVerificacao` está na denylist de `mascarar()`; ainda assim não o
      // passamos, porque a auditoria não precisa dele para nada.
      detalhes: { tenantSlug: tenant.slug, hostname: host, aceito: resultado.ok },
    });

    revalidatePath("/plataforma/dominios");
    revalidatePath(`/plataforma/igrejas/${tenantId}`);

    return {
      ok: resultado.ok,
      mensagem: resultado.mensagem,
      registroDns: resultado.token
        ? {
            nome: `_discipular.${host}`,
            tipo: "TXT",
            valor: `discipular-verificacao=${resultado.token}`,
          }
        : undefined,
    };
  } catch (erro) {
    return traduzirErro(erro, "adicionarDominio");
  }
}

/**
 * Dispara a consulta de DNS.
 *
 * Rate limit próprio (`REGRAS.verificarDominio`): cada chamada é uma consulta
 * de rede para fora, com timeout de 5s. Sem teto, um botão clicado em
 * sequência viraria fila de workers presos esperando resolvedor.
 */
export async function verificarDominioAction(
  tenantIdBruto: string,
  dominioIdBruto: string,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.verificarDominio, sessao.userId);
    if (!limite.permitido) {
      return {
        ok: false,
        mensagem: `Muitas verificações seguidas. Tente novamente em ${limite.tentarEmSegundos}s.`,
      };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const dominioId = idSchema.parse(dominioIdBruto);

    const resultado = await verificarDominio(tenantId, dominioId);

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "dominio.verificar",
      alvoTipo: "TenantDomain",
      alvoId: dominioId,
      detalhes: { tenantId, verificado: resultado.verificado },
    });

    revalidatePath("/plataforma/dominios");
    revalidatePath(`/plataforma/igrejas/${tenantId}`);

    return {
      ok: resultado.verificado,
      mensagem: resultado.mensagem,
      registroDns: resultado.registroEsperado,
    };
  } catch (erro) {
    return traduzirErro(erro, "verificarDominioAction");
  }
}

export async function definirDominioPrincipal(
  tenantIdBruto: string,
  dominioIdBruto: string,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const dominioId = idSchema.parse(dominioIdBruto);

    const ok = await definirPrincipal(tenantId, dominioId);

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "dominio.definirPrincipal",
      alvoTipo: "TenantDomain",
      alvoId: dominioId,
      detalhes: { tenantId, aplicado: ok },
    });

    revalidatePath("/plataforma/dominios");
    revalidatePath(`/plataforma/igrejas/${tenantId}`);

    return ok
      ? { ok: true, mensagem: "Domínio principal atualizado." }
      : { ok: false, mensagem: "Só um domínio já verificado pode ser o principal." };
  } catch (erro) {
    return traduzirErro(erro, "definirDominioPrincipal");
  }
}

export async function removerDominioAction(
  tenantIdBruto: string,
  dominioIdBruto: string,
): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);
    const dominioId = idSchema.parse(dominioIdBruto);

    // Lemos ANTES para registrar o hostname na auditoria: depois do delete o
    // dado sumiu, e "removeu o domínio cuid123" não ajuda ninguém a investigar.
    const dominio = await prisma.tenantDomain.findFirst({
      where: { id: dominioId, tenantId },
      select: { hostname: true, principal: true },
    });

    const removido = await removerDominio(tenantId, dominioId);

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "dominio.remover",
      alvoTipo: "TenantDomain",
      alvoId: dominioId,
      detalhes: { tenantId, hostname: dominio?.hostname, eraPrincipal: dominio?.principal, removido },
    });

    revalidatePath("/plataforma/dominios");
    revalidatePath(`/plataforma/igrejas/${tenantId}`);

    return removido
      ? { ok: true, mensagem: "Domínio removido." }
      : { ok: false, mensagem: "Domínio não encontrado." };
  } catch (erro) {
    return traduzirErro(erro, "removerDominioAction");
  }
}

// -----------------------------------------------------------------------------
// Impersonação ("entrar como")
// -----------------------------------------------------------------------------

/**
 * =============================================================================
 * ENTRAR COMO UMA IGREJA — a operação mais perigosa do sistema
 * =============================================================================
 *
 * POR QUE ELA EXISTE
 * Suporte de verdade precisa ver a tela que o cliente está vendo. A
 * alternativa (construir telas na plataforma que exibem os dados de qualquer
 * igreja) é pior: cria um caminho de leitura permanente, sem contexto e sem
 * fricção, para dado que inclui pedido de oração sobre doença e crise
 * familiar. Impersonação é a opção que concentra esse poder num ato único,
 * datado, motivado e registrado.
 *
 * AS TRAVAS
 *  1. Só `plataformaAdmin` — e `exigirPlataformaAdmin()` já recusa sessões que
 *     sejam elas mesmas de impersonação, então não dá para encadear
 *     "impersonar a partir de uma impersonação".
 *  2. Uma sessão de suporte por vez: as anteriores deste admin são revogadas.
 *     Suporte esquecido aberto é acesso permanente com outro nome.
 *  3. A sessão nova nasce com `impersonadoPor` preenchido. Isso faz duas
 *     coisas: liga a exceção em `exigirAcessoTenant()` (é o ÚNICO caminho pelo
 *     qual um super admin acessa o painel de uma igreja) e etiqueta cada linha
 *     de auditoria daquela igreja com o e-mail de quem estava por trás.
 *  4. Registro em DOIS lugares: no log da plataforma (nossa investigação) e no
 *     log da igreja (a igreja é a controladora dos dados sob a LGPD; ela tem
 *     direito de saber que o fornecedor entrou).
 *
 * POR QUE A FAIXA VERMELHA PERMANENTE É CONTROLE, E NÃO ENFEITE
 * A faixa em src/app/painel/layout.tsx fica visível em toda tela enquanto a
 * sessão de suporte durar. Ela não é aviso decorativo: é o que impede o erro
 * mais provável desta funcionalidade, que não é o acesso malicioso — é o
 * operador esquecer em qual contexto está e editar a igreja errada achando que
 * está na dele. Um banner que some depois de 5 segundos, ou que só aparece na
 * home do painel, não resolveria isso; ele precisa estar presente exatamente
 * no momento em que a pessoa clica em "salvar". A faixa também transforma um
 * print de tela em prova: qualquer captura feita durante o suporte carrega o
 * e-mail de quem estava operando.
 *
 * LIMITE CONHECIDO — A TROCA DE HOST
 * O cookie de sessão é `__Host-` (host-only, sem atributo Domain) por decisão
 * de segurança: um cookie emitido para `.<raiz>` seria enviado ao subdomínio
 * de TODAS as igrejas, e a sessão do super admin é o pior candidato possível
 * para isso. A consequência é que o cookie criado aqui vale para o host da
 * plataforma; abrir o painel da igreja em outro host exige um passo de
 * handoff com token de uso único, que é da alçada do módulo de autenticação.
 * Enquanto ele não existir, `iniciarImpersonacao` já cria e registra a sessão
 * de suporte, e `encerrarImpersonacao` a revoga de qualquer um dos lados —
 * incluindo remotamente, a partir da plataforma.
 */
export async function iniciarImpersonacao(tenantIdBruto: string): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();

    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        nome: true,
        status: true,
        excluidoEm: true,
        dominios: {
          where: { principal: true, status: "VERIFICADO" },
          select: { hostname: true },
          take: 1,
        },
      },
    });

    if (!tenant || tenant.excluidoEm) {
      return { ok: false, mensagem: "Igreja não encontrada." };
    }
    if (tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
      // `exigirTenant()` recusaria o acesso mesmo com a sessão criada. Melhor
      // dizer isso agora do que gerar uma sessão de suporte inútil e
      // registrada na auditoria da igreja por nada.
      return {
        ok: false,
        mensagem: "Reative a igreja antes de entrar como suporte — o painel dela está bloqueado.",
      };
    }

    // Trava 2: uma sessão de suporte por vez, por administrador.
    const { count: anterioresRevogadas } = await prisma.sessao.updateMany({
      where: { userId: sessao.userId, impersonadoPor: { not: null }, revogadaEm: null },
      data: { revogadaEm: new Date() },
    });

    await criarSessao({
      userId: sessao.userId,
      tenantId: tenant.id,
      impersonadoPor: sessao.email,
    });

    // Registro 1: log da plataforma.
    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "impersonacao.iniciar",
      alvoTipo: "Tenant",
      alvoId: tenant.id,
      detalhes: { slug: tenant.slug, nome: tenant.nome, anterioresRevogadas },
    });

    // Registro 2: log DA IGREJA.
    //
    // `AuditLog` é modelo com tenantId, então mesmo o super admin escreve nele
    // pelo cliente escopado. Não é formalidade: `tenantDb` é o que garante que
    // um `tenantId` trocado por engano (ou por um argumento adulterado que
    // tenha escapado do Zod) não grave a entrada no log de OUTRA igreja — o
    // que seria, além de errado, uma pista falsa numa investigação.
    await tenantDb(tenant.id)
      .auditLog.create({
        data: {
          tenantId: tenant.id,
          atorUserId: sessao.userId,
          atorNome: sessao.nome,
          atorPapel: "ADMIN",
          impersonadoPor: sessao.email,
          acao: "impersonacao.iniciar",
          alvoTipo: "Tenant",
          alvoId: tenant.id,
          detalhes: { origem: "plataforma" },
        },
      })
      .catch((erro: unknown) => {
        // Falha de auditoria não derruba a operação (mesma política de
        // src/lib/audit.ts), mas aqui vira aviso: é um ponto cego no registro
        // do acesso do fornecedor aos dados do cliente.
        logger.erro("Falha ao registrar impersonação na auditoria do tenant", erro, { tenantId });
      });

    const hostAlvo = tenant.dominios[0]?.hostname ?? `${tenant.slug}.${env.ROOT_DOMAIN}`;

    return {
      ok: true,
      mensagem: `Sessão de suporte aberta em ${tenant.nome}. A faixa vermelha ficará visível em todas as telas.`,
      url: `${isProd ? "https" : "http"}://${hostAlvo}/painel`,
    };
  } catch (erro) {
    return traduzirErro(erro, "iniciarImpersonacao");
  }
}

/**
 * Encerra a sessão de suporte.
 *
 * Funciona nos dois sentidos, de propósito:
 *   - chamada DE DENTRO da sessão de suporte, revoga a si mesma e limpa o
 *     cookie (é o "sair" do operador);
 *   - chamada da plataforma por um admin que não está impersonando, revoga
 *     todas as sessões de suporte DELE. É o botão de pânico para quando o
 *     operador fechou a aba e foi almoçar.
 *
 * Note que não usamos `exigirPlataformaAdmin()` aqui: ela recusa justamente as
 * sessões de impersonação, que são o caso principal desta função.
 */
export async function encerrarImpersonacao(): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirSessao();

    if (!sessao.plataformaAdmin) {
      // Um usuário comum não tem sessão de suporte para encerrar. Mensagem
      // genérica: não confirmamos nem negamos a existência do recurso.
      return { ok: false, mensagem: "Nada a encerrar." };
    }

    const ehSessaoDeSuporte = sessao.impersonadoPor !== null;
    const tenantAlvo = sessao.tenantId;

    if (ehSessaoDeSuporte) {
      await prisma.sessao.updateMany({
        where: { id: sessao.sessaoId, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
      // Revogar no banco E limpar o cookie: só limpar o cookie deixaria a
      // sessão viva para quem tivesse copiado o token.
      await encerrarSessao();
    } else {
      await prisma.sessao.updateMany({
        where: { userId: sessao.userId, impersonadoPor: { not: null }, revogadaEm: null },
        data: { revogadaEm: new Date() },
      });
    }

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.impersonadoPor ?? sessao.email,
      acao: "impersonacao.encerrar",
      alvoTipo: "Tenant",
      alvoId: tenantAlvo ?? undefined,
      detalhes: { remoto: !ehSessaoDeSuporte },
    });

    if (tenantAlvo) {
      await tenantDb(tenantAlvo)
        .auditLog.create({
          data: {
            tenantId: tenantAlvo,
            atorUserId: sessao.userId,
            atorNome: sessao.nome,
            atorPapel: "ADMIN",
            impersonadoPor: sessao.impersonadoPor,
            acao: "impersonacao.encerrar",
            alvoTipo: "Tenant",
            alvoId: tenantAlvo,
          },
        })
        .catch(() => {
          /* já auditado na plataforma; não bloqueia a saída */
        });
    }

    revalidatePath("/plataforma");

    return {
      ok: true,
      mensagem: ehSessaoDeSuporte
        ? "Sessão de suporte encerrada. Faça login novamente para voltar à plataforma."
        : "Sessões de suporte abertas foram revogadas.",
      url: ehSessaoDeSuporte ? "/login" : undefined,
    };
  } catch (erro) {
    return traduzirErro(erro, "encerrarImpersonacao");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/** "Igreja Batista Vale do Sol" -> "igreja-batista-vale-do-sol" */
function derivarSlug(nome: string): string | null {
  const base = nome
    .normalize("NFD")
    // Remove os diacríticos separados pela decomposição NFD. Sem isto,
    // "Coração" viraria "corao" em vez de "coracao".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  // O resolvedor de subdomínio exige começar e terminar em alfanumérico e ter
  // pelo menos 3 caracteres; um slug fora disso criaria uma igreja inacessível.
  if (base.length < 3 || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(base)) return null;
  return base;
}

/** Acha a primeira variação livre: `nome`, `nome-2`, `nome-3`... */
async function slugDisponivel(base: string): Promise<string | null> {
  for (let tentativa = 0; tentativa < 20; tentativa += 1) {
    const candidato = tentativa === 0 ? base : `${base.slice(0, 36)}-${tentativa + 1}`;
    if (SLUGS_RESERVADOS.has(candidato)) continue;

    const existe = await prisma.tenant.count({ where: { slug: candidato } });
    if (existe === 0) return candidato;
  }
  return null;
}

/**
 * Senha temporária e o hash dela, juntos.
 *
 * Os dois voltam do MESMO sorteio de propósito. Gerar a senha num lugar e o
 * hash em outro é como se cria o bug em que a tela mostra uma senha que não
 * abre a conta — e o cliente novo estreia o produto com um "esqueci minha
 * senha".
 *
 * São dois tokens base64url separados por hífen (~24 caracteres): legível o
 * bastante para ser ditado por telefone e muito além do mínimo da política.
 * `hashSenha` aplica essa política, e a chance de um valor aleatório ser
 * recusado é desprezível — mas "desprezível" não é "impossível", e falhar a
 * criação de uma igreja por azar de sorteio seria um bug irreproduzível.
 */
async function gerarCredencialTemporaria(): Promise<{ senha: string; hash: string }> {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    const senha = `${gerarToken(9)}-${gerarToken(9)}`;
    try {
      return { senha, hash: await hashSenha(senha) };
    } catch (erro) {
      if (!(erro instanceof SenhaFracaError)) throw erro;
    }
  }
  throw new Error("Não foi possível gerar uma senha temporária válida.");
}

/**
 * Cria SiteConfig, LiveConfig e as páginas base — tudo pelo cliente escopado.
 *
 * Os blocos passam por `schemaBlocos.parse` antes de ir para o banco. É o
 * mesmo schema que o editor do cliente usa e que a renderização revalida na
 * leitura. Validar aqui parece redundante (o conteúdo é nosso), mas garante
 * que uma mudança no schema quebre o provisionamento no build/teste em vez de
 * criar igrejas com páginas que o site descarta silenciosamente.
 */
async function provisionarConteudoInicial(tenantId: string, nomeIgreja: string): Promise<void> {
  const db = tenantDb(tenantId);

  await db.siteConfig.create({
    // `tenantId` é injetado pela extensão de escopo; repetimos aqui porque os
    // tipos do Prisma exigem o campo — e a extensão recusa qualquer valor
    // diferente do escopo, então a redundância é verificada, não confiada.
    data: { tenantId, nomeExibicao: nomeIgreja },
  });

  await db.liveConfig.create({
    data: { tenantId },
  });

  const paginas = [
    {
      slug: "quem-somos",
      titulo: "Quem somos",
      publicada: true,
      ordemMenu: 1,
      blocos: [
        {
          tipo: "texto" as const,
          tema: "claro" as const,
          eyebrow: "Nossa história",
          titulo: "Quem somos",
          corpo:
            "Escreva aqui a história da igreja: quando começou, o que a move e o que uma pessoa encontra ao chegar pela primeira vez.\n\nEste texto é editável no painel, em Site > Páginas.",
        },
        {
          tipo: "citacao" as const,
          tema: "creme" as const,
          texto:
            "Porque onde estiverem dois ou três reunidos em meu nome, ali estou eu no meio deles.",
          autor: "Mateus 18:20",
        },
        {
          tipo: "cta" as const,
          tema: "escuro" as const,
          titulo: "Venha nos visitar",
          texto: "Avise que está chegando e alguém estará esperando por você na porta.",
          botaoTexto: "Quero visitar",
          botaoLink: "/visita",
        },
      ],
    },
    {
      slug: "pastores",
      titulo: "Pastores",
      publicada: false,
      ordemMenu: 2,
      blocos: [
        {
          tipo: "cards" as const,
          tema: "claro" as const,
          eyebrow: "Liderança",
          titulo: "Quem cuida desta casa",
          colunas: 3 as const,
          itens: [{ titulo: "Nome do pastor", texto: "Uma linha sobre o ministério dele." }],
        },
      ],
    },
    {
      slug: "celulas",
      titulo: "Células",
      publicada: false,
      ordemMenu: 3,
      blocos: [
        {
          tipo: "texto" as const,
          tema: "claro" as const,
          eyebrow: "Pequenos grupos",
          titulo: "Células",
          corpo: "Explique o que é uma célula e como alguém participa da primeira.",
        },
        {
          tipo: "formulario" as const,
          tema: "creme" as const,
          titulo: "Quero participar de uma célula",
          formulario: "quero-celula" as const,
        },
      ],
    },
    {
      slug: "escola",
      titulo: "Escola",
      publicada: false,
      ordemMenu: 4,
      blocos: [
        {
          tipo: "texto" as const,
          tema: "claro" as const,
          eyebrow: "Formação",
          titulo: "Escola",
          corpo: "Descreva os cursos, para quem são e quando acontecem.",
        },
      ],
    },
    {
      slug: "contribua",
      titulo: "Contribua",
      publicada: false,
      ordemMenu: 5,
      blocos: [
        {
          tipo: "texto" as const,
          tema: "creme" as const,
          eyebrow: "Generosidade",
          titulo: "Contribua",
          corpo:
            "Explique como a igreja usa as contribuições. A chave PIX é configurada em Site > Marca e aparece automaticamente.",
        },
      ],
    },
  ];

  for (const pagina of paginas) {
    await db.sitePagina.create({
      data: {
        tenantId,
        slug: pagina.slug,
        titulo: pagina.titulo,
        // Só `quem-somos` nasce publicada: ela é o destino padrão do botão da
        // home. As demais entram como rascunho para que ninguém estreie o site
        // com texto de exemplo no ar.
        publicada: pagina.publicada,
        mostrarMenu: true,
        ordemMenu: pagina.ordemMenu,
        sistema: false,
        // O cast é de tipagem, não de confiança: `schemaBlocos.parse` já
        // validou o conteúdo. Ele existe porque `InputJsonValue` do Prisma não
        // aceita propriedades opcionais com `undefined`, que é como o Zod
        // representa os campos ausentes dos blocos.
        blocos: schemaBlocos.parse(pagina.blocos) as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

function rotuloStatus(status: TenantStatus): string {
  const mapa: Record<TenantStatus, string> = {
    TRIAL: "Em avaliação",
    ATIVO: "Ativa",
    SUSPENSO: "Suspensa",
    CANCELADO: "Cancelada",
  };
  return mapa[status];
}

/**
 * Traduz exceções para uma resposta segura.
 *
 * Nada de mensagem do Prisma, nome de coluna ou stack trace chega ao
 * navegador: erro de banco descreve o schema, e schema é mapa para quem quer
 * atacar. O que o operador recebe é uma referência curta que localiza o
 * registro completo no log em segundos.
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
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT na área da plataforma", erro, { acao });
    return { ok: false, mensagem: "Operação recusada." };
  }
  if (nome === "SenhaFracaError") {
    return { ok: false, mensagem: "A senha gerada não atende à política. Tente novamente." };
  }

  // Violação de unicidade do Postgres via Prisma (P2002): quase sempre slug ou
  // e-mail já em uso. Respondemos sem revelar qual índice foi violado.
  const codigo = (erro as { code?: string }).code;
  if (codigo === "P2002") {
    return { ok: false, mensagem: "Já existe um registro com esses dados." };
  }

  const ref = logger.erro("Falha em Server Action da plataforma", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}

// -----------------------------------------------------------------------------
// MÓDULOS ("gavetas") por igreja — o Super Admin liga/desliga cada área.
// -----------------------------------------------------------------------------
const CHAVES_MODULO = ["site", "app", "louvor", "kids", "financeiro", "inscricoes", "celulas", "escola", "comunicacao"] as const;

export async function definirModulos(tenantIdBruto: string, formData: FormData): Promise<ResultadoAcao> {
  try {
    const sessao = await exigirPlataformaAdmin();
    const limite = await verificarLimite(REGRAS.escritaPainel, sessao.userId);
    if (!limite.permitido) return { ok: false, mensagem: "Muitas operações seguidas. Aguarde." };

    const tenantId = idSchema.parse(tenantIdBruto);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    if (!tenant) return { ok: false, mensagem: "Igreja não encontrada." };

    // `gestao` é a base e não entra no formulário (sempre ligado).
    const valores = Object.fromEntries(CHAVES_MODULO.map((c) => [c, formData.get(c) === "on"]));

    await prisma.configuracaoModulos.upsert({
      where: { tenantId },
      create: { tenantId, gestao: true, ...valores },
      update: { gestao: true, ...valores },
    });

    await auditarPlataforma({
      atorUserId: sessao.userId,
      atorEmail: sessao.email,
      acao: "tenant.definirModulos",
      alvoTipo: "Tenant",
      alvoId: tenantId,
      detalhes: { slug: tenant.slug, ...valores },
    });

    revalidatePath(`/plataforma/igrejas/${tenantId}`);
    return { ok: true, mensagem: "Módulos atualizados. As áreas ligadas já aparecem para a igreja." };
  } catch (erro) {
    return traduzirErro(erro, "definirModulos");
  }
}
