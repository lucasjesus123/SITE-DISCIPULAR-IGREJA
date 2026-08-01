"use client";

import { useId, useState } from "react";

/**
 * Formulário de contato que abre o WhatsApp da igreja com a mensagem pronta.
 * Sem backend: compõe um link wa.me — simples, confiável e sem guardar dado.
 */
export function FormWhatsAppInst({ numero }: { numero: string | null }) {
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [msg, setMsg] = useState("");
  const idNome = useId();
  const idTel = useId();
  const idMsg = useId();

  // Só dígitos; se não houver número configurado, cai no wa.me genérico (o
  // visitante escolhe o contato) para não quebrar.
  const numeroLimpo = (numero ?? "").replace(/\D/g, "");

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = [
      nome && `Olá! Meu nome é ${nome}.`,
      msg || "Gostaria de conhecer a igreja.",
      contato && `Meu contato: ${contato}`,
    ]
      .filter(Boolean)
      .join(" ");
    const url = numeroLimpo
      ? `https://wa.me/${numeroLimpo}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <form className="form" onSubmit={enviar}>
      <label htmlFor={idNome}>Seu nome</label>
      <input id={idNome} className="f" placeholder="Digite seu nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      <label htmlFor={idTel}>WhatsApp</label>
      <input id={idTel} className="f" placeholder="(00) 90000-0000" value={contato} onChange={(e) => setContato(e.target.value)} maxLength={30} />
      <label htmlFor={idMsg}>Mensagem</label>
      <textarea id={idMsg} className="f area" placeholder="Quero conhecer a igreja..." value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={600} />
      <button type="submit" className="wabtn">✆ Enviar pelo WhatsApp</button>
    </form>
  );
}
