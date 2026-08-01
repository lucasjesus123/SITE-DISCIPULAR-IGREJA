import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/session";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema } from "@/lib/site/theme";
import { FormularioLogin } from "@/components/auth/FormularioLogin";
import { FundoOndas } from "@/components/auth/FundoOndas";
import "../globals.css";
import "./login.css";

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

      <main className="tela-login">
        <FundoOndas />

        <div className="tela-login__card">
          <div className="tela-login__marca">
            <p className="tela-login__eyebrow">Área restrita</p>
            <h1 className="tela-login__titulo">{nome}</h1>
          </div>

          <FormularioLogin />

          <p className="tela-login__links">
            <a href="/recuperar-senha">Esqueci minha senha</a>
          </p>

          <p className="tela-login__voltar">
            <a href="/">← Voltar ao site</a>
          </p>
        </div>
      </main>
    </>
  );
}
