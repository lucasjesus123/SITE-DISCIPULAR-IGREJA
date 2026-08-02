"use client";

import { useActionState, useState } from "react";
import { iniciarContribuicaoAction, type ResultadoPix } from "@/app/app/contribuir/acoes";
import { CopiarPix } from "@/components/app/CopiarPix";

const TIPOS = [
  { chave: "DIZIMO", rotulo: "Dízimo" },
  { chave: "OFERTA", rotulo: "Oferta" },
  { chave: "MISSOES", rotulo: "Missões" },
] as const;

const VALORES = ["50", "100", "200"];

/**
 * Fluxo de contribuição por PIX (ASAAS). Escolhe tipo e valor, identifica-se
 * (exigido pelo gateway e pelo recibo) e recebe o "copia e cola" + QR. A
 * confirmação e o lançamento no Financeiro vêm pelo webhook — aqui a tela só
 * orienta a pagar.
 */
export function ContribuirPix() {
  const [resultado, enviar, pendente] = useActionState(iniciarContribuicaoAction, null as ResultadoPix);
  const [tipo, setTipo] = useState<(typeof TIPOS)[number]["chave"]>("DIZIMO");
  const [valor, setValor] = useState("100");

  if (resultado?.ok) {
    return (
      <div className="pix-pronto">
        <p className="eyebrow" style={{ color: "var(--mint, #5ee6a8)" }}>PIX gerado</p>
        <h2 style={{ fontSize: "1.2rem", margin: ".4rem 0 1rem" }}>Escaneie ou copie para pagar</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${resultado.pixImagemBase64}`}
          alt="QR Code do PIX"
          width={220}
          height={220}
          style={{ width: 220, height: 220, borderRadius: 14, background: "#fff", padding: 10, display: "block", margin: "0 auto 1rem" }}
        />
        <CopiarPix chave={resultado.pixCopiaECola} titular={null} />
        <p style={{ fontSize: ".8rem", color: "var(--bone-dim)", marginTop: "1rem", lineHeight: 1.6, textAlign: "center" }}>
          🔒 Assim que o pagamento cair, ele é registrado automaticamente e você recebe o recibo.
        </p>
      </div>
    );
  }

  return (
    <form action={enviar} className="pix-form">
      {resultado && !resultado.ok && <div className="alerta alerta--erro" role="alert">{resultado.mensagem}</div>}

      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="valor" value={valor} />

      <p className="pix-lbl">Tipo</p>
      <div className="pix-pills">
        {TIPOS.map((t) => (
          <button key={t.chave} type="button" onClick={() => setTipo(t.chave)} className={`pix-pill${tipo === t.chave ? " pix-pill--on" : ""}`}>
            {t.rotulo}
          </button>
        ))}
      </div>

      <p className="pix-lbl">Valor</p>
      <div className="pix-valores">
        {VALORES.map((v) => (
          <button key={v} type="button" onClick={() => setValor(v)} className={`pix-amt${valor === v ? " pix-amt--on" : ""}`}>
            R${v}
          </button>
        ))}
      </div>
      <label className="pix-campo">
        <span>Outro valor (R$)</span>
        <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 150,00" />
      </label>

      <p className="pix-lbl">Seus dados</p>
      <label className="pix-campo">
        <span>Nome</span>
        <input name="nome" required minLength={2} maxLength={160} placeholder="Seu nome completo" />
      </label>
      <label className="pix-campo">
        <span>CPF</span>
        <input name="cpf" required inputMode="numeric" placeholder="Somente números" />
      </label>

      <button type="submit" className="btn btn--block" disabled={pendente} style={{ marginTop: "1rem" }}>
        {pendente ? "Gerando PIX…" : "Contribuir com PIX"}
      </button>
      <p style={{ fontSize: ".76rem", color: "var(--bone-dim)", marginTop: ".7rem", textAlign: "center" }}>
        🔒 Ambiente seguro · seus dados são usados apenas para o recibo.
      </p>
    </form>
  );
}
