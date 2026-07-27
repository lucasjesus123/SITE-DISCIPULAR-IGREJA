"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao, type ContextoAutorizado } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  id as idSchema,
  slug as slugSchema,
  textoLimpo,
  textoLongo,
  horario as horarioSchema,
  diaSemana as diaSemanaSchema,
} from "@/lib/validation/comum";
import type { StatusMatricula } from "@prisma/client";

/**
 * Server Actions da Escola: cursos e matrículas.
 *
 * DINHEIRO NUNCA É FLOAT. NUNCA.
 * `precoCentavos` é um inteiro, e a conversão do que o usuário digita
 * ("R$ 120,00") para centavos é feita por manipulação de STRING — sem
 * `parseFloat`, sem multiplicar por 100. Motivo: em ponto flutuante binário
 * `1.15 * 100` é `114.99999999999999`, e um `Math.round` disfarça o problema
 * até o dia em que não disfarça. Mensalidade de curso é combinado com pessoas
 * reais; um centavo errado é uma conversa constrangedora na secretaria.
 *
 * VAGAS SÃO CONFERIDAS NA ESCRITA.
 * Mostrar "3 vagas restantes" na tela não impede nada — a Server Action aceita
 * qualquer payload de quem a chamar direto. A contagem é refeita no servidor
 * no momento de confirmar a matrícula.
 */

export interface ResultadoAcao {
  ok: boolean;
  mensagem: string;
  campos?: Record<string, string[]>;
  /** Preenchido no sucesso da criação, para o cliente navegar até o curso. */
  cursoId?: string;
}

// -----------------------------------------------------------------------------
// Blocos de validação
// -----------------------------------------------------------------------------

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

/**
 * "R$ 1.250,90", "1250,9", "1250.90", "1250" -> 125090 centavos.
 *
 * Regra de leitura: o ÚLTIMO separador só é decimal se sobrarem 1 ou 2 dígitos
 * depois dele. Assim "1.250" é mil duzentos e cinquenta reais (separador de
 * milhar) e "1.25" é um real e vinte e cinco centavos — que é como as duas
 * notações realmente aparecem em português.
 *
 * O resultado é montado concatenando dígitos e lido com `parseInt`. Em nenhum
 * ponto existe aritmética de ponto flutuante.
 */
const precoEmCentavos = z
  .string()
  .trim()
  .max(20)
  .transform((bruto, ctx): number => {
    const limpo = bruto.replace(/[^\d.,]/g, "");
    if (limpo === "" || !/\d/.test(limpo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um valor válido, como 120,00." });
      return z.NEVER;
    }

    const ultimoSeparador = Math.max(limpo.lastIndexOf(","), limpo.lastIndexOf("."));
    const fracao = ultimoSeparador === -1 ? "" : limpo.slice(ultimoSeparador + 1);

    const ehDecimal = ultimoSeparador !== -1 && /^\d{1,2}$/.test(fracao);

    const parteInteira = (ehDecimal ? limpo.slice(0, ultimoSeparador) : limpo).replace(/[.,]/g, "");
    const parteDecimal = ehDecimal ? fracao.padEnd(2, "0") : "00";

    if (!/^\d{1,9}$/.test(parteInteira)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe um valor válido, como 120,00." });
      return z.NEVER;
    }

    return Number.parseInt(`${parteInteira}${parteDecimal}`, 10);
  })
  .pipe(z.number().int().min(0).max(99_999_999, "Valor alto demais."));

const schemaCurso = z.object({
  nome: textoLimpo(160, 3),
  /** Em branco = derivado do nome. */
  slug: opcional(slugSchema),
  resumo: opcional(textoLimpo(400)),
  descricao: opcional(textoLongo(6000)),

  diaSemana: opcional(diaSemanaSchema),
  horario: opcional(horarioSchema),

  preco: opcional(precoEmCentavos),
  periodicidade: opcional(z.enum(["MENSAL", "UNICO"])),

  vagas: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().min(1).max(10_000).optional(),
  ),

  inscricoesAbertas: booleano,
  ativo: booleano,
  ordem: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().int().min(0).max(999).optional(),
  ),
});

type DadosCurso = z.infer<typeof schemaCurso>;

/**
 * Status que OCUPAM vaga.
 *
 * `INSCRITO` fica de fora de propósito: inscrição é intenção, e a igreja
 * costuma receber mais inscrições do que confirmações. Se o inscrito ocupasse
 * vaga, uma turma de 30 fecharia com 12 pessoas de verdade.
 */
const OCUPAM_VAGA: StatusMatricula[] = ["CONFIRMADO", "CURSANDO"];

const STATUS_MATRICULA = [
  "INSCRITO",
  "CONFIRMADO",
  "CURSANDO",
  "CONCLUIDO",
  "CANCELADO",
] as const;

// -----------------------------------------------------------------------------
// Curso — criar
// -----------------------------------------------------------------------------

export async function criarCurso(dadosBrutos: unknown): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("cursos.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const dados = schemaCurso.parse(dadosBrutos);

    const erroHorario = validarHorario(dados);
    if (erroHorario) return erroHorario;

    const slug = await slugLivre(ctx, dados.slug ?? derivarSlug(dados.nome));
    if (!slug) {
      return {
        ok: false,
        mensagem: "Confira os campos destacados.",
        campos: { slug: ["Já existem cursos demais com esse endereço. Mude o nome ou o endereço."] },
      };
    }

    const curso = await ctx.db.curso.create({
      data: { ...camposComuns(dados), slug },
      select: { id: true },
    });

    await auditar(ctx, {
      acao: "curso.criar",
      alvoTipo: "Curso",
      alvoId: curso.id,
      detalhes: {
        slug,
        precoCentavos: dados.preco ?? null,
        vagas: dados.vagas ?? null,
        inscricoesAbertas: dados.inscricoesAbertas,
      },
    });

    revalidarCursos();
    return { ok: true, mensagem: "Curso criado.", cursoId: curso.id };
  } catch (erro) {
    return traduzirErro(erro, "criarCurso");
  }
}

// -----------------------------------------------------------------------------
// Curso — atualizar
// -----------------------------------------------------------------------------

export async function atualizarCurso(
  cursoId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("cursos.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(cursoId);
    const dados = schemaCurso.parse(dadosBrutos);

    const erroHorario = validarHorario(dados);
    if (erroHorario) return erroHorario;

    const atual = await ctx.db.curso.findFirst({
      where: { id },
      select: { id: true, slug: true, precoCentavos: true, vagas: true },
    });
    if (!atual) return { ok: false, mensagem: "Curso não encontrado." };

    /**
     * Reduzir vagas abaixo de quem já está confirmado não é proibido — a turma
     * pode ter mudado de sala. Mas avisamos, porque o efeito prático é que a
     * contagem passa a mostrar lotação estourada e ninguém entende por quê.
     */
    let avisoVagas = "";
    if (dados.vagas !== undefined) {
      const ocupadas = await ctx.db.matricula.count({
        where: { cursoId: id, status: { in: OCUPAM_VAGA } },
      });
      if (ocupadas > dados.vagas) {
        avisoVagas = ` Atenção: já existem ${ocupadas} matrículas ocupando vaga, acima do novo limite de ${dados.vagas}.`;
      }
    }

    // O slug só muda quando pedido explicitamente: ele é o endereço público do
    // curso, e renomeá-lo a cada edição quebraria os links já divulgados.
    let slug = atual.slug;
    if (dados.slug && dados.slug !== atual.slug) {
      const candidato = await slugLivre(ctx, dados.slug, id);
      if (!candidato) {
        return {
          ok: false,
          mensagem: "Confira os campos destacados.",
          campos: { slug: ["Este endereço já está em uso por outro curso."] },
        };
      }
      slug = candidato;
    }

    await ctx.db.curso.update({ where: { id }, data: { ...camposComuns(dados), slug } });

    await auditar(ctx, {
      acao: "curso.atualizar",
      alvoTipo: "Curso",
      alvoId: id,
      detalhes: {
        precoAnteriorCentavos: atual.precoCentavos,
        precoNovoCentavos: dados.preco ?? null,
        vagasAnterior: atual.vagas,
        vagasNovo: dados.vagas ?? null,
      },
    });

    revalidarCursos(id);
    return { ok: true, mensagem: `Curso salvo.${avisoVagas}`, cursoId: id };
  } catch (erro) {
    return traduzirErro(erro, "atualizarCurso");
  }
}

// -----------------------------------------------------------------------------
// Curso — excluir
// -----------------------------------------------------------------------------

/**
 * Exclui o curso. Bloqueado quando existem matrículas.
 *
 * A relação no schema é `onDelete: Cascade`: apagar o curso levaria junto o
 * histórico de quem estudou nele. Quem quer só encerrar a turma desmarca
 * "ativo" — que é a operação real por trás deste botão em 99% dos casos.
 */
export async function excluirCurso(cursoId: string): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("cursos.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(cursoId);

    const curso = await ctx.db.curso.findFirst({
      where: { id },
      select: { id: true, nome: true, slug: true },
    });
    if (!curso) return { ok: false, mensagem: "Curso não encontrado." };

    const matriculas = await ctx.db.matricula.count({ where: { cursoId: id } });
    if (matriculas > 0) {
      return {
        ok: false,
        mensagem: `Este curso tem ${matriculas} ${matriculas === 1 ? "matrícula" : "matrículas"} e não pode ser excluído — o histórico de quem estudou aqui seria perdido. Desmarque "Ativo" para encerrá-lo.`,
      };
    }

    await ctx.db.curso.delete({ where: { id } });

    await auditar(ctx, {
      acao: "curso.excluir",
      alvoTipo: "Curso",
      alvoId: id,
      detalhes: { nome: curso.nome, slug: curso.slug },
    });

    revalidarCursos();
    return { ok: true, mensagem: "Curso excluído." };
  } catch (erro) {
    return traduzirErro(erro, "excluirCurso");
  }
}

// -----------------------------------------------------------------------------
// Matrículas
// -----------------------------------------------------------------------------

const schemaStatusMatricula = z.object({
  status: z.enum(STATUS_MATRICULA),
  observacoes: opcional(textoLongo(2000)),
});

/**
 * Confirma, coloca em curso, conclui ou cancela uma matrícula.
 *
 * Uma única ação para todas as transições, com o destino validado por lista
 * fechada. A alternativa (uma action por botão) multiplicaria por cinco o
 * mesmo bloco de permissão + rate limit + auditoria, e cada cópia seria uma
 * chance de esquecer um deles.
 */
export async function definirStatusMatricula(
  matriculaId: string,
  dadosBrutos: unknown,
): Promise<ResultadoAcao> {
  try {
    const ctx = await exigirPermissao("cursos.gerenciar");

    const limite = await verificarLimite(REGRAS.escritaPainel, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas alterações seguidas. Aguarde um instante." };
    }

    const id = idSchema.parse(matriculaId);
    const dados = schemaStatusMatricula.parse(dadosBrutos);

    const matricula = await ctx.db.matricula.findFirst({
      where: { id },
      select: {
        id: true,
        status: true,
        nome: true,
        cursoId: true,
        curso: { select: { id: true, nome: true, vagas: true } },
      },
    });
    if (!matricula) return { ok: false, mensagem: "Matrícula não encontrada." };

    /**
     * Controle de vagas, refeito NO SERVIDOR no instante da confirmação.
     *
     * A contagem exclui a própria matrícula: se ela já ocupava vaga (indo de
     * CONFIRMADO para CURSANDO, por exemplo), contá-la de novo faria a última
     * vaga da turma parecer ocupada duas vezes.
     */
    const vagas = matricula.curso.vagas;
    const vaiOcupar = OCUPAM_VAGA.includes(dados.status);
    const jaOcupava = OCUPAM_VAGA.includes(matricula.status);

    if (vagas !== null && vaiOcupar && !jaOcupava) {
      const ocupadas = await ctx.db.matricula.count({
        where: { cursoId: matricula.cursoId, status: { in: OCUPAM_VAGA }, id: { not: id } },
      });
      if (ocupadas >= vagas) {
        return {
          ok: false,
          mensagem: `As ${vagas} vagas de "${matricula.curso.nome}" já estão ocupadas. Aumente as vagas ou cancele outra matrícula antes.`,
        };
      }
    }

    await ctx.db.matricula.update({
      where: { id },
      data: {
        status: dados.status,
        // `undefined` não toca na coluna: salvar o status sem preencher a
        // observação não pode apagar a anotação que alguém já tinha feito.
        ...(dados.observacoes === undefined ? {} : { observacoes: dados.observacoes }),
      },
    });

    await auditar(ctx, {
      acao: "matricula.status",
      alvoTipo: "Matricula",
      alvoId: id,
      detalhes: {
        cursoId: matricula.cursoId,
        statusAnterior: matricula.status,
        statusNovo: dados.status,
      },
    });

    revalidarCursos(matricula.cursoId);
    return { ok: true, mensagem: `Matrícula de ${matricula.nome}: ${rotuloStatus(dados.status)}.` };
  } catch (erro) {
    return traduzirErro(erro, "definirStatusMatricula");
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function camposComuns(dados: DadosCurso) {
  return {
    nome: dados.nome,
    resumo: dados.resumo ?? null,
    descricao: dados.descricao ?? null,
    diaSemana: dados.diaSemana ?? null,
    horario: dados.horario ?? null,
    // Já em CENTAVOS, inteiro. Nenhum ponto flutuante chegou até aqui.
    precoCentavos: dados.preco ?? null,
    periodicidade: dados.periodicidade ?? null,
    vagas: dados.vagas ?? null,
    inscricoesAbertas: dados.inscricoesAbertas,
    ativo: dados.ativo,
    ordem: dados.ordem ?? 0,
  };
}

/** Dia e horário andam juntos: um sem o outro não informa nada a quem lê o site. */
function validarHorario(dados: DadosCurso): ResultadoAcao | null {
  const temDia = dados.diaSemana !== undefined;
  const temHora = dados.horario !== undefined;
  if (temDia === temHora) return null;

  return {
    ok: false,
    mensagem: "Confira os campos destacados.",
    campos: temHora
      ? { diaSemana: ["Informe também o dia da semana."] }
      : { horario: ["Informe também o horário."] },
  };
}

/** "Teologia Discipular" -> "teologia-discipular" */
function derivarSlug(nome: string): string {
  const base = nome
    .normalize("NFD")
    // Remove os diacríticos separados pela decomposição NFD, senão "Coração"
    // viraria "corao".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Alfabeto fechado: nada parecido com caminho ("../", "%2f") sobrevive.
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");

  return base.length >= 2 ? base : "curso";
}

/**
 * Primeira variação livre DENTRO da igreja: `base`, `base-2`, `base-3`…
 * A contagem passa pelo `ctx.db`, então duas igrejas podem ter o mesmo slug
 * sem conflito — que é justamente o que `@@unique([tenantId, slug])` permite.
 */
async function slugLivre(
  ctx: ContextoAutorizado,
  base: string,
  ignorarId?: string,
): Promise<string | null> {
  for (let tentativa = 0; tentativa < 25; tentativa += 1) {
    const candidato = tentativa === 0 ? base : `${base.slice(0, 74)}-${tentativa + 1}`;

    const existe = await ctx.db.curso.count({
      where: { slug: candidato, ...(ignorarId ? { id: { not: ignorarId } } : {}) },
    });
    if (existe === 0) return candidato;
  }
  return null;
}

function rotuloStatus(status: string): string {
  const mapa: Record<string, string> = {
    INSCRITO: "inscrito",
    CONFIRMADO: "confirmada",
    CURSANDO: "cursando",
    CONCLUIDO: "concluída",
    CANCELADO: "cancelada",
  };
  return mapa[status] ?? status;
}

function revalidarCursos(cursoId?: string): void {
  revalidatePath("/painel/cursos");
  if (cursoId) revalidatePath(`/painel/cursos/${cursoId}`);
  // Os cursos aparecem na página da Escola e no bloco de cursos do site.
  revalidatePath("/", "layout");
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
    return { ok: false, mensagem: "Registro não encontrado." };
  }

  const ref = logger.erro("Falha em Server Action", erro, { acao });
  return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
}
