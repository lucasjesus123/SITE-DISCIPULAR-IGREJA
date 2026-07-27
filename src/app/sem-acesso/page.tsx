import Link from "next/link";
import "../globals.css";

export const metadata = {
  title: "Sem acesso",
  robots: { index: false, follow: false },
};

/**
 * Mostrada quando a pessoa está autenticada mas não tem vínculo com a igreja
 * deste endereço.
 *
 * O texto é deliberadamente vago: não confirmamos se a igreja existe, se o
 * usuário já teve acesso, nem se ele tem acesso a outra. Qualquer uma dessas
 * informações ajudaria alguém a mapear a plataforma.
 */
export default function SemAcesso() {
  return (
    <main
      className="theme-dark"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem 1.25rem" }}
    >
      <div className="centro stack" style={{ maxWidth: 460 }}>
        <p className="eyebrow eyebrow--centered">Acesso restrito</p>
        <h1 className="h3">Você não tem acesso a esta área.</h1>
        <p className="dim">
          Se você acredita que deveria ter, fale com o responsável pela sua igreja para que ele
          libere o seu acesso.
        </p>
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1rem", flexWrap: "wrap" }}>
          <Link href="/" className="btn btn--ghost">
            Ir para o site
          </Link>
          <Link href="/login" className="btn">
            Entrar com outra conta
          </Link>
        </div>
      </div>
    </main>
  );
}
