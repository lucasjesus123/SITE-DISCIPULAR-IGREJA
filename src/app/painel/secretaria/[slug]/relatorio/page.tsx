import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { formularioPorSlug, ehColuna, type CampoDef } from "@/lib/secretaria/tipos";
import { intervaloPeriodo, ehPeriodo, PERIODOS, type Periodo } from "@/lib/secretaria/periodo";
import { BotaoImprimir } from "@/components/painel/secretaria/BotaoImprimir";

export const dynamic = "force-dynamic";

function fmtValor(campo: CampoDef, registro: Record<string, unknown>): string {
  const bruto = ehColuna(campo.chave)
    ? registro[campo.chave]
    : (registro.extra as Record<string, unknown> | null)?.[campo.chave];
  if (bruto === null || bruto === undefined || bruto === "") return "—";
  if (campo.tipo === "data") {
    const d = new Date(bruto as string);
    return Number.isNaN(d.getTime())
      ? "—"
      : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
  }
  if (campo.tipo === "sim_nao") return bruto === true ? "Sim" : bruto === false ? "Não" : "—";
  return String(bruto);
}

export default async function RelatorioSecretaria({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const def = formularioPorSlug(slug);
  if (!def) notFound();

  const ctx = await exigirPermissao("secretaria.gerenciar");

  const sp = await searchParams;
  const periodo: Periodo = typeof sp.periodo === "string" && ehPeriodo(sp.periodo) ? sp.periodo : "mes";
  // Referência = agora (o intervalo contém o instante atual). Determinístico o
  // suficiente para um relatório; a virada de meia-noite não importa aqui.
  const intervalo = intervaloPeriodo(periodo, Date.now());

  const registros = await ctx.db.registroSecretaria.findMany({
    where: { tipo: def.tipo, criadoEm: { gte: new Date(intervalo.inicioMs), lt: new Date(intervalo.fimMs) } },
    orderBy: { criadoEm: "asc" },
    take: 2000,
  });

  const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

  return (
    <div className="relatorio-print">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .relatorio-print, .relatorio-print * { visibility: visible; }
          .relatorio-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 12px; }
          .nao-imprimir { display: none !important; }
          .rel-tabela th, .rel-tabela td { border: 1px solid #999 !important; color: #000 !important; }
        }
        .rel-tabela { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
        .rel-tabela th, .rel-tabela td { border: 1px solid var(--pnl-line); padding: 6px 8px; text-align: left; vertical-align: top; }
        .rel-tabela th { background: var(--pnl-surface-2); font-weight: 700; }
      `}</style>

      <div className="nao-imprimir painel__topo">
        <div>
          <p className="painel__sub" style={{ marginBottom: ".2rem" }}>
            <Link href={`/painel/secretaria/${slug}`}>← {def.rotulo}</Link>
          </p>
          <h1 className="painel__titulo">Relatório · {def.rotulo}</h1>
        </div>
        <BotaoImprimir />
      </div>

      {/* Seletor de período (não vai para o PDF) */}
      <div className="nao-imprimir" style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            href={`/painel/secretaria/${slug}/relatorio?periodo=${p.chave}`}
            className={`btn btn--sm ${p.chave === periodo ? "" : "btn--ghost"}`}
          >
            {p.rotulo}
          </Link>
        ))}
      </div>

      {/* Cabeçalho do relatório (vai para o PDF) */}
      <header style={{ borderBottom: "2px solid var(--pnl-line)", paddingBottom: "10px", marginBottom: "6px" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>{ctx.tenant.nome}</h2>
        <p style={{ margin: ".2rem 0 0", fontWeight: 700 }}>{def.rotulo} — {intervalo.rotulo}</p>
        <p style={{ margin: ".1rem 0 0", fontSize: "12px", opacity: .7 }}>
          {registros.length} {registros.length === 1 ? "registro" : "registros"} · gerado em {geradoEm}
        </p>
      </header>

      {registros.length === 0 ? (
        <p className="dim" style={{ marginTop: "1rem" }}>Nenhum cadastro neste período.</p>
      ) : (
        <table className="rel-tabela">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              {def.campos.map((c) => <th key={c.chave}>{c.rotulo}</th>)}
              <th>Cadastrado por</th>
            </tr>
          </thead>
          <tbody>
            {registros.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                {def.campos.map((c) => (
                  <td key={c.chave}>{fmtValor(c, r as unknown as Record<string, unknown>)}</td>
                ))}
                <td>{r.criadoPorNome ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
