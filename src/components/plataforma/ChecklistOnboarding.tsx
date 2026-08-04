import type { PassoOnboarding } from "@/lib/plataforma/onboarding";

/**
 * Checklist de onboarding da igreja — guia visual do que falta para ir ao ar.
 * Presentacional (sem estado): recebe os passos e o progresso já calculados.
 */
export function ChecklistOnboarding({
  passos,
  progresso,
}: {
  passos: PassoOnboarding[];
  progresso: { feitos: number; total: number; pct: number; noAr: boolean };
}) {
  return (
    <section className="secao-painel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <h2 className="secao-painel__titulo" style={{ margin: 0 }}>Onboarding</h2>
        <span className={`etiqueta etiqueta--${progresso.noAr ? "novo" : "concluido"}`}>
          {progresso.noAr ? "Pronta para o ar" : `${progresso.feitos}/${progresso.total} essenciais`}
        </span>
      </div>

      <div className="onb-barra" aria-hidden="true"><span style={{ width: `${progresso.pct}%` }} /></div>

      <ul className="onb-lista">
        {passos.map((p) => (
          <li key={p.chave} className={`onb-item${p.feito ? " onb-item--ok" : ""}`}>
            <span className="onb-check" aria-hidden="true">{p.feito ? "✓" : "○"}</span>
            <span>
              <strong>{p.titulo}{p.opcional && !p.feito ? " (opcional)" : ""}</strong>
              <small>{p.dica}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
