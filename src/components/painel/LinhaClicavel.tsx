"use client";

import { useRouter } from "next/navigation";

/**
 * Linha de tabela clicável. A linha inteira vira um "link" para `href`
 * (ex.: abrir/editar um contato da caixa de entrada), com suporte a teclado
 * (Enter/Espaço) e foco visível — sem aninhar um <a> dentro do <tr>, que seria
 * inválido para leitores de tela.
 */
export function LinhaClicavel({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <tr
      className="linha-clicavel"
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      {children}
    </tr>
  );
}
