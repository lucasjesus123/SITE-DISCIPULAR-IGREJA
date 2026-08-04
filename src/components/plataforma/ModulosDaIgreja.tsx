"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TenantPlan } from "@prisma/client";
import { definirModulos } from "@/app/plataforma/acoes";
import { MODULOS, modulosDoPlano, type ConfigModulos } from "@/lib/modulos/modulos";

/**
 * Painel de "gavetas": o Super Admin liga/desliga cada módulo da igreja.
 * O módulo `gestao` é a base (sempre ligado) e não aparece como toggle.
 */
export function ModulosDaIgreja({ tenantId, modulos, plano }: { tenantId: string; modulos: ConfigModulos; plano: TenantPlan }) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await definirModulos(tenantId, fd);
      setMsg({ ok: r.ok, texto: r.mensagem });
      if (r.ok) router.refresh();
    });
  }

  // Marca os checkboxes conforme o preset do plano (sem salvar — o admin revisa).
  function aplicarPreset() {
    const preset = modulosDoPlano(plano);
    const form = formRef.current;
    if (!form) return;
    for (const m of MODULOS) {
      if (m.essencial) continue;
      const input = form.elements.namedItem(m.chave);
      if (input instanceof HTMLInputElement) input.checked = preset[m.chave];
    }
  }

  return (
    <form ref={formRef} onSubmit={salvar} className="stack" style={{ "--flow": "0.8rem" } as React.CSSProperties}>
      {msg && <div className={`alerta alerta--${msg.ok ? "sucesso" : "erro"}`} role="alert">{msg.texto}</div>}

      <div className="mods-grid">
        {MODULOS.filter((m) => !m.essencial).map((m) => (
          <label key={m.chave} className="mods-item">
            <input type="checkbox" name={m.chave} defaultChecked={modulos[m.chave]} />
            <span>
              <strong>{m.nome}</strong>
              <small>{m.descricao}</small>
            </span>
          </label>
        ))}
      </div>

      <p className="mods-nota">
        <strong>Gestão</strong> é a base do painel e fica sempre ligada. Ao ligar um módulo, ele
        aparece para a igreja e se conecta ao resto automaticamente.
      </p>

      <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
        <button type="submit" className="btn" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar módulos"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={aplicarPreset}>
          Aplicar preset do plano ({plano})
        </button>
      </div>
    </form>
  );
}
