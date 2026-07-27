import type { Metadata } from "next";
import { z } from "zod";
import { tokenTemFormatoValido } from "@/lib/auth/recuperacao";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema } from "@/lib/site/theme";
import { FormularioRedefinirSenha } from "@/components/auth/FormularioRedefinirSenha";
import "../globals.css";

/**
 * Escolha da nova senha, a partir do link do e-mail.
 *
 * `referrer: "no-referrer"` NÃO É DETALHE.
 * O token chega na query string — é a única forma de transportá-lo num link de
 * e-mail. Sem esta diretiva, qualquer requisição saindo desta página (uma
 * fonte, um ícone, um clique num link externo) levaria a URL COMPLETA no header
 * `Referer`, entregando o token de recuperação a um terceiro. Com ela, o
 * navegador simplesmente não envia o header.
 *
 * `noindex` pelo mesmo motivo: uma URL com token indexada por buscador é uma
 * credencial publicada.
 */
export const metadata: Metadata = {
  title: "Definir nova senha",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export const dynamic = "force-dynamic";

/**
 * Lista fechada de parâmetros aceitos, com `safeParse` e sem fallback
 * permissivo: qualquer coisa fora do formato de token é tratada como link
 * inválido. Validar o FORMATO aqui evita mandar lixo para o servidor e dá uma
 * mensagem melhor a quem colou o link pela metade (o que acontece o tempo todo,
 * porque clientes de e-mail quebram URLs longas em duas linhas).
 */
const schemaParams = z.object({
  // O formato é o mesmo aceito pelo servidor — reaproveitado de propósito, para
  // que a tela e a rota nunca divirjam sobre o que é um token bem formado.
  token: z.string().refine(tokenTemFormatoValido),
});

export default async function PaginaRedefinirSenha({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const analise = schemaParams.safeParse(params);

  await obterTokenCsrf();

  const tenant = await tenantDaRequisicao();
  const dados = tenant ? await carregarDadosSite(tenant.id) : null;

  return (
    <>
      {dados && <style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />}

      <main
        className="theme-dark"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem 1.25rem" }}
      >
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div className="centro" style={{ marginBottom: "2.5rem" }}>
            <p className="eyebrow eyebrow--centered">Acesso</p>
            <h1 className="h3" style={{ marginTop: "1rem" }}>
              Definir nova senha
            </h1>
          </div>

          {analise.success ? (
            /**
             * O token vai como PROP para o componente cliente, que o envia no
             * corpo do POST. Repare que a página não confirma se ele é válido:
             * isso só o servidor sabe, e responder "token expirado" aqui exigiria
             * uma consulta que transformaria a página num verificador de tokens.
             */
            <FormularioRedefinirSenha token={analise.data.token} />
          ) : (
            <div className="stack" style={{ "--flow": "1.2rem" } as React.CSSProperties}>
              <div className="alerta alerta--erro" role="alert">
                Este link está incompleto ou não é válido. Alguns programas de
                e-mail quebram links longos em duas linhas — confira se copiou o
                endereço inteiro.
              </div>
              <a href="/recuperar-senha" className="btn btn--block">
                Pedir um novo link
              </a>
            </div>
          )}

          <p className="centro dim" style={{ marginTop: "2rem", fontSize: ".85rem" }}>
            <a href="/login" className="gold">
              Voltar para o login
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
