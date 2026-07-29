"use client";

import { useEffect, useRef, useState } from "react";
import { CELULAS, CIDADES, linkRota, type Celula } from "@/lib/celulas/dados";
import "leaflet/dist/leaflet.css";

/**
 * Mapa interativo das células (Casas de Discípulos).
 *
 * Leaflet + OpenStreetMap (grátis, sem chave de API). Cada célula é um pino com
 * o símbolo da Discipular; clicar abre um popup com anfitrião, dia/horário,
 * endereço e um botão "Ver rota" (Google Maps, com o endereço exato). Os chips
 * filtram por cidade e dão zoom no grupo. Sem chips no modo `compacto` (home).
 *
 * O conteúdo é estático (src/lib/celulas/dados.ts) — não há entrada de usuário,
 * então o HTML dos popups é seguro; ainda assim escapamos por higiene.
 */
export function MapaCelulas({ compacto = false }: { compacto?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Referências do Leaflet (tipadas como unknown p/ não acoplar ao tipo do pacote).
  const mapRef = useRef<any>(null);
  const gruposRef = useRef<Record<string, any[]>>({});
  const LRef = useRef<any>(null);
  const [cidade, setCidade] = useState<string>("Todas");
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const mod = await import("leaflet");
      const L: any = (mod as any).default ?? mod;
      if (cancelado || !containerRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(containerRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
      }).setView([-29.55, -52.1], 9);
      mapRef.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      // Estilos INLINE de propósito: o Leaflet injeta o marcador em runtime e as
      // regras CSS externas para `img` dentro do pino não estavam pegando (o
      // logo saía em tamanho natural, 807px). Inline sempre vence e é à prova de
      // cascata/HMR.
      const icone = L.divIcon({
        className: "pin-celula",
        html:
          '<span style="display:grid;place-items:center;width:34px;height:34px;background:#fff;' +
          "border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 5px 12px rgba(0,0,0,.35);" +
          'border:1px solid rgba(0,0,0,.18)">' +
          '<img src="/marca/mark-dark.png" alt="" ' +
          'style="width:18px;height:18px;max-width:none;transform:rotate(45deg);display:block" />' +
          "</span>",
        iconSize: [34, 42],
        iconAnchor: [17, 40],
        popupAnchor: [0, -38],
      });

      const grupos: Record<string, any[]> = {};
      const todos: any[] = [];
      for (const c of CELULAS) {
        const m = L.marker([c.lat, c.lng], { icon: icone, title: `${c.cidade} — ${c.lideres}` }).addTo(map);
        m.bindPopup(popupHtml(c), { className: "popup-celula", maxWidth: 260 });
        (grupos[c.cidade] ??= []).push(m);
        todos.push(m);
      }
      gruposRef.current = grupos;

      if (todos.length) {
        const fg = L.featureGroup(todos);
        map.fitBounds(fg.getBounds().pad(0.18));
      }
      // O container às vezes monta antes de ter tamanho final; recalcula.
      setTimeout(() => map.invalidateSize(), 200);
      setPronto(true);
    })();

    return () => {
      cancelado = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Filtro por cidade: dá zoom no grupo selecionado.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !pronto) return;
    const alvo =
      cidade === "Todas" ? Object.values(gruposRef.current).flat() : gruposRef.current[cidade] ?? [];
    if (!alvo.length) return;
    const fg = L.featureGroup(alvo);
    map.fitBounds(fg.getBounds().pad(cidade === "Todas" ? 0.18 : 0.5), { animate: true });
  }, [cidade, pronto]);

  return (
    <div className={`mapa-celulas${compacto ? " mapa-celulas--compacto" : ""}`}>
      {compacto ? (
        // Home: seletor compacto (dropdown) para trocar de cidade.
        <div className="mapa-celulas__seletor">
          <label htmlFor="mapa-cidade-home" className="mapa-celulas__sel-lb">
            Cidade
          </label>
          <select
            id="mapa-cidade-home"
            className="mapa-celulas__sel"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          >
            <option value="Todas">Todas as cidades</option>
            {CIDADES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="mapa-celulas__filtros" role="group" aria-label="Filtrar por cidade">
          <button
            type="button"
            className={`chip-cidade${cidade === "Todas" ? " is-on" : ""}`}
            onClick={() => setCidade("Todas")}
          >
            Todas as cidades
          </button>
          {CIDADES.map((c) => (
            <button
              type="button"
              key={c}
              className={`chip-cidade${cidade === c ? " is-on" : ""}`}
              onClick={() => setCidade(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div
        ref={containerRef}
        className="mapa-celulas__mapa"
        role="application"
        aria-label="Mapa das células da Discipular"
      />
      <p className="mapa-celulas__nota">
        {CELULAS.length} células em {CIDADES.length} cidades · toque num pino para ver o anfitrião,
        o horário e a rota.
      </p>
    </div>
  );
}

function popupHtml(c: Celula): string {
  const tipo = c.tipo ? `<span class="pc__tag">${esc(c.tipo)}</span>` : "";
  const bairro = c.bairro ? ` — ${esc(c.bairro)}` : "";
  return (
    `<div class="pc">` +
    `<p class="pc__cidade">${esc(c.cidade)}</p>` +
    tipo +
    `<p class="pc__lideres">${esc(c.lideres)}</p>` +
    `<p class="pc__quando">${esc(c.dia)} · ${esc(c.horario)}</p>` +
    `<p class="pc__end">${esc(c.endereco)}${bairro}</p>` +
    `<a class="pc__rota" href="${linkRota(c)}" target="_blank" rel="noopener noreferrer">Ver rota &rarr;</a>` +
    `</div>`
  );
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[m] as string,
  );
}
