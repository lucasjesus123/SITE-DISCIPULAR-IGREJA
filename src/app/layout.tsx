import type { Metadata, Viewport } from "next";
import "./globals.css";

/**
 * Layout raiz.
 *
 * Deliberadamente mínimo: quem define título, fontes e tema é o layout do
 * SITE (por tenant), do PAINEL ou da PLATAFORMA. Colocar metadata de marca
 * aqui vazaria a identidade de uma igreja para as páginas de outra.
 */

export const metadata: Metadata = {
  // Título neutro. Cada tenant sobrescreve no próprio layout.
  title: { default: "Discipular", template: "%s" },
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // nunca travar zoom: é requisito de acessibilidade
  themeColor: "#14161A",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
