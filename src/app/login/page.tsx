import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/session";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema } from "@/lib/site/theme";
import { FormularioLogin } from "@/components/auth/FormularioLogin";
import "../globals.css";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  // Já logado: não faz sentido mostrar o formulário.
  const sessao = await sessaoAtual();
  if (sessao) redirect(sessao.papel === "MEMBRO" ? "/app" : "/painel");

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
            <p className="eyebrow eyebrow--centered">Área restrita</p>
            <h1 className="h3" style={{ marginTop: "1rem" }}>
              {nome}
            </h1>
          </div>

          <FormularioLogin />

          <p className="centro dim" style={{ marginTop: "2rem", fontSize: ".85rem" }}>
            <a href="/recuperar-senha" className="gold">
              Esqueci minha senha
            </a>
          </p>

          <p className="centro" style={{ marginTop: "2.5rem", fontSize: ".8rem", color: "var(--bone-faint)" }}>
            <a href="/">← Voltar ao site</a>
          </p>
        </div>
      </main>
    </>
  );
}
