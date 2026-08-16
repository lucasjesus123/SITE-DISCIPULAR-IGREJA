"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarConteudoHome } from "@/app/painel/site/acoes";
import type { Depoimento, Ministerio, BoasVindas, SecoesHome } from "@/lib/site/conteudo-home";

const N = 3; // a home mostra 3 de cada
// Rótulo do ícone fixo de cada um dos 4 cards de "Novo por aqui" (o desenho é
// fixo por posição; a igreja edita só os textos).
const ICONES_BV = ["♥ Acolhimento", "⏱ Duração", "🙌 Presença", "☺ Kids"];
// Número + ícone fixos dos 5 "Próximos passos".
const ROTULO_PASSO = ["01 ✝", "02 💧", "03 ◎", "04 📖", "05 🙌"];

export function EditorConteudoHome({
  ministerios,
  depoimentos,
  boasVindas,
  secoes,
}: {
  ministerios: Ministerio[];
  depoimentos: Depoimento[];
  boasVindas: BoasVindas;
  secoes: SecoesHome;
}) {
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const router = useRouter();

  const mins = padArray(ministerios, N, { titulo: "", descricao: "", icone: "" });
  const deps = padArray(depoimentos, N, { texto: "", nome: "", papel: "" });
  const bvCards = padArray(boasVindas.cards, 4, { titulo: "", texto: "" });
  const appRecursos = padArray(secoes.appRecursos.map((r) => ({ v: r })), 6, { v: "" });
  const passos = padArray(secoes.passos, 5, { titulo: "", texto: "" });
  const menuRows = padArray(secoes.menu.map((m) => ({ label: m.label, href: m.href })), 8, { label: "", href: "" });
  const rodapeCols = padArray(
    secoes.rodape.map((c) => ({ titulo: c.titulo, links: padArray(c.links.map((l) => ({ label: l.label, href: l.href })), 4, { label: "", href: "" }) })),
    2,
    { titulo: "", links: padArray([] as { label: string; href: string }[], 4, { label: "", href: "" }) },
  );

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
      secoes: {
        appTitulo: g("sec_appTitulo"),
        appLead: g("sec_appLead"),
        appRecursos: Array.from({ length: 6 }, (_, i) => g(`sec_app_r${i}`)),
        passosTitulo: g("sec_passosTitulo"),
        passosLead: g("sec_passosLead"),
        passos: Array.from({ length: 5 }, (_, i) => ({ titulo: g(`sec_p${i}_titulo`), texto: g(`sec_p${i}_texto`) })),
        celulasTitulo: g("sec_celulasTitulo"),
        celulasTexto: g("sec_celulasTexto"),
        oracaoTitulo: g("sec_oracaoTitulo"),
        oracaoLead: g("sec_oracaoLead"),
        newsletterTitulo: g("sec_newsletterTitulo"),
        newsletterTexto: g("sec_newsletterTexto"),
        minisTitulo: g("sec_minisTitulo"),
        minisLead: g("sec_minisLead"),
        depoimentosTitulo: g("sec_depoimentosTitulo"),
        contribuaTitulo: g("sec_contribuaTitulo"),
        contribuaTexto: g("sec_contribuaTexto"),
        contatoTitulo: g("sec_contatoTitulo"),
        contatoLead: g("sec_contatoLead"),
        agendaTitulo: g("sec_agendaTitulo"),
        formBatismoTitulo: g("sec_formBatismoTitulo"), formBatismoDestaque: g("sec_formBatismoDestaque"), formBatismoLead: g("sec_formBatismoLead"),
        formVisitaTitulo: g("sec_formVisitaTitulo"), formVisitaDestaque: g("sec_formVisitaDestaque"), formVisitaLead: g("sec_formVisitaLead"),
        formOracaoTitulo: g("sec_formOracaoTitulo"), formOracaoDestaque: g("sec_formOracaoDestaque"), formOracaoLead: g("sec_formOracaoLead"),
        heroBtn1Texto: g("sec_heroBtn1Texto"), heroBtn1Link: g("sec_heroBtn1Link"),
        heroBtn2Texto: g("sec_heroBtn2Texto"), heroBtn2Link: g("sec_heroBtn2Link"),
        mensagemLead: g("sec_mensagemLead"),
        mensagemBtnTexto: g("sec_mensagemBtnTexto"), mensagemBtnLink: g("sec_mensagemBtnLink"),
        appBtnTexto: g("sec_appBtnTexto"), appBtnLink: g("sec_appBtnLink"),
        minisBtnTexto: g("sec_minisBtnTexto"), minisBtnLink: g("sec_minisBtnLink"),
        celulasBtnTexto: g("sec_celulasBtnTexto"), celulasBtnLink: g("sec_celulasBtnLink"),
        oracaoBtnTexto: g("sec_oracaoBtnTexto"), oracaoBtnLink: g("sec_oracaoBtnLink"),
        contribuaBtnTexto: g("sec_contribuaBtnTexto"), contribuaBtnLink: g("sec_contribuaBtnLink"),
        menu: Array.from({ length: 8 }, (_, i) => ({ label: g(`sec_menu${i}_label`), href: g(`sec_menu${i}_href`) })),
        rodape: Array.from({ length: 2 }, (_, i) => ({
          titulo: g(`sec_rod${i}_titulo`),
          links: Array.from({ length: 4 }, (_, j) => ({ label: g(`sec_rod${i}_l${j}_label`), href: g(`sec_rod${i}_l${j}_href`) })),
        })),
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

      {/* ACESSE O APP */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Acesse o app</p>
        <div className="stack" style={{ "--flow": ".7rem" } as React.CSSProperties}>
          <label className="campo">
            <span className="campo__rotulo">Título (em branco = “Acesse o app da {"{sua igreja}"}”)</span>
            <input name="sec_appTitulo" defaultValue={secoes.appTitulo} maxLength={80} placeholder="Acesse o app da sua igreja" />
          </label>
          <label className="campo">
            <span className="campo__rotulo">Chamada</span>
            <textarea name="sec_appLead" defaultValue={secoes.appLead} rows={2} maxLength={400} />
          </label>
          <p className="campo__rotulo">Os 6 recursos (✓)</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
            {appRecursos.map((r, i) => (
              <input key={i} name={`sec_app_r${i}`} defaultValue={r.v} maxLength={80} placeholder={`Recurso ${i + 1}`} aria-label={`Recurso ${i + 1}`} />
            ))}
          </div>
        </div>
      </div>

      {/* PRÓXIMOS PASSOS */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Próximos passos</p>
        <div className="stack" style={{ "--flow": ".7rem" } as React.CSSProperties}>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label className="campo" style={{ flex: 1, minWidth: 160 }}>
              <span className="campo__rotulo">Título da seção</span>
              <input name="sec_passosTitulo" defaultValue={secoes.passosTitulo} maxLength={80} />
            </label>
            <label className="campo" style={{ flex: 2, minWidth: 200 }}>
              <span className="campo__rotulo">Chamada</span>
              <input name="sec_passosLead" defaultValue={secoes.passosLead} maxLength={300} />
            </label>
          </div>
          {passos.map((p, i) => (
            <div key={i} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center", border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".8rem" }}>
              <span style={{ minWidth: 60, fontSize: ".82rem", fontWeight: 700, opacity: .7 }}>{ROTULO_PASSO[i]}</span>
              <input name={`sec_p${i}_titulo`} defaultValue={p.titulo} maxLength={60} placeholder="Título" style={{ flex: 1, minWidth: 120 }} aria-label={`Passo ${i + 1} título`} />
              <input name={`sec_p${i}_texto`} defaultValue={p.texto} maxLength={200} placeholder="Descrição" style={{ flex: 2, minWidth: 180 }} aria-label={`Passo ${i + 1} texto`} />
            </div>
          ))}
        </div>
      </div>

      {/* FAIXAS: Células, Oração, Newsletter */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Faixas (Células, Oração, Novidades)</p>
        <div className="stack" style={{ "--flow": ".7rem" } as React.CSSProperties}>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label className="campo" style={{ flex: 1, minWidth: 160 }}>
              <span className="campo__rotulo">Células — título</span>
              <input name="sec_celulasTitulo" defaultValue={secoes.celulasTitulo} maxLength={80} />
            </label>
            <label className="campo" style={{ flex: 2, minWidth: 220 }}>
              <span className="campo__rotulo">Células — texto</span>
              <input name="sec_celulasTexto" defaultValue={secoes.celulasTexto} maxLength={400} />
            </label>
          </div>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label className="campo" style={{ flex: 1, minWidth: 160 }}>
              <span className="campo__rotulo">Oração — título</span>
              <input name="sec_oracaoTitulo" defaultValue={secoes.oracaoTitulo} maxLength={80} />
            </label>
            <label className="campo" style={{ flex: 2, minWidth: 220 }}>
              <span className="campo__rotulo">Oração — texto</span>
              <input name="sec_oracaoLead" defaultValue={secoes.oracaoLead} maxLength={400} />
            </label>
          </div>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <label className="campo" style={{ flex: 1, minWidth: 160 }}>
              <span className="campo__rotulo">Novidades — título</span>
              <input name="sec_newsletterTitulo" defaultValue={secoes.newsletterTitulo} maxLength={80} />
            </label>
            <label className="campo" style={{ flex: 2, minWidth: 220 }}>
              <span className="campo__rotulo">Novidades — texto</span>
              <input name="sec_newsletterTexto" defaultValue={secoes.newsletterTexto} maxLength={300} />
            </label>
          </div>
        </div>
      </div>

      {/* PÁGINAS DE FORMULÁRIO: Batismo, Visita, Oração */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".4rem" }}>Textos das páginas de formulário</p>
        <p className="lvr-nota" style={{ marginBottom: ".6rem" }}>Abertura das páginas Batismo, Visita e Oração. O título é dividido em duas partes: o texto normal e a “palavra em destaque” (que aparece dourada). Em branco = texto padrão.</p>
        <div className="stack" style={{ "--flow": ".7rem" } as React.CSSProperties}>
          {([
            ["Batismo", "formBatismoTitulo", "formBatismoDestaque", "formBatismoLead", secoes.formBatismoTitulo, secoes.formBatismoDestaque, secoes.formBatismoLead, "Um passo de", "obediência"],
            ["Visita", "formVisitaTitulo", "formVisitaDestaque", "formVisitaLead", secoes.formVisitaTitulo, secoes.formVisitaDestaque, secoes.formVisitaLead, "Venha como", "está"],
            ["Oração", "formOracaoTitulo", "formOracaoDestaque", "formOracaoLead", secoes.formOracaoTitulo, secoes.formOracaoDestaque, secoes.formOracaoLead, "Podemos orar", "por você"],
          ] as const).map(([rot, nt, nd, nl, vt, vd, vl, pt, pd]) => (
            <div key={nt} style={{ border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".8rem", display: "grid", gap: ".5rem" }}>
              <span style={{ fontSize: ".82rem", fontWeight: 700, opacity: .75 }}>{rot}</span>
              <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
                <input name={`sec_${nt}`} defaultValue={vt} maxLength={80} placeholder={`Título (ex.: ${pt})`} style={{ flex: 2, minWidth: 160 }} aria-label={`${rot} — título`} />
                <input name={`sec_${nd}`} defaultValue={vd} maxLength={40} placeholder={`Destaque (ex.: ${pd})`} style={{ flex: 1, minWidth: 120 }} aria-label={`${rot} — palavra em destaque`} />
              </div>
              <textarea name={`sec_${nl}`} defaultValue={vl} rows={2} maxLength={400} placeholder="Parágrafo de abertura" aria-label={`${rot} — parágrafo`} />
            </div>
          ))}
        </div>
      </div>

      {/* MENU DO SITE */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".4rem" }}>Menu do topo</p>
        <p className="lvr-nota" style={{ marginBottom: ".6rem" }}>Rótulo + destino de cada item. Use #novo/#minis… para rolar até uma seção, ou /pagina para abrir uma página. Deixe em branco para esconder. Tudo vazio = menu padrão.</p>
        <div className="stack" style={{ "--flow": ".5rem" } as React.CSSProperties}>
          {menuRows.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
              <input name={`sec_menu${i}_label`} defaultValue={m.label} maxLength={40} placeholder={`Item ${i + 1} — rótulo`} style={{ flex: 1, minWidth: 130 }} aria-label={`Menu item ${i + 1} rótulo`} />
              <input name={`sec_menu${i}_href`} defaultValue={m.href} maxLength={200} placeholder="Destino (#novo ou /pagina)" style={{ flex: 1, minWidth: 150 }} aria-label={`Menu item ${i + 1} destino`} />
            </div>
          ))}
        </div>
      </div>

      {/* RODAPÉ */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".4rem" }}>Rodapé — colunas de links</p>
        <p className="lvr-nota" style={{ marginBottom: ".6rem" }}>Duas colunas do rodapé (a coluna “Redes” é automática das suas redes sociais). Título + até 4 links cada. Use #novo/#minis… para uma seção da home, ou /pagina. Em branco = padrão.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".8rem" }}>
          {rodapeCols.map((col, i) => (
            <div key={i} style={{ border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".8rem", display: "grid", gap: ".5rem" }}>
              <input name={`sec_rod${i}_titulo`} defaultValue={col.titulo} maxLength={40} placeholder={`Título da coluna ${i + 1}`} aria-label={`Rodapé coluna ${i + 1} título`} style={{ fontWeight: 600 }} />
              {col.links.map((l, j) => (
                <div key={j} style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                  <input name={`sec_rod${i}_l${j}_label`} defaultValue={l.label} maxLength={40} placeholder={`Link ${j + 1}`} style={{ flex: 1, minWidth: 100 }} aria-label={`Coluna ${i + 1} link ${j + 1} rótulo`} />
                  <input name={`sec_rod${i}_l${j}_href`} defaultValue={l.href} maxLength={200} placeholder="Destino" style={{ flex: 1, minWidth: 100 }} aria-label={`Coluna ${i + 1} link ${j + 1} destino`} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* BOTÕES E LINKS DA HOME */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".4rem" }}>Botões e links da home</p>
        <p className="lvr-nota" style={{ marginBottom: ".6rem" }}>Rótulo = o que aparece no botão. Link = para onde vai (ex.: /contribua ou um site). Em branco = padrão.</p>
        <div className="stack" style={{ "--flow": ".6rem" } as React.CSSProperties}>
          {([
            ["Hero — botão 1 (ao vivo)", "heroBtn1Texto", "heroBtn1Link", secoes.heroBtn1Texto, secoes.heroBtn1Link],
            ["Hero — botão 2 (app)", "heroBtn2Texto", "heroBtn2Link", secoes.heroBtn2Texto, secoes.heroBtn2Link],
            ["Mensagens — botão", "mensagemBtnTexto", "mensagemBtnLink", secoes.mensagemBtnTexto, secoes.mensagemBtnLink],
            ["App — botão", "appBtnTexto", "appBtnLink", secoes.appBtnTexto, secoes.appBtnLink],
            ["Ministérios — link do card", "minisBtnTexto", "minisBtnLink", secoes.minisBtnTexto, secoes.minisBtnLink],
            ["Células — botão", "celulasBtnTexto", "celulasBtnLink", secoes.celulasBtnTexto, secoes.celulasBtnLink],
            ["Oração — botão", "oracaoBtnTexto", "oracaoBtnLink", secoes.oracaoBtnTexto, secoes.oracaoBtnLink],
            ["Contribua — botão", "contribuaBtnTexto", "contribuaBtnLink", secoes.contribuaBtnTexto, secoes.contribuaBtnLink],
          ] as const).map(([rot, nt, nl, vt, vl]) => (
            <div key={nt} style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center", border: "1.5px solid var(--pnl-line)", borderRadius: 12, padding: ".7rem" }}>
              <span style={{ minWidth: 150, fontSize: ".82rem", fontWeight: 600, opacity: .75 }}>{rot}</span>
              <input name={`sec_${nt}`} defaultValue={vt} maxLength={60} placeholder="Rótulo" style={{ flex: 1, minWidth: 120 }} aria-label={`${rot} rótulo`} />
              <input name={`sec_${nl}`} defaultValue={vl} maxLength={300} placeholder="Link" style={{ flex: 1, minWidth: 140 }} aria-label={`${rot} link`} />
            </div>
          ))}
          <label className="campo"><span className="campo__rotulo">Mensagens — chamada (texto)</span><textarea name="sec_mensagemLead" defaultValue={secoes.mensagemLead} rows={2} maxLength={400} /></label>
        </div>
      </div>

      {/* TÍTULOS DAS DEMAIS SEÇÕES */}
      <div>
        <p className="campo__rotulo" style={{ marginBottom: ".6rem" }}>Títulos das seções</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".6rem" }}>
          <input name="sec_minisTitulo" defaultValue={secoes.minisTitulo} maxLength={80} placeholder="Ministérios — título" aria-label="Ministérios — título" />
          <input name="sec_minisLead" defaultValue={secoes.minisLead} maxLength={300} placeholder="Ministérios — chamada" aria-label="Ministérios — chamada" />
          <input name="sec_depoimentosTitulo" defaultValue={secoes.depoimentosTitulo} maxLength={80} placeholder="Depoimentos — título" aria-label="Depoimentos — título" />
          <input name="sec_agendaTitulo" defaultValue={secoes.agendaTitulo} maxLength={80} placeholder="Agenda — título" aria-label="Agenda — título" />
          <input name="sec_contribuaTitulo" defaultValue={secoes.contribuaTitulo} maxLength={80} placeholder="Contribua — título" aria-label="Contribua — título" />
          <input name="sec_contribuaTexto" defaultValue={secoes.contribuaTexto} maxLength={400} placeholder="Contribua — texto" aria-label="Contribua — texto" />
          <input name="sec_contatoTitulo" defaultValue={secoes.contatoTitulo} maxLength={80} placeholder="Contato — título" aria-label="Contato — título" />
          <input name="sec_contatoLead" defaultValue={secoes.contatoLead} maxLength={400} placeholder="Contato — texto" aria-label="Contato — texto" />
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
