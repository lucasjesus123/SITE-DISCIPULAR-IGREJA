"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  id as idSchema,
  idOpcional,
  textoLimpo,
  textoLongo,
  horario as horarioSchema,
  diaSemana as diaSemanaSchema,
} from "@/lib/validation/comum";

/**
 * Server Actions da agenda (cultos, escola, eventos).
 *
 * Mesmo ciclo de todas as ações do painel:
 *   1. exigirPermissao()  — autentica, resolve o tenant pelo HOST e autoriza
 *   2. rate limit         — teto de escrita por usuário
 *   3. Zod.parse          — os argumentos são entrada não confiável
 *   4. ctx.db             — cliente já escopado ao tenant
 *   5. auditar()          — quem fez o quê
 *
 * O conteúdo desta tela é PÚBLICO: com `publicoSite` ligado, o item aparece no
 * site e no app. Por isso o teto de tamanho dos textos não é decoração — é o
 * que impede alguém de despejar 200 KB de texto na home da igreja.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  /** Preenchido no sucesso da criação, para o cliente saber o que destacar. */
  itemId?: string;
}

// -----------------------------------------------------------------------------
// Blocos de validação
// -----------------------------------------------------------------------------

/** Campo de formulário em branco vira `undefined`, e não erro de validação. */
function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );
}

/**
 * Checkbox de formulário.
 *
 * NÃO usamos `z.coerce.boolean()`: nele qualquer string não vazia é `true`,
 * inclusive a string "false". Aqui a lista de valores verdadeiros é explícita.
 */
const booleano = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

const numeroOrdem = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.number().int().min(0).max(999).optional(),
);

/**
 * Data e hora local, no formato que o `<input type="datetime-local">` produz.
 * Guardamos o formato como string e convertemos em `Date` só na gravação —
 * assim a validação de formato acontece antes de qualquer parsing tolerante do
 * JavaScript, que aceitaria coisas como "2026-13-45T99:99" e devolveria
 * `Invalid Date` silenciosamente.
 */
const dataHoraLocal = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/,
    "Informe data e hora no formato AAAA-MM-DD HH:MM.",
  );

const TIPOS = ["CULTO", "ESCOLA", "CELULA", "EVENTO", "ENSAIO", "ORACAO"] as const;

/**
 * REGRA CENTRAL DESTE MÓDULO: um item é recorrente OU pontual, nunca os dois.
 *
 * O schema do banco permite as duas colunas preenchidas ao mesmo tempo, e o
 * site não saberia qual respeitar — mostraria "toda quarta às 19h30" para um
 * evento que acontece uma única vez, ou o contrário. A checagem tem que estar
 * aqui, na escrita, porque a leitura acontece em vários lugares (site, app,
 * bloco de agenda das páginas) e cada um deles chutaria de um jeito.
 */
const schemaAgenda = z
  .object({
    tipo: z.enum(TIPOS).default("CULTO"),
    titulo: textoLimpo(160, 2),
    descricao: opcional(textoLongo(2000)),
    campusId: idOpcional,

    // Modo recorrente
    diaSemana: opcional(diaSemanaSchema),
    horario: opcional(horarioSchema),

    // Modo pontual
    dataHora: opcional(dataHoraLocal),

    destaque: booleano,
    ativo: booleano,
    publicoSite: booleano,
    ordem: numeroOrdem,
  })
  .superRefine((d, ctx) => {
    const temDia = d.diaSemana !== undefined;
    const temHora = d.horario !== undefined;
    const temPontual = d.dataHora !== undefined;

    if ((temDia || temHora) && temPontual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dataHora"],
        message:
          "Escolha um modo só: encontro que se repete toda semana OU evento com data marcada.",
      });
      return;
    }

    if (!temDia && !temHora && !temPontual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["diaSemana"],
        message: "Informe o dia e o horário da semana, ou a data e hora do evento.",
      });
      return;
    }

    if (temDia !== temHora) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: temHora ? ["diaSemana"] : ["horario"],
        message: "Encontro semanal precisa do dia da semana e do horário.",
      });
    }
  });

type DadosAgenda = z.infer<typeof schemaAgenda>;

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

export async function criarAgendaItem(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("agenda.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaAgenda.parse(dadosBrutos);

    const erroCampus = await validarCampus(ctx, dados.campusId);
    if (erroCampus) return erroCampus;

    /**
     * Teto por igreja. A agenda vai para a home do site: 500 itens não são um
     * uso legítimo, são um jeito de deixar a página pesada — de graça, porque
     * o custo é do servidor compartilhado.
     */
    const existentes = await ctx.db.agendaItem.count();
    if (existentes >= 300) {
      return {
        ok: false,
        mensagem: "A agenda chegou ao limite de 300 itens. Desative ou remova os antigos antes de criar outro.",
      };
    }

    const item = await ctx.db.agendaItem.create({
      data: { ...camposComuns(dados), tenantId: ctx.tenant.id },
      select: { id: true },
    });

    await auditar(ctx, {
      acao: "agenda.criar",
      alvoTipo: "AgendaItem",
      alvoId: item.id,
      detalhes: {
        tipo: dados.tipo,
        recorrente: dados.dataHora === undefined,
        publicoSite: dados.publicoSite,
      },
    });

    revalidarAgenda();
    return { ok: true, mensagem: "Item adicionado à agenda.", itemId: item.id };
  } catch (erro) {
    return traduzirErro(erro, "criarAgendaItem");
  }
}

// -----------------------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------------------

export async function atualizarAgendaItem(
  itemId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("agenda.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(itemId);
    const dados = schemaAgenda.parse(dadosBrutos);

    // A leitura já vem escopada pelo `ctx.db`: um ID de outra igreja
    // simplesmente não existe aqui, e a resposta é a mesma de um ID inventado.
    const atual = await ctx.db.agendaItem.findFirst({
      where: { id },
      select: { id: true, tipo: true, publicoSite: true },
    });
    if (!atual) return { ok: false, mensagem: "Item não encontrado." };

    const erroCampus = await validarCampus(ctx, dados.campusId);
    if (erroCampus) return erroCampus;

    await ctx.db.agendaItem.update({ where: { id }, data: camposComuns(dados) });

    await auditar(ctx, {
      acao: "agenda.atualizar",
      alvoTipo: "AgendaItem",
      alvoId: id,
      detalhes: {
        tipoAnterior: atual.tipo,
        tipoNovo: dados.tipo,
        publicoSiteAnterior: atual.publicoSite,
        publicoSiteNovo: dados.publicoSite,
      },
    });

    revalidarAgenda();
    return { ok: true, mensagem: "Item atualizado.", itemId: id };
  } catch (erro) {
    return traduzirErro(erro, "atualizarAgendaItem");
  }
}

// -----------------------------------------------------------------------------
// Excluir
// -----------------------------------------------------------------------------

/**
 * Exclusão FÍSICA, ao contrário da ficha de pessoa.
 *
 * Um item de agenda não sustenta o histórico de mais nada: ninguém referencia
 * "o culto de quarta" em outra tabela. Guardar um registro invisível para
 * sempre só faria a tabela crescer. Quem quiser preservar o item sem exibi-lo
 * tem o `ativo = false`, que é a operação do dia a dia.
 */
export async function excluirAgendaItem(itemId: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("agenda.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(itemId);

    const item = await ctx.db.agendaItem.findFirst({
      where: { id },
      select: { id: true, titulo: true, tipo: true },
    });
    if (!item) return { ok: false, mensagem: "Item não encontrado." };

    await ctx.db.agendaItem.delete({ where: { id } });

    await auditar(ctx, {
      acao: "agenda.excluir",
      alvoTipo: "AgendaItem",
      alvoId: id,
      // O título fica na auditoria porque é a única forma de saber depois O QUE
      // foi apagado — o registro em si não existe mais.
      detalhes: { titulo: item.titulo, tipo: item.tipo },
    });

    revalidarAgenda();
    return { ok: true, mensagem: "Item removido da agenda." };
  } catch (erro) {
    return traduzirErro(erro, "excluirAgendaItem");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function camposComuns(dados: DadosAgenda) {
  const pontual = dados.dataHora !== undefined;

  return {
    tipo: dados.tipo,
    titulo: dados.titulo,
    descricao: dados.descricao ?? null,
    campusId: dados.campusId ?? null,

    // Os dois modos são mutuamente exclusivos e o schema já garantiu isso.
    // Ainda assim gravamos `null` explícito no modo não usado: editar um item
    // de "toda quarta" para "dia 12/10" precisa APAGAR o dia da semana, senão
    // o registro ficaria com as duas informações e voltaria a ser ambíguo.
    diaSemana: pontual ? null : (dados.diaSemana ?? null),
    horario: pontual ? null : (dados.horario ?? null),
    dataHora: pontual ? paraDataHora(dados.dataHora) : null,
    recorrente: !pontual,

    destaque: dados.destaque,
    ativo: dados.ativo,
    publicoSite: dados.publicoSite,
    ordem: dados.ordem ?? 0,
  };
}

/**
 * "2026-10-12T19:30" -> Date.
 *
 * A string não tem fuso, então o Node a interpreta no fuso do processo — que
 * em produção é o da igreja (TZ=America/Sao_Paulo no docker-compose). É o
 * comportamento desejado: o pastor digita a hora do relógio da parede, não UTC.
 */
function paraDataHora(valor?: string): Date | null {
  if (!valor) return null;
  const d = new Date(`${valor}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Confirma que o campus informado existe NESTA igreja.
 *
 * Sem isso, o Prisma lançaria violação de chave estrangeira e o erro cru
 * (nome da constraint, nome da tabela) chegaria perto do usuário. E um ID de
 * outra igreja precisa responder "não encontrado" — nunca um erro diferente,
 * que confirmaria a existência daquele registro em algum lugar da plataforma.
 */
async function validarCampus(
  ctx: ContextoAutorizado,
  campusId?: string,
): Promise<ResultadoAcao | null> {
  if (!campusId) return null;

  const campus = await ctx.db.campus.findFirst({ where: { id: campusId }, select: { id: true } });
  if (!campus) {
    return {
      ok: false,
      mensagem: "Confira os campos destacados.",
      campos: { campusId: ["Campus não encontrado."] },
    };
  }
  return null;
}

function revalidarAgenda(): void {
  // A agenda alimenta a home, o bloco "agenda" das páginas e o app.
  revalidatePath("/", "layout");
  revalidatePath("/painel/agenda");
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    return { ok: false, mensagem: "Confira os campos destacados.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  if (nome === "NaoAutorizadoError") return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Item não encontrado." };
  }

  // Erro do Prisma nunca chega ao usuário: a mensagem carrega query, colunas e
  // às vezes os próprios parâmetros.
  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
