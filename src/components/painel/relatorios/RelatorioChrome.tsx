import { CreditoConexao } from "@/components/CreditoConexao";

/**
 * Moldura padrão dos relatórios: cabeçalho com logo + dados da igreja, marca
 * d'água do logo ao centro, e rodapé. Preparado para imprimir/salvar em PDF —
 * o CSS de impressão esconde o resto do painel e mostra só o documento.
 *
 * Presentational: recebe tudo pronto (a página busca os dados).
 */
export function RelatorioChrome({
  igreja,
  titulo,
  periodoRotulo,
  geradoEm,
  total,
  logoUrl,
  endereco,
  contatos,
  resumo,
  children,
}: {
  igreja: string;
  titulo: string;
  periodoRotulo: string;
  geradoEm: string;
  total: number;
  logoUrl: string | null;
  endereco?: string | null;
  contatos?: string | null;
  /** Linha de destaque opcional (ex.: totais do financeiro). */
  resumo?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relatorio-print rel-doc">
      <style>{CSS_RELATORIO}</style>

      {/* Marca d'água — logo ao centro, bem apagado, atrás de tudo */}
      {logoUrl && (
        <div className="rel-marca" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" />
        </div>
      )}

      {/* Cabeçalho */}
      <header className="rel-cab">
        <div className="rel-cab__marca">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="rel-cab__logo" />
          )}
          <div className="rel-cab__igreja">
            <b>{igreja}</b>
            {endereco && <span>{endereco}</span>}
            {contatos && <span>{contatos}</span>}
          </div>
        </div>
        <div className="rel-cab__meta">
          <h1>{titulo}</h1>
          <span className="rel-cab__periodo">{periodoRotulo}</span>
          <span className="rel-cab__sub">{total} {total === 1 ? "registro" : "registros"} · gerado em {geradoEm}</span>
        </div>
      </header>

      {resumo && <div className="rel-resumo">{resumo}</div>}

      <main className="rel-corpo">{children}</main>

      <footer className="rel-rod">
        <span>{igreja} — relatório interno</span>
        <span><CreditoConexao /></span>
      </footer>
    </div>
  );
}

const CSS_RELATORIO = `
.rel-doc { position: relative; color: var(--pnl-text); }
.rel-marca { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 0; pointer-events: none; opacity: 0.05; }
.rel-marca img { width: 62%; max-width: 460px; object-fit: contain; }
.rel-cab { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; border-bottom: 2px solid var(--pnl-line); padding-bottom: 14px; }
.rel-cab__marca { display: flex; align-items: center; gap: 12px; }
.rel-cab__logo { height: 54px; width: auto; max-width: 180px; object-fit: contain; }
.rel-cab__igreja { display: flex; flex-direction: column; }
.rel-cab__igreja b { font-size: 17px; }
.rel-cab__igreja span { font-size: 12px; opacity: 0.75; }
.rel-cab__meta { text-align: right; }
.rel-cab__meta h1 { margin: 0; font-size: 20px; }
.rel-cab__periodo { display: block; font-weight: 700; margin-top: 2px; }
.rel-cab__sub { display: block; font-size: 12px; opacity: 0.7; }
.rel-resumo { position: relative; z-index: 1; display: flex; gap: 16px; flex-wrap: wrap; margin-top: 14px; }
.rel-corpo { position: relative; z-index: 1; margin-top: 14px; }
.rel-rod { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 22px; padding-top: 10px; border-top: 1px solid var(--pnl-line); font-size: 11px; opacity: 0.7; }
.rel-tab { width: 100%; border-collapse: collapse; font-size: 12px; }
.rel-tab th, .rel-tab td { border: 1px solid var(--pnl-line); padding: 6px 8px; text-align: left; vertical-align: top; }
.rel-tab th { background: var(--pnl-surface-2); font-weight: 700; }
.rel-tab td.num, .rel-tab th.num { text-align: right; white-space: nowrap; }
.rel-card { border: 1px solid var(--pnl-line); border-radius: 10px; padding: 10px 14px; min-width: 150px; }
.rel-card b { display: block; font-size: 18px; }
.rel-card span { font-size: 12px; opacity: 0.7; }

@media print {
  body * { visibility: hidden; }
  .relatorio-print, .relatorio-print * { visibility: visible; }
  .relatorio-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0 10px; }
  .nao-imprimir { display: none !important; }
  .rel-marca { opacity: 0.06; }
  .rel-tab th, .rel-tab td { border-color: #999 !important; color: #000 !important; }
  .rel-cab, .rel-rod { border-color: #999 !important; }
}
`;
