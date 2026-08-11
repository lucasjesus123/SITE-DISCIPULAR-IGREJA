"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarRegistroSecretaria } from "@/app/painel/secretaria/acoes";
import type { CampoDef } from "@/lib/secretaria/tipos";

/**
 * Formulário de cadastro da Secretaria — montado a partir da definição do tipo
 * (mesma fonte da lista e do relatório). Salva e limpa para o próximo cadastro,
 * porque na recepção se cadastra várias pessoas em sequência.
 */
export function FormularioSecretaria({
  slug,
  singular,
  campos,
}: {
  slug: string;
  singular: string;
  campos: CampoDef[];
}) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const valores: Record<string, string> = {};
    for (const campo of campos) valores[campo.chave] = String(fd.get(campo.chave) ?? "");

    iniciar(async () => {
      const r = await criarRegistroSecretaria(slug, valores);
      setMsg({ ok: r.ok, texto: r.mensagem });
      if (r.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={salvar} className="stack" style={{ "--flow": "1rem" } as React.CSSProperties}>
      {msg && (
        <div className={`alerta alerta--${msg.ok ? "sucesso" : "erro"}`} role="alert">
          {msg.texto}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
        {campos.map((campo) => (
          <label key={campo.chave} className="campo" style={campo.tipo === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
            <span className="campo__rotulo">
              {campo.rotulo}
              {campo.obrigatorio && <span style={{ color: "var(--pnl-perigo, #c0392b)" }}> *</span>}
            </span>
            <CampoEntrada campo={campo} />
            {campo.ajuda && <span className="campo__ajuda">{campo.ajuda}</span>}
          </label>
        ))}
      </div>

      <button type="submit" className="btn" disabled={pendente} style={{ justifySelf: "start" }}>
        {pendente ? "Salvando…" : `Cadastrar ${singular.toLowerCase()}`}
      </button>
    </form>
  );
}

function CampoEntrada({ campo }: { campo: CampoDef }) {
  const base = { name: campo.chave, required: campo.obrigatorio, "aria-label": campo.rotulo };
  if (campo.tipo === "textarea") {
    return <textarea {...base} rows={3} maxLength={2000} />;
  }
  if (campo.tipo === "data") {
    return <input {...base} type="date" />;
  }
  if (campo.tipo === "numero") {
    return <input {...base} type="number" min={0} max={99} inputMode="numeric" />;
  }
  if (campo.tipo === "tel") {
    return <input {...base} type="tel" inputMode="tel" maxLength={20} placeholder="(00) 90000-0000" autoComplete="off" />;
  }
  if (campo.tipo === "sim_nao") {
    return (
      <select {...base} defaultValue="">
        <option value="">—</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </select>
    );
  }
  return <input {...base} type="text" maxLength={200} autoComplete="off" />;
}
