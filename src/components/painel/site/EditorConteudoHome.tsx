"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarConteudoHome } from "@/app/painel/site/acoes";
import type { Depoimento, Ministerio } from "@/lib/site/conteudo-home";

const N = 3; // a home mostra 3 de cada

export function EditorConteudoHome({
  ministerios,
  depoimentos,
}: {
  ministerios: Ministerio[];
  depoimentos: Depoimento[];
}) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();

  const mins = padArray(ministerios, N, { titulo: "", descricao: "", icone: "" });
  const deps = padArray(depoimentos, N, { texto: "", nome: "", papel: "" });

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "");
    const payload = {
      ministerios: Array.from({ length: N }, (_, i) => ({ titulo: g(`m${i}_titulo`), descricao: g(`m${i}_descricao`), icone: g(`m${i}_icone`) })),
      depoimentos: Array.from({ length: N }, (_, i) => ({ texto: g(`d${i}_texto`), nome: g(`d${i}_nome`), papel: g(`d${i}_papel`) })),
    };
    iniciar(async () => {
      const r = await salvarConteudoHome(payload);
      setMsg({ ok: r.ok, texto: r.mensagem });
      if (r.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={salvar} className="stack" style={{ "--flow": "1.2rem" } as React.CSSProperties}>
      {msg && <div className={`alerta alerta--${msg.ok ? "sucesso" : "erro"}`} role="alert">{msg.texto}</div>}

      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Ministérios (3 cards da home)</p>
        <div className="stack" style={{ "--flow": ".8rem" } as React.CSSProperties}>
          {mins.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".8rem" }}>
              <input name={`m${i}_icone`} defaultValue={m.icone ?? ""} maxLength={4} placeholder="Ícone" style={{ width: 64 }} aria-label={`Ícone ${i + 1}`} />
              <input name={`m${i}_titulo`} defaultValue={m.titulo} maxLength={80} placeholder="Título (ex.: Louvor)" style={{ flex: 1, minWidth: 140 }} aria-label={`Título ministério ${i + 1}`} />
              <input name={`m${i}_descricao`} defaultValue={m.descricao} maxLength={400} placeholder="Descrição" style={{ flex: 2, minWidth: 200 }} aria-label={`Descrição ministério ${i + 1}`} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Depoimentos (3 na home)</p>
        <div className="stack" style={{ "--flow": ".8rem" } as React.CSSProperties}>
          {deps.map((d, i) => (
            <div key={i} style={{ border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".8rem", display: "grid", gap: ".5rem" }}>
              <textarea name={`d${i}_texto`} defaultValue={d.texto} rows={2} maxLength={500} placeholder="Depoimento" aria-label={`Depoimento ${i + 1}`} />
              <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <input name={`d${i}_nome`} defaultValue={d.nome} maxLength={80} placeholder="Nome" style={{ flex: 1, minWidth: 140 }} aria-label={`Nome ${i + 1}`} />
                <input name={`d${i}_papel`} defaultValue={d.papel} maxLength={80} placeholder="Ex.: Membro há 3 anos" style={{ flex: 1, minWidth: 140 }} aria-label={`Papel ${i + 1}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="lvr-nota">Deixe um card em branco para escondê-lo. Vazio de tudo volta ao texto padrão.</p>
      <button type="submit" className="btn" disabled={pendente} style={{ justifySelf: "start" }}>
        {pendente ? "Salvando…" : "Salvar conteúdo da home"}
      </button>
    </form>
  );
}

function padArray<T>(arr: T[], n: number, vazio: T): T[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push({ ...vazio });
  return out;
}
