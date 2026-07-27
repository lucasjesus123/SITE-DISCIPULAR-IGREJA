"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import {
  id as idSchema,
  idOpcional,
  dataISO,
  horario as horarioSchema,
  diaSemana as diaSemanaSchema,
  textoLimpo,
  textoLongo,
  telefoneOpcional,
} from "@/lib/validation/comum";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

/**
 * Server Actions das células.
 *
 * DUAS PERMISSÕES DIFERENTES, DE PROPÓSITO
 *   `celulas.gerenciar` — criar e editar células. Pastor e admin.
 *   `celulas.relatar`   — registrar o encontro da semana. Inclui o líder.
 *
 * O líder de célula pode relatar, mas não pode criar célula nem editar a de
 * outro. E o relato dele é confinado à própria célula pelo recorte de escopo
 * aplicado em `celulaAcessivel()`.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  celulaId?: string;
}

function opcional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    schema.optional(),
  );
}

const booleano = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

const schemaCelula = z.object({
  nome: textoLimpo(120, 2),
  descricao: opcional(textoLongo(2000)),
  campusId: idOpcional,

  diaSemana: opcional(diaSemanaSchema),
  horario: opcional(horarioSchema),

  liderNome: opcional(textoLimpo(160)),
  liderTelefone: telefoneOpcional,

  bairro: opcional(textoLimpo(100)),
  cidade: opcional(textoLimpo(100)),

  /**
   * Coordenadas APROXIMADAS, para o mapa "encontre uma célula".
   * O endereço exato é a casa de alguém e não entra em campo consultável —
   * ver o comentário do modelo em prisma/schema.prisma.
   */
  latitude: opcional(z.coerce.number().min(-90).max(90)),
  longitude: opcional(z.coerce.number().min(-180).max(180)),

  capacidade: opcional(z.coerce.number().int().min(1).max(500)),
  ativa: booleano,
});

/**
 * Oferta do encontro, em reais, convertida para CENTAVOS inteiros.
 *
 * Dinheiro nunca vira float: em binário, 0.1 + 0.2 não é 0.3, e o erro só
 * aparece no fechamento do mês, quando ninguém mais lembra de onde veio.
 */
const ofertaEmCentavos = z
  .preprocess(
    (v) => (typeof v === "string" ? v.trim().replace(/R\$|\s/g, "") : v),
    z
      .union([
        z.literal(""),
        z.string().regex(/^\d{1,9}([.,]\d{1,2})?$/, "Informe o valor como 120 ou 120,50."),
        z.number().min(0).max(1_000_000),
      ])
      .optional(),
  )
  .transform((v) => {
    if (v === undefined || v === "") return 0;
    const numero = typeof v === "number" ? v : Number(v.replace(",", "."));
    return Math.round(numero * 100);
  });

const schemaEncontro = z.object({
  data: dataISO,
  presentes: z.coerce.number().int().min(0).max(1000),
  visitantes: z.coerce.number().int().min(0).max(1000),
  decisoes: z.coerce.number().int().min(0).max(1000),
  oferta: ofertaEmCentavos,
  observacoes: opcional(textoLongo(2000)),
});

// -----------------------------------------------------------------------------
// Criar
// -----------------------------------------------------------------------------

export async function criarCelula(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("celulas.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaCelula.parse(dadosBrutos);

    const erroCampus = await validarCampus(ctx, dados.campusId);
    if (erroCampus) return erroCampus;

    const erroCoordenada = validarCoordenadas(dados);
    if (erroCoordenada) return erroCoordenada;

    const celula = await ctx.db.celula.create({
      data: {
        tenantId: ctx.tenant.id,
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        campusId: dados.campusId ?? null,
        diaSemana: dados.diaSemana ?? null,
        horario: dados.horario ?? null,
        liderNome: dados.liderNome ?? null,
        liderTelefone: dados.liderTelefone ?? null,
        bairro: dados.bairro ?? null,
        cidade: dados.cidade ?? null,
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
        capacidade: dados.capacidade ?? null,
        ativa: dados.ativa,
      },
      select: { id: true },
    });

    await auditar(ctx, {
      acao: "celula.criar",
      alvoTipo: "Celula",
      alvoId: celula.id,
      detalhes: { comCampus: Boolean(dados.campusId), ativa: dados.ativa },
    });

    revalidatePath("/painel/celulas");
    return { ok: true, mensagem: "Célula criada.", celulaId: celula.id };
  } catch (erro) {
    return traduzirErro(erro, "criarCelula");
  }
}

// -----------------------------------------------------------------------------
// Atualizar
// -----------------------------------------------------------------------------

export async function atualizarCelula(
  celulaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("celulas.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(celulaId);
    const dados = schemaCelula.parse(dadosBrutos);

    const atual = await ctx.db.celula.findFirst({
      where: { id },
      select: { id: true, ativa: true, nome: true },
    });
    if (!atual) return { ok: false, mensagem: "Célula não encontrada." };

    const erroCampus = await validarCampus(ctx, dados.campusId);
    if (erroCampus) return erroCampus;

    const erroCoordenada = validarCoordenadas(dados);
    if (erroCoordenada) return erroCoordenada;

    /**
     * Desativar uma célula que ainda tem gente é quase sempre engano: as
     * pessoas ficariam "em uma célula" que não se reúne mais, invisível nas
     * listas. Transfira antes, desative depois.
     */
    if (atual.ativa && !dados.ativa) {
      const membros = await ctx.db.pessoa.count({ where: { celulaId: id, excluidoEm: null } });
      if (membros > 0) {
        return {
          ok: false,
          mensagem: `Esta célula ainda tem ${membros} ${membros === 1 ? "pessoa vinculada" : "pessoas vinculadas"}. Transfira essas pessoas antes de desativá-la.`,
        };
      }
    }

    await ctx.db.celula.update({
      where: { id },
      data: {
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        campusId: dados.campusId ?? null,
        diaSemana: dados.diaSemana ?? null,
        horario: dados.horario ?? null,
        liderNome: dados.liderNome ?? null,
        liderTelefone: dados.liderTelefone ?? null,
        bairro: dados.bairro ?? null,
        cidade: dados.cidade ?? null,
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
        capacidade: dados.capacidade ?? null,
        ativa: dados.ativa,
      },
    });

    await auditar(ctx, {
      acao: "celula.atualizar",
      alvoTipo: "Celula",
      alvoId: id,
      detalhes: { ativaAnterior: atual.ativa, ativaNova: dados.ativa },
    });

    revalidatePath("/painel/celulas");
    revalidatePath(`/painel/celulas/${id}`);
    return { ok: true, mensagem: "Célula atualizada.", celulaId: id };
  } catch (erro) {
    return traduzirErro(erro, "atualizarCelula");
  }
}

// -----------------------------------------------------------------------------
// Relatório de encontro
// -----------------------------------------------------------------------------

/**
 * Registra (ou corrige) o relatório de um encontro.
 *
 * Existe UM relatório por célula e por dia — é o que o índice único
 * `@@unique([celulaId, data])` garante no banco. Em vez de `upsert`, fazemos
 * leitura + escrita explícitas: o `upsert` do Prisma exigiria o `where` de
 * chave composta, forma que o cliente escopado por tenant não consegue
 * combinar com o filtro de igreja. Duas consultas simples e previsíveis valem
 * mais que uma consulta esperta que fura o escopo.
 */
export async function registrarEncontro(
  celulaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("celulas.relatar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitos registros seguidos. Aguarde um instante." };
    }

    const id = idSchema.parse(celulaId);
    const dados = schemaEncontro.parse(dadosBrutos);

    const celula = await celulaAcessivel(ctx, id);
    if (!celula) return { ok: false, mensagem: "Célula não encontrada." };

    const data = new Date(`${dados.data}T00:00:00Z`);
    const hoje = new Date();

    if (data.getTime() > hoje.getTime() + 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        mensagem: "Dados inválidos.",
        campos: { data: ["Não dá para relatar um encontro que ainda não aconteceu."] },
      };
    }
    // Um ano de folga: corrigir o histórico é legítimo, digitar 2015 por engano
    // no lugar de 2025 não é.
    if (data.getTime() < hoje.getTime() - 366 * 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        mensagem: "Dados inválidos.",
        campos: { data: ["Data muito antiga. Confira o ano."] },
      };
    }

    if (dados.decisoes > dados.presentes + dados.visitantes) {
      return {
        ok: false,
        mensagem: "Dados inválidos.",
        campos: { decisoes: ["Há mais decisões do que pessoas no encontro. Confira os números."] },
      };
    }

    const existente = await ctx.db.encontroCelula.findFirst({
      where: { celulaId: celula.id, data },
      select: { id: true },
    });

    if (existente) {
      await ctx.db.encontroCelula.update({
        where: { id: existente.id },
        data: {
          presentes: dados.presentes,
          visitantes: dados.visitantes,
          decisoes: dados.decisoes,
          ofertaCentavos: dados.oferta,
          observacoes: dados.observacoes ?? null,
          registradoPorId: ctx.sessao.userId,
        },
      });
    } else {
      await ctx.db.encontroCelula.create({
        data: {
          tenantId: ctx.tenant.id,
          celulaId: celula.id,
          data,
          presentes: dados.presentes,
          visitantes: dados.visitantes,
          decisoes: dados.decisoes,
          ofertaCentavos: dados.oferta,
          observacoes: dados.observacoes ?? null,
          registradoPorId: ctx.sessao.userId,
        },
      });
    }

    await auditar(ctx, {
      acao: existente ? "celula.encontro.corrigir" : "celula.encontro.registrar",
      alvoTipo: "Celula",
      alvoId: celula.id,
      detalhes: {
        data: dados.data,
        presentes: dados.presentes,
        visitantes: dados.visitantes,
        decisoes: dados.decisoes,
      },
    });

    revalidatePath(`/painel/celulas/${celula.id}`);
    revalidatePath("/painel/celulas");

    return {
      ok: true,
      mensagem: existente ? "Relatório do encontro atualizado." : "Encontro registrado.",
      celulaId: celula.id,
    };
  } catch (erro) {
    return traduzirErro(erro, "registrarEncontro");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/**
 * Célula que o usuário atual pode tocar.
 *
 * `filtroDeEscopo()` devolve `{ celulaId }`, que é a chave usada nas consultas
 * de PESSOA. Em `Celula` o campo equivalente é o próprio `id` — por isso o
 * recorte é traduzido aqui, em vez de espalhar o objeto direto no `where` (o
 * que seria um erro de argumento do Prisma, ou pior, um filtro silenciosamente
 * ignorado numa versão futura).
 *
 * O fallback `__sem-celula__` é falha fechada: líder sem célula atribuída não
 * alcança nenhuma, em vez de alcançar todas.
 */
async function celulaAcessivel(
  ctx: ContextoAutorizado,
  celulaId: string,
): Promise<{ id: string; nome: string } | null> {
  const restricao =
    ctx.papel === "LIDER_CELULA" ? { id: ctx.sessao.celulaId ?? "__sem-celula__" } : {};

  return ctx.db.celula.findFirst({
    where: { id: celulaId, ...restricao },
    select: { id: true, nome: true },
  });
}

async function validarCampus(
  ctx: ContextoAutorizado,
  campusId?: string,
): Promise<ResultadoAcao | null> {
  if (!campusId) return null;

  const campus = await ctx.db.campus.findFirst({ where: { id: campusId }, select: { id: true } });
  if (!campus) {
    return { ok: false, mensagem: "Dados inválidos.", campos: { campusId: ["Campus não encontrado."] } };
  }
  return null;
}

/** Latitude sem longitude (ou o contrário) não posiciona nada no mapa. */
function validarCoordenadas(dados: { latitude?: number; longitude?: number }): ResultadoAcao | null {
  const temUma = dados.latitude !== undefined || dados.longitude !== undefined;
  const temAmbas = dados.latitude !== undefined && dados.longitude !== undefined;

  if (temUma && !temAmbas) {
    return {
      ok: false,
      mensagem: "Dados inválidos.",
      campos: { latitude: ["Informe latitude e longitude juntas, ou deixe as duas em branco."] },
    };
  }
  return null;
}

function traduzirErro(erro: unknown, acao: string): ResultadoAcao {
  if (erro instanceof z.ZodError) {
    const campos: Record<string, string[]> = {};
    for (const p of erro.issues) {
      (campos[p.path.join(".") || "_"] ??= []).push(p.message);
    }
    return { ok: false, mensagem: "Confira os campos destacados.", campos };
  }

  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "NaoAutenticadoError") {
    return { ok: false, mensagem: "Sessão expirada. Faça login novamente." };
  }
  if (nome === "NaoAutorizadoError") {
    return { ok: false, mensagem: "Você não tem permissão para esta ação." };
  }
  if (nome === "ViolacaoTenantError") {
    logger.erro("VIOLACAO DE ISOLAMENTO DE TENANT em Server Action", erro, { acao });
    return { ok: false, mensagem: "Célula não encontrada." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
