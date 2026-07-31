"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Aba "Conectar meu WhatsApp".
 *
 * Fluxo: botão → POST /api/whatsapp/connect (gera a instância + QR) → mostra o
 * QR → faz polling em GET /api/whatsapp/status a cada 3s → quando conectar,
 * troca para o estado "Conectado ✅".
 *
 * Nenhum token da uazapi passa por aqui: o componente só fala com a NOSSA API.
 */

type Estado = {
  status: string;
  numero: string | null;
  perfilNome: string | null;
};

function lerCookie(nome: string): string | null {
  const alvo = `${nome}=`;
  for (const parte of document.cookie.split("; ")) {
    if (parte.startsWith(alvo)) return decodeURIComponent(parte.slice(alvo.length));
  }
  return null;
}

export function ConectarWhatsapp({
  inicial,
  configurado,
}: {
  inicial: Estado;
  configurado: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [qr, setQr] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pararPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const verificarStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/status", { headers: { accept: "application/json" } });
      const d = (await r.json()) as Estado & { conectado?: boolean };
      setEstado({ status: d.status, numero: d.numero, perfilNome: d.perfilNome });
      if (d.conectado) {
        setQr(null);
        setPaircode(null);
        pararPolling();
      }
    } catch {
      /* silencioso: a próxima tentativa do polling cobre */
    }
  }, [pararPolling]);

  useEffect(() => {
    // Ao abrir a tela, confere o estado real uma vez.
    if (configurado) void verificarStatus();
    return () => pararPolling();
  }, [configurado, verificarStatus, pararPolling]);

  async function conectar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: {
          "x-csrf-token": lerCookie("discipular-csrf") ?? lerCookie("__Host-discipular-csrf") ?? "",
          accept: "application/json",
        },
      });
      const d = (await r.json().catch(() => ({}))) as { qrcode?: string; paircode?: string; erro?: string };
      if (!r.ok) {
        setErro(d.erro ?? "Não foi possível iniciar a conexão.");
        return;
      }
      setQr(d.qrcode ?? null);
      setPaircode(d.paircode ?? null);
      // Começa a checar a cada 3s se já pareou.
      pararPolling();
      pollRef.current = setInterval(verificarStatus, 3000);
    } catch {
      setErro("Falha de conexão. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  if (!configurado) {
    return (
      <div className="alerta alerta--erro" role="status">
        O WhatsApp ainda não foi ativado pelo administrador da plataforma. Assim que a chave
        da uazapi for configurada no servidor, o botão de conectar aparece aqui.
      </div>
    );
  }

  const conectado = estado.status === "conectado";

  return (
    <div className="stack" style={{ "--flow": "1.3rem" } as React.CSSProperties}>
      {conectado ? (
        <div className="wa-conectado">
          <span className="wa-dot" aria-hidden="true" />
          <div>
            <p style={{ fontWeight: 700 }}>WhatsApp conectado ✅</p>
            <p style={{ fontSize: ".88rem", color: "var(--pnl-text-dim)" }}>
              {estado.perfilNome ? `${estado.perfilNome} · ` : ""}
              {estado.numero ?? "número conectado"}
            </p>
          </div>
        </div>
      ) : (
        <>
          {erro && <div className="alerta alerta--erro" role="alert">{erro}</div>}

          {qr ? (
            <div className="wa-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR Code para conectar o WhatsApp" width={260} height={260} />
              <div>
                <p style={{ fontWeight: 600, marginBottom: ".4rem" }}>Escaneie para conectar</p>
                <ol style={{ fontSize: ".88rem", color: "var(--pnl-text-dim)", paddingLeft: "1.1rem", display: "grid", gap: ".3rem" }}>
                  <li>Abra o WhatsApp no celular da igreja</li>
                  <li>Toque em <strong>Aparelhos conectados</strong></li>
                  <li>Toque em <strong>Conectar um aparelho</strong> e aponte para o QR</li>
                </ol>
                {paircode && (
                  <p style={{ marginTop: ".8rem", fontSize: ".85rem" }}>
                    Ou use o código: <strong style={{ letterSpacing: ".1em" }}>{paircode}</strong>
                  </p>
                )}
                <p style={{ marginTop: ".8rem", fontSize: ".8rem", color: "var(--pnl-text-faint)" }}>
                  Aguardando a leitura… assim que conectar, esta tela atualiza sozinha.
                </p>
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--pnl-text-dim)", maxWidth: "52ch" }}>
              Conecte o número de WhatsApp da igreja para enviar mensagens, confirmações e as
              automações (boas-vindas, aniversários, convites) direto do sistema.
            </p>
          )}

          <div>
            <button type="button" className="btn" onClick={conectar} disabled={carregando}>
              {carregando ? "Gerando QR…" : qr ? "Gerar novo QR" : "Conectar meu WhatsApp"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
