"use client";

import { useState } from "react";

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}

export function FormularioInscricaoPublica({
  slug,
  pedirTelefone,
  pedirEmail,
}: {
  slug: string;
  pedirTelefone: boolean;
  pedirEmail: boolean;
}) {
  const [estado, setEstado] = useState<"idle" | "enviando" | "ok">("idle");
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (estado === "enviando") return;
    setEstado("enviando");
    setErro(null);
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch(`/api/publico/inscricao/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "",
        },
        body: JSON.stringify({
          nome: form.get("nome"),
          telefone: form.get("telefone") ?? "",
          email: form.get("email") ?? "",
          observacao: form.get("observacao") ?? "",
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        setErro(d.erro ?? "Não foi possível concluir. Tente de novo.");
        setEstado("idle");
        return;
      }
      setEstado("ok");
    } catch {
      setErro("Falha de conexão. Tente novamente.");
      setEstado("idle");
    }
  }

  if (estado === "ok") {
    return (
      <div className="alerta alerta--sucesso" role="status" style={{ fontSize: "1rem" }}>
        Inscrição confirmada! 🎉 Em breve entraremos em contato.
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="stack" style={{ "--flow": "1.1rem" } as React.CSSProperties}>
      {erro && <div className="alerta alerta--erro" role="alert">{erro}</div>}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="ip-nome">Nome completo</label>
        <input id="ip-nome" name="nome" required minLength={2} maxLength={160} autoComplete="name" />
      </div>

      {pedirTelefone && (
        <div className="campo">
          <label className="campo__rotulo" htmlFor="ip-tel">Telefone / WhatsApp</label>
          <input id="ip-tel" name="telefone" type="tel" maxLength={20} autoComplete="tel" placeholder="(51) 99999-9999" />
        </div>
      )}

      {pedirEmail && (
        <div className="campo">
          <label className="campo__rotulo" htmlFor="ip-email">E-mail</label>
          <input id="ip-email" name="email" type="email" maxLength={254} autoComplete="email" />
        </div>
      )}

      <div className="campo">
        <label className="campo__rotulo" htmlFor="ip-obs">Observação (opcional)</label>
        <input id="ip-obs" name="observacao" maxLength={500} />
      </div>

      <button type="submit" className="btn btn--lg btn--block" disabled={estado === "enviando"}>
        {estado === "enviando" ? "Enviando…" : "Confirmar inscrição"}
      </button>
    </form>
  );
}
