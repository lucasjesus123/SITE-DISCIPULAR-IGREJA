"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarConteudoHome } from "@/app/painel/site/acoes";
import type { Depoimento, Ministerio, BoasVindas } from "@/lib/site/conteudo-home";

const N = 3; // a home mostra 3 de cada
// Rótulo do ícone fixo de cada um dos 4 cards de "Novo por aqui" (o desenho é
// fixo por posição; a igreja edita só os textos).
const ICONES_BV = ["♥ Acolhimento", "⏱ Duração", "🙌 Presença", "☺ Kids"];

export function EditorConteudoHome({
  ministerios,
  depoimentos,
  boasVindas,
}: {
  ministerios: Ministerio[];
  depoimentos: Depoimento[];
  boasVindas: BoasVindas;
}) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();

  const mins = padArray(ministerios, N, { titulo: "", descricao: "", icone: "" });
  const deps = padArray(depoimentos, N, { texto: "", nome: "", papel: "" });
  const bvCards = padArray(boasVindas.cards, 4, { titulo: "", texto: "" });

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "");
    const payload = {
      boasVindas: {
        titulo: g("bv_titulo"),
        lead: g("bv_lead"),
        versiculo: g("bv_versiculo"),
        frase: g("bv_frase"),
        cards: Array.from({ length: 4 }, (_, i) => ({ titulo: g(`bv_c${i}_titulo`), texto: g(`bv_c${i}_texto`) })),
      },
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

      {/* NOVO POR AQUI (bloco de boas-vindas) */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Novo por aqui — boas-vindas</p>
        <div className="stack" style={{ "--flow": ".7rem" } as React.CSSProperties}>
          <label className="campo">
            <span className="campo__rotulo">Versículo do topo (hero)</span>
            <input name="bv_versiculo" defaultValue={boasVindas.versiculo} maxLength={240} placeholder="“Alegrei-me quando me disseram…” — Salmos 122:1" />
          </label>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label className="campo" style={{ flex: 1, minWidth: 180 }}>
              <span className="campo__rotulo">Título</span>
              <input name="bv_titulo" defaultValue={boasVindas.titulo} maxLength={80} placeholder="Seja muito bem-vindo." />
            </label>
            <label className="campo" style={{ flex: 1, minWidth: 180 }}>
              <span className="campo__rotulo">Frase do card escuro</span>
              <input name="bv_frase" defaultValue={boasVindas.frase} maxLength={160} placeholder="Você foi feito para fazer parte." />
            </label>
          </div>
          <label className="campo">
            <span className="campo__rotulo">Chamada</span>
            <textarea name="bv_lead" defaultValue={boasVindas.lead} rows={2} maxLength={300} placeholder="A gente preparou tudo pra você se sentir em casa…" />
          </label>
          <p className="campo__rotulo">Os 4 cards de “o que esperar” (o ícone é fixo; edite só os textos)</p>
          {bvCards.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center", border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".8rem" }}>
              <span style={{ minWidth: 96, fontSize: ".82rem", fontWeight: 600, opacity: .75 }}>{ICONES_BV[i]}</span>
              <input name={`bv_c${i}_titulo`} defaultValue={c.titulo} maxLength={60} placeholder="Título" style={{ flex: 1, minWidth: 120 }} aria-label={`Título card ${i + 1}`} />
              <input name={`bv_c${i}_texto`} defaultValue={c.texto} maxLength={240} placeholder="Texto do card" style={{ flex: 2, minWidth: 180 }} aria-label={`Texto card ${i + 1}`} />
            </div>
          ))}
        </div>
      </div>

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

      <p className="lvr-nota">Deixe um campo em branco para voltar ao texto padrão daquele item.</p>
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
