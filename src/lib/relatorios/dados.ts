import type { TenantDb } from "@/lib/db/tenant-client";
import type { Intervalo } from "@/lib/secretaria/periodo";
import type { RelatorioChave } from "@/lib/relatorios/catalogo";
import { formatarCentavos } from "@/lib/financeiro/dinheiro";
import { FORMULARIOS, ehColuna, type TipoRegistro, type CampoDef } from "@/lib/secretaria/tipos";
import { nomeDia } from "@/lib/services/site";

/**
 * Carregador dos dados de cada relatório. Tudo escopado por `ctx.db`
 * (tenant-safe). Devolve colunas + linhas já formatadas + um resumo opcional,
 * prontos para a moldura de PDF exibir.
 */

export interface ResultadoRelatorio {
  titulo: string;
  colunas: string[];
  linhas: string[][];
  /** Índices das colunas que são numéricas (alinhadas à direita). */
  numericas?: number[];
  /** Cartões de destaque (totais). */
  resumo?: { rotulo: string; valor: string }[];
}

function fmtData(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
}

function inicioFim(intervalo: Intervalo) {
  return { gte: new Date(intervalo.inicioMs), lt: new Date(intervalo.fimMs) };
}

// -----------------------------------------------------------------------------
// FINANCEIRO
// -----------------------------------------------------------------------------

type LancClassificado = { data: Date; historico: string; valor: bigint; tipo: "ENTRADA" | "SAIDA" | "OUTRO" };

async function lancamentosDoPeriodo(db: TenantDb, intervalo: Intervalo): Promise<LancClassificado[]> {
  const lancs = await db.lancamentoFinanceiro.findMany({
    where: { dataCompetencia: inicioFim(intervalo), estornado: false },
    orderBy: { dataCompetencia: "asc" },
    select: {
      historico: true,
      valorCentavos: true,
      dataCompetencia: true,
      partidas: { select: { debitoCentavos: true, creditoCentavos: true, conta: { select: { natureza: true } } } },
    },
  });
  return lancs.map((l) => {
    const entrada = l.partidas.some((p) => p.conta.natureza === "RECEITA" && p.creditoCentavos > 0n);
    const saida = l.partidas.some((p) => p.conta.natureza === "DESPESA" && p.debitoCentavos > 0n);
    return {
      data: l.dataCompetencia,
      historico: l.historico,
      valor: l.valorCentavos,
      tipo: entrada ? "ENTRADA" : saida ? "SAIDA" : "OUTRO",
    };
  });
}

function resumoFinanceiro(lancs: LancClassificado[]) {
  const entradas = lancs.filter((l) => l.tipo === "ENTRADA").reduce((s, l) => s + l.valor, 0n);
  const saidas = lancs.filter((l) => l.tipo === "SAIDA").reduce((s, l) => s + l.valor, 0n);
  return { entradas, saidas, saldo: entradas - saidas };
}

// -----------------------------------------------------------------------------
// SECRETARIA (reaproveita as definições dos formulários)
// -----------------------------------------------------------------------------

function valorCampo(campo: CampoDef, r: Record<string, unknown>): string {
  const bruto = ehColuna(campo.chave) ? r[campo.chave] : (r.extra as Record<string, unknown> | null)?.[campo.chave];
  if (bruto === null || bruto === undefined || bruto === "") return "—";
  if (campo.tipo === "data") return fmtData(new Date(bruto as string));
  if (campo.tipo === "sim_nao") return bruto === true ? "Sim" : bruto === false ? "Não" : "—";
  return String(bruto);
}

async function relatorioPorTipoSecretaria(db: TenantDb, intervalo: Intervalo, tipo: TipoRegistro): Promise<ResultadoRelatorio> {
  const def = FORMULARIOS[tipo];
  const registros = await db.registroSecretaria.findMany({
    where: { tipo, criadoEm: inicioFim(intervalo) },
    orderBy: { criadoEm: "asc" },
    take: 3000,
  });
  const colunas = [...def.campos.map((c) => c.rotulo), "Cadastrado por"];
  const linhas = registros.map((r) => [
    ...def.campos.map((c) => valorCampo(c, r as unknown as Record<string, unknown>)),
    r.criadoPorNome ?? "—",
  ]);
  return { titulo: def.rotulo, colunas, linhas, resumo: [{ rotulo: "Total", valor: String(registros.length) }] };
}

// -----------------------------------------------------------------------------
// Despacho
// -----------------------------------------------------------------------------

export async function carregarRelatorio(
  chave: RelatorioChave,
  db: TenantDb,
  intervalo: Intervalo,
): Promise<ResultadoRelatorio> {
  switch (chave) {
    case "financeiro": {
      const lancs = await lancamentosDoPeriodo(db, intervalo);
      const t = resumoFinanceiro(lancs);
      return {
        titulo: "Financeiro completo",
        colunas: ["Data", "Histórico", "Tipo", "Valor"],
        numericas: [3],
        linhas: lancs.map((l) => [
          fmtData(l.data),
          l.historico,
          l.tipo === "ENTRADA" ? "Entrada" : l.tipo === "SAIDA" ? "Saída" : "Transf.",
          formatarCentavos(l.valor),
        ]),
        resumo: [
          { rotulo: "Entradas", valor: formatarCentavos(t.entradas) },
          { rotulo: "Saídas", valor: formatarCentavos(t.saidas) },
          { rotulo: "Saldo", valor: formatarCentavos(t.saldo) },
        ],
      };
    }
    case "entradas": {
      const lancs = (await lancamentosDoPeriodo(db, intervalo)).filter((l) => l.tipo === "ENTRADA");
      const total = lancs.reduce((s, l) => s + l.valor, 0n);
      return {
        titulo: "Entradas (receitas)",
        colunas: ["Data", "Histórico", "Valor"],
        numericas: [2],
        linhas: lancs.map((l) => [fmtData(l.data), l.historico, formatarCentavos(l.valor)]),
        resumo: [{ rotulo: "Total de entradas", valor: formatarCentavos(total) }],
      };
    }
    case "saidas": {
      const lancs = (await lancamentosDoPeriodo(db, intervalo)).filter((l) => l.tipo === "SAIDA");
      const total = lancs.reduce((s, l) => s + l.valor, 0n);
      return {
        titulo: "Saídas (despesas)",
        colunas: ["Data", "Histórico", "Valor"],
        numericas: [2],
        linhas: lancs.map((l) => [fmtData(l.data), l.historico, formatarCentavos(l.valor)]),
        resumo: [{ rotulo: "Total de saídas", valor: formatarCentavos(total) }],
      };
    }

    case "secretaria": {
      const grupos = await db.registroSecretaria.groupBy({
        by: ["tipo"],
        where: { criadoEm: inicioFim(intervalo) },
        _count: { _all: true },
      });
      const registros = await db.registroSecretaria.findMany({
        where: { criadoEm: inicioFim(intervalo) },
        orderBy: { criadoEm: "asc" },
        take: 3000,
        select: { nome: true, tipo: true, contato: true, dataReferencia: true, criadoPorNome: true },
      });
      const contagem = new Map(grupos.map((g) => [g.tipo, g._count._all]));
      return {
        titulo: "Secretaria — geral",
        colunas: ["Nome", "Tipo", "Contato", "Data", "Cadastrado por"],
        linhas: registros.map((r) => [
          r.nome,
          FORMULARIOS[r.tipo as TipoRegistro].rotulo,
          r.contato ?? "—",
          fmtData(r.dataReferencia),
          r.criadoPorNome ?? "—",
        ]),
        resumo: (Object.keys(FORMULARIOS) as TipoRegistro[]).map((t) => ({
          rotulo: FORMULARIOS[t].rotulo,
          valor: String(contagem.get(t) ?? 0),
        })),
      };
    }
    case "visitantes":
      return relatorioPorTipoSecretaria(db, intervalo, "VISITANTE");
    case "batismos": {
      // Fonte única de batismo: a fila de solicitações (formulário público do
      // site + fluxo SOLICITADO→REALIZADO). É a mesma lista da Secretaria.
      const sol = await db.solicitacaoBatismo.findMany({
        where: { criadoEm: inicioFim(intervalo) },
        orderBy: { criadoEm: "asc" },
        take: 3000,
        select: { nome: true, telefone: true, email: true, status: true, dataBatismo: true, criadoEm: true },
      });
      const rot: Record<string, string> = {
        SOLICITADO: "Solicitado", EM_PREPARO: "Em preparo", APROVADO: "Aprovado",
        AGENDADO: "Agendado", REALIZADO: "Realizado", RECUSADO: "Recusado", CANCELADO: "Cancelado",
      };
      const aguardando = sol.filter((s) => ["SOLICITADO", "EM_PREPARO", "APROVADO"].includes(s.status)).length;
      return {
        titulo: "Batismos",
        colunas: ["Nome", "Contato", "Status", "Data do batismo", "Solicitado em"],
        linhas: sol.map((s) => [
          s.nome,
          s.telefone ?? s.email ?? "—",
          rot[s.status] ?? s.status,
          fmtData(s.dataBatismo),
          fmtData(s.criadoEm),
        ]),
        resumo: [
          { rotulo: "Total", valor: String(sol.length) },
          { rotulo: "Realizados", valor: String(sol.filter((s) => s.status === "REALIZADO").length) },
          { rotulo: "Agendados", valor: String(sol.filter((s) => s.status === "AGENDADO").length) },
          { rotulo: "Aguardando", valor: String(aguardando) },
        ],
      };
    }
    case "apresentacoes":
      return relatorioPorTipoSecretaria(db, intervalo, "APRESENTACAO_CRIANCA");

    case "novos-membros": {
      const pessoas = await db.pessoa.findMany({
        where: { status: "MEMBRO", excluidoEm: null, criadoEm: inicioFim(intervalo) },
        orderBy: { criadoEm: "asc" },
        take: 3000,
        select: { nome: true, telefone: true, dataConversao: true, batizado: true, criadoEm: true },
      });
      const totalMembros = await db.pessoa.count({ where: { status: "MEMBRO", excluidoEm: null } });
      return {
        titulo: "Novos membros",
        colunas: ["Nome", "Contato", "Conversão", "Batizado", "Registrado em"],
        linhas: pessoas.map((p) => [
          p.nome,
          p.telefone ?? "—",
          fmtData(p.dataConversao),
          p.batizado ? "Sim" : "Não",
          fmtData(p.criadoEm),
        ]),
        resumo: [
          { rotulo: "Novos no período", valor: String(pessoas.length) },
          { rotulo: "Membros no total", valor: String(totalMembros) },
        ],
      };
    }

    case "celulas": {
      const [celulas, encontros, totais] = await Promise.all([
        db.celula.findMany({ where: { ativa: true }, select: { id: true, nome: true, diaSemana: true, horario: true, bairro: true, cidade: true } }),
        db.encontroCelula.groupBy({
          by: ["celulaId"],
          where: { data: inicioFim(intervalo) },
          _sum: { presentes: true, visitantes: true, decisoes: true },
          _count: { _all: true },
        }),
        db.encontroCelula.aggregate({
          where: { data: inicioFim(intervalo) },
          _sum: { presentes: true, visitantes: true, decisoes: true, ofertaCentavos: true },
          _count: { _all: true },
        }),
      ]);
      const porCelula = new Map(encontros.map((e) => [e.celulaId, e]));
      const linhas = celulas
        .map((c) => {
          const e = porCelula.get(c.id);
          const quando = [nomeDia(c.diaSemana), c.horario].filter(Boolean).join(" · ") || "—";
          const local = [c.bairro, c.cidade].filter(Boolean).join(", ") || "—";
          return [
            c.nome,
            quando,
            local,
            String(e?._count._all ?? 0),
            String(e?._sum.presentes ?? 0),
            String(e?._sum.visitantes ?? 0),
            String(e?._sum.decisoes ?? 0),
          ];
        })
        .sort((a, b) => Number(b[3]) - Number(a[3]));
      return {
        titulo: "Células",
        colunas: ["Célula", "Quando", "Local", "Encontros", "Presença", "Visitantes", "Decisões"],
        numericas: [3, 4, 5, 6],
        linhas,
        resumo: [
          { rotulo: "Células ativas", valor: String(celulas.length) },
          { rotulo: "Encontros no período", valor: String(totais._count._all) },
          { rotulo: "Presença total", valor: String(totais._sum.presentes ?? 0) },
          { rotulo: "Visitantes", valor: String(totais._sum.visitantes ?? 0) },
          { rotulo: "Decisões", valor: String(totais._sum.decisoes ?? 0) },
          { rotulo: "Ofertas", valor: formatarCentavos(BigInt(totais._sum.ofertaCentavos ?? 0)) },
        ],
      };
    }
    default: {
      const _exaustivo: never = chave;
      throw new Error(`Relatório desconhecido: ${String(_exaustivo)}`);
    }
  }
}
