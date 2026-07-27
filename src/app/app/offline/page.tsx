export const metadata = { title: "Sem conexão" };

/**
 * Página servida pelo service worker quando a rede falha.
 *
 * Deliberadamente estática e sem dado nenhum: ela fica no cache do aparelho,
 * então não pode conter nada específico de usuário nem de igreja.
 */
export default function Offline() {
  return (
    <div
      style={{
        minHeight: "70vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem 1.5rem",
        textAlign: "center",
      }}
    >
      <div>
        <p className="eyebrow eyebrow--centered">Sem conexão</p>
        <h1 style={{ fontSize: "1.8rem", marginTop: "1rem" }}>Você está offline.</h1>
        <p style={{ color: "var(--bone-dim)", marginTop: "1rem", maxWidth: "36ch" }}>
          Assim que sua internet voltar, o aplicativo carrega normalmente.
        </p>
      </div>
    </div>
  );
}
