"use client";

import { useEffect, useState } from "react";

/**
 * Instruções de instalação do PWA, com detecção do ambiente.
 *
 * POR QUE A DETECÇÃO ACONTECE NO CLIENTE
 * Dava para farejar o `User-Agent` no servidor e renderizar só o passo a passo
 * certo. Não fazemos isso por dois motivos. Primeiro, o UA mente: navegador
 * embutido de Instagram, modo desktop no celular e extensões de privacidade
 * reescrevem a string o tempo todo. Segundo, decidir no servidor tornaria a
 * página um HTML diferente por aparelho, o que atrapalha cache e torna o
 * conteúdo inacessível para quem caiu no ramo errado da detecção.
 *
 * A solução é a de sempre em acessibilidade: renderizar TUDO e apenas destacar
 * o provável. Quem estiver no Android e cair na aba do iPhone continua com as
 * instruções do iPhone visíveis, e vice-versa.
 *
 * A API `beforeinstallprompt` só existe em navegadores baseados em Chromium.
 * No iOS, a Apple não expõe instalação programática: a única forma é o menu
 * Compartilhar. Por isso o botão aparece quando dá, e o texto sempre.
 */

type Ambiente = "ios" | "android" | "desktop" | "instalado" | "desconhecido";

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstruirInstalacao() {
  // Começa em "desconhecido" de propósito: no primeiro render (que também
  // acontece no servidor, na hidratação) não existe `navigator`, e chutar um
  // valor causaria troca visível de conteúdo na cara do usuário.
  const [ambiente, setAmbiente] = useState<Ambiente>("desconhecido");
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    setAmbiente(detectar());

    function aoPoderInstalar(e: Event) {
      // Impede o mini-infobar padrão do Chrome para que a instalação aconteça
      // pelo nosso botão, dentro do contexto da explicação.
      e.preventDefault();
      setEvento(e as EventoInstalacao);
    }

    function aoInstalar() {
      setAmbiente("instalado");
      setEvento(null);
      setResultado("Pronto: o aplicativo está na sua tela inicial.");
    }

    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);

    return () => {
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  async function instalar() {
    if (!evento) return;
    try {
      await evento.prompt();
      const escolha = await evento.userChoice;
      setResultado(
        escolha.outcome === "accepted"
          ? "Instalando… o ícone vai aparecer na sua tela inicial."
          : "Tudo bem. Você pode instalar depois, quando quiser.",
      );
    } catch {
      setResultado("Não conseguimos abrir a instalação. Use o passo a passo abaixo.");
    } finally {
      // O evento só pode ser usado uma vez; guardar a referência daria um
      // segundo clique que falha silenciosamente.
      setEvento(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.1rem" }}>
      {ambiente === "instalado" && (
        <div className="alerta alerta--sucesso" role="status">
          Você já está usando o aplicativo instalado. Não precisa fazer mais nada.
        </div>
      )}

      {evento && ambiente !== "instalado" && (
        <button type="button" className="btn btn--block btn--lg" onClick={instalar}>
          Instalar agora
        </button>
      )}

      {resultado && (
        <p style={{ fontSize: ".85rem", color: "var(--bone-dim)" }} aria-live="polite">
          {resultado}
        </p>
      )}

      <Passos
        titulo="No iPhone e iPad (Safari)"
        destaque={ambiente === "ios"}
        passos={[
          "Abra este site no Safari — a instalação não funciona pelo Chrome no iPhone.",
          "Toque no botão Compartilhar, o quadradinho com a seta para cima, na barra de baixo.",
          "Role a lista e toque em “Adicionar à Tela de Início”.",
          "Confirme em “Adicionar”. O ícone da igreja aparece junto dos seus outros aplicativos.",
        ]}
      />

      <Passos
        titulo="No Android (Chrome)"
        destaque={ambiente === "android"}
        passos={[
          "Toque nos três pontinhos no canto superior direito do Chrome.",
          "Escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.",
          "Confirme em “Instalar”.",
          "Pronto: o app abre em tela cheia, sem a barra do navegador.",
        ]}
      />

      <Passos
        titulo="No computador"
        destaque={ambiente === "desktop"}
        passos={[
          "No Chrome ou Edge, procure o ícone de instalação na ponta direita da barra de endereço.",
          "Clique nele e confirme em “Instalar”.",
          "O aplicativo passa a abrir em janela própria.",
        ]}
      />
    </div>
  );
}

function Passos({
  titulo,
  passos,
  destaque,
}: {
  titulo: string;
  passos: string[];
  destaque: boolean;
}) {
  return (
    <section
      style={{
        padding: "1.2rem",
        borderRadius: "var(--radius-lg)",
        border: "1px solid",
        borderColor: destaque ? "var(--gold-line)" : "var(--line-on-dark)",
        background: destaque ? "rgb(var(--gold-rgb) / .06)" : "var(--ink-700)",
      }}
    >
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>
        {titulo}
        {destaque && (
          <span
            style={{
              marginLeft: ".6rem",
              fontSize: ".6rem",
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "var(--gold)",
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
            }}
          >
            seu aparelho
          </span>
        )}
      </h2>

      <ol style={{ marginTop: ".9rem", paddingLeft: "1.1rem", display: "grid", gap: ".55rem" }}>
        {passos.map((passo) => (
          <li
            key={passo}
            style={{ fontSize: ".88rem", color: "var(--bone-dim)", lineHeight: 1.6 }}
          >
            {passo}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Detecção deliberadamente simples e sem bibliotecas.
 *
 * Só precisamos saber qual bloco destacar; errar significa destacar o card
 * errado, não quebrar nada. O iPad moderno se identifica como Mac, então a
 * checagem de toque é o que o separa de um desktop de verdade.
 */
function detectar(): Ambiente {
  if (typeof window === "undefined") return "desconhecido";

  // Já rodando instalado: `display-mode: standalone` (padrão) ou a propriedade
  // proprietária do Safari no iOS.
  const emPe =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (emPe) return "instalado";

  const ua = window.navigator.userAgent;

  if (/android/i.test(ua)) return "android";
  if (/iphone|ipod|ipad/i.test(ua)) return "ios";
  // iPad com "Solicitar site para computador" ou iPadOS 13+: diz ser Macintosh,
  // mas tem tela sensível ao toque, o que nenhum Mac tem.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";

  return "desktop";
}
