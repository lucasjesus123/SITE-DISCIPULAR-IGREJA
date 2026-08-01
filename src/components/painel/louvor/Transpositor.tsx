"use client";

import { useMemo, useState } from "react";
import { transporCifra, transporAcorde } from "@/lib/louvor/tom";

/**
 * Transpositor de cifra ao vivo. O músico baixa/sobe o tom e a cifra
 * acompanha na hora — a mesma conta testada em src/lib/louvor/tom.ts.
 */
export function Transpositor({ cifra, tomPadrao }: { cifra: string; tomPadrao?: string | null }) {
  const [semitons, setSemitons] = useState(0);

  const tomAtual = useMemo(() => {
    if (!tomPadrao) return null;
    return transporAcorde(tomPadrao, semitons);
  }, [tomPadrao, semitons]);

  const cifraTransposta = useMemo(() => transporCifra(cifra, semitons), [cifra, semitons]);

  return (
    <div className="lvr-transpositor">
      <div className="lvr-transpositor__ctrl">
        <button type="button" className="btn btn--fantasma" onClick={() => setSemitons((s) => s - 1)} aria-label="Descer meio tom">−</button>
        <span className="lvr-transpositor__tom">
          {tomAtual ? <>Tom: <strong>{tomAtual}</strong></> : <>{semitons > 0 ? `+${semitons}` : semitons} semitons</>}
        </span>
        <button type="button" className="btn btn--fantasma" onClick={() => setSemitons((s) => s + 1)} aria-label="Subir meio tom">+</button>
        {semitons !== 0 && (
          <button type="button" className="lvr-link" onClick={() => setSemitons(0)}>voltar ao original</button>
        )}
      </div>
      <pre className="lvr-cifra">{cifraTransposta}</pre>
    </div>
  );
}
