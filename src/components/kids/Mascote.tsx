/**
 * Kit visual lúdico do KIDS — mascote e medalhas originais em SVG (sem imagem
 * externa, sem dependência). O mascote é a "Estrelinha", que acompanha a
 * criança no Passaporte Kids. Cores alegres, cantos arredondados.
 */

export function Mascote({ tamanho = 96 }: { tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 120 120" role="img" aria-label="Estrelinha, mascote do Kids">
      <defs>
        <radialGradient id="mascote-brilho" cx="50%" cy="40%" r="65%">
          <stop offset="0" stopColor="#ffe27a" />
          <stop offset="1" stopColor="#ffb020" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="62" r="52" fill="#fff4d6" />
      {/* corpo estrela */}
      <path
        d="M60 20 L71 46 L99 48 L77 66 L84 94 L60 78 L36 94 L43 66 L21 48 L49 46 Z"
        fill="url(#mascote-brilho)"
        stroke="#f59e0b"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* rostinho */}
      <circle cx="52" cy="58" r="4.5" fill="#3a2a12" />
      <circle cx="68" cy="58" r="4.5" fill="#3a2a12" />
      <circle cx="53.5" cy="56.5" r="1.4" fill="#fff" />
      <circle cx="69.5" cy="56.5" r="1.4" fill="#fff" />
      <path d="M52 68 Q60 76 68 68" fill="none" stroke="#3a2a12" strokeWidth="3" strokeLinecap="round" />
      <circle cx="45" cy="65" r="4" fill="#ff8fab" opacity="0.7" />
      <circle cx="75" cy="65" r="4" fill="#ff8fab" opacity="0.7" />
    </svg>
  );
}

const CORES_MEDALHA: Record<string, string> = {
  ouro: "#f5c518",
  prata: "#c7ccd4",
  bronze: "#cd7f32",
  coracao: "#ff6b8a",
  estrela: "#5b8cff",
};

/** Medalha/carimbo de conquista para o Passaporte Kids. */
export function Medalha({ icone = "estrela", nome, tamanho = 64 }: { icone?: string; nome?: string; tamanho?: number }) {
  const cor = CORES_MEDALHA[icone] ?? CORES_MEDALHA.estrela;
  return (
    <div style={{ textAlign: "center", width: tamanho + 16 }}>
      <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" role="img" aria-label={nome ?? "Medalha"}>
        <circle cx="32" cy="30" r="22" fill={cor} stroke="#fff" strokeWidth="3" />
        <circle cx="32" cy="30" r="22" fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
        <path d="M32 16 l4 8 9 1 -6.5 6 1.5 9 -8 -4.3 -8 4.3 1.5 -9 -6.5 -6 9 -1 Z" fill="#fff" opacity="0.92" />
        <path d="M24 50 l-4 10 12 -5 12 5 -4 -10" fill={cor} opacity="0.85" />
      </svg>
      {nome && <p style={{ fontSize: ".72rem", fontWeight: 700, marginTop: ".2rem", color: "var(--pnl-text, #333)" }}>{nome}</p>}
    </div>
  );
}
