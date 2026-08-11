/**
 * Crédito discreto "Desenvolvido por Grupo Conexão" — aparece no rodapé do
 * site, do painel e do app. O link abre o site da Conexão em nova aba.
 *
 * É de propósito um componente único: a assinatura fica idêntica nas três
 * superfícies e muda num lugar só.
 */
export function CreditoConexao({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={className} style={style}>
      Desenvolvido por{" "}
      <a
        href="https://www.conexaomkt.com.br"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "inherit", textDecoration: "underline", fontWeight: 600 }}
      >
        Grupo Conexão
      </a>
    </span>
  );
}
