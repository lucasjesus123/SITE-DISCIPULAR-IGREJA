import { notFound } from "next/navigation";
import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { carregarModulos } from "@/lib/services/modulos";
import { relatorioPorChave } from "@/lib/relatorios/catalogo";
import { carregarRelatorio } from "@/lib/relatorios/dados";
import { intervaloPeriodo, ehPeriodo, PERIODOS, type Periodo } from "@/lib/secretaria/periodo";
import { RelatorioChrome } from "@/components/painel/relatorios/RelatorioChrome";
import { BotaoImprimir } from "@/components/painel/secretaria/BotaoImprimir";

export const dynamic = "force-dynamic";

export default async function PaginaRelatorio({
  params,
  searchParams,
}: {
  params: Promise<{ relatorio: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { relatorio } = await params;
  const def = relatorioPorChave(relatorio);
  if (!def) notFound();

  const ctx = await exigirPermissao("relatorios.ver");

  // Gaveta desligada (ex.: igreja sem financeiro): não expõe o relatório.
  if (def.modulo) {
    const modulos = await carregarModulos(ctx.db);
    if (!modulos[def.modulo]) {
      return (
        <div className="painel__topo">
          <div>
            <h1 className="painel__titulo">{def.rotulo}</h1>
            <p className="painel__sub">Este relatório pertence a um módulo que não está ativo para esta igreja.</p>
          </div>
          <Link href="/painel/relatorios" className="btn btn--sm btn--ghost">← Relatórios</Link>
        </div>
      );
    }
  }

  const sp = await searchParams;
  const periodo: Periodo = typeof sp.periodo === "string" && ehPeriodo(sp.periodo) ? sp.periodo : "mes";
  const intervalo = intervaloPeriodo(periodo, Date.now());

  const [resultado, config, sede] = await Promise.all([
    carregarRelatorio(def.chave, ctx.db, intervalo),
    ctx.db.siteConfig.findFirst({
      select: { nomeExibicao: true, logoEscuroId: true, emailContato: true, telefoneContato: true, whatsapp: true },
    }),
    ctx.db.campus.findFirst({ where: { principal: true }, orderBy: { ordem: "asc" } }),
  ]);

  const igreja = config?.nomeExibicao ?? ctx.tenant.nome;
  // Logo p/ papel BRANCO = logo escuro. Fallback do tenant-âncora: a marca escura.
  const logoUrl = config?.logoEscuroId
    ? urlArquivoPublico(config.logoEscuroId)
    : ctx.tenant.slug === "discipular"
      ? "/marca/mark-dark.png"
      : null;

  const endereco = sede
    ? [
        [sede.logradouro, sede.numero].filter(Boolean).join(", "),
        [sede.bairro, sede.cidade, sede.uf].filter(Boolean).join(", "),
      ].filter(Boolean).join(" — ") || null
    : null;
  const contatos = [config?.telefoneContato || config?.whatsapp, config?.emailContato].filter(Boolean).join(" · ") || null;

  const geradoEm = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date());

  return (
    <>
      {/* Barra de controle — não vai para o PDF */}
      <div className="nao-imprimir painel__topo">
        <div>
          <p className="painel__sub" style={{ marginBottom: ".2rem" }}>
            <Link href="/painel/relatorios">← Central de Relatórios</Link>
          </p>
          <h1 className="painel__titulo">{def.icone} {def.rotulo}</h1>
        </div>
        <BotaoImprimir />
      </div>
      <div className="nao-imprimir" style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            href={`/painel/relatorios/${def.chave}?periodo=${p.chave}`}
            className={`btn btn--sm ${p.chave === periodo ? "" : "btn--ghost"}`}
          >
            {p.rotulo}
          </Link>
        ))}
      </div>

      <RelatorioChrome
        igreja={igreja}
        titulo={resultado.titulo}
        periodoRotulo={intervalo.rotulo}
        geradoEm={geradoEm}
        total={resultado.linhas.length}
        logoUrl={logoUrl}
        endereco={endereco}
        contatos={contatos}
        resumo={
          resultado.resumo && (
            <>
              {resultado.resumo.map((r, i) => (
                <div className="rel-card" key={i}>
                  <b>{r.valor}</b>
                  <span>{r.rotulo}</span>
                </div>
              ))}
            </>
          )
        }
      >
        {resultado.linhas.length === 0 ? (
          <p className="dim">Nenhum registro neste período.</p>
        ) : (
          <table className="rel-tab">
            <thead>
              <tr>
                <th className="num">#</th>
                {resultado.colunas.map((c, i) => (
                  <th key={i} className={resultado.numericas?.includes(i) ? "num" : undefined}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map((linha, li) => (
                <tr key={li}>
                  <td className="num">{li + 1}</td>
                  {linha.map((celula, ci) => (
                    <td key={ci} className={resultado.numericas?.includes(ci) ? "num" : undefined}>{celula}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </RelatorioChrome>
    </>
  );
}
