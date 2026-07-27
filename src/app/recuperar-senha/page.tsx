import type { Metadata } from "next";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema } from "@/lib/site/theme";
import { FormularioRecuperarSenha } from "@/components/auth/FormularioRecuperarSenha";
import "../globals.css";

/**
 * "Esqueci minha senha".
 *
 * A página é aberta a qualquer visitante — precisa ser, já que quem chega aqui
 * por definição não consegue entrar. Toda a proteção está na rota
 * (`/api/auth/recuperar`): CSRF, rate limit por IP e por conta, e a resposta
 * neutra que não revela se o e-mail existe.
 *
 * `noindex` porque uma tela de recuperação indexada é isca de phishing: o
 * atacante copia o layout, compra o anúncio e colhe e-mails.
 */
export const metadata: Metadata = {
  title: "Recuperar senha",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PaginaRecuperarSenha() {
  // Emite o cookie de CSRF antes de renderizar o formulário. Sem isto, o
  // primeiro envio de um visitante que nunca abriu outra página do site
  // falharia com "token de segurança inválido".
  await obterTokenCsrf();

  const tenant = await tenantDaRequisicao();
  const dados = tenant ? await carregarDadosSite(tenant.id) : null;
  const nome = dados?.config.nomeExibicao ?? "Discipular";

  return (
    <>
      {dados && <style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />}

      <main
        className="theme-dark"
        style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem 1.25rem" }}
      >
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div className="centro" style={{ marginBottom: "2.5rem" }}>
            <p className="eyebrow eyebrow--centered">Acesso</p>
            <h1 className="h3" style={{ marginTop: "1rem" }}>
              Recuperar senha
            </h1>
            <p className="dim" style={{ marginTop: ".8rem", fontSize: ".9rem" }}>
              Informe o e-mail da sua conta em {nome}. Enviaremos um link para
              você escolher uma senha nova.
            </p>
          </div>

          <FormularioRecuperarSenha />

          <p className="centro dim" style={{ marginTop: "2rem", fontSize: ".85rem" }}>
            <a href="/login" className="gold">
              Lembrei minha senha
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
