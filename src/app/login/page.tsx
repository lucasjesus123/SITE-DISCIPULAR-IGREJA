import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/session";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { cssDoTema } from "@/lib/site/theme";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { FormularioLogin } from "@/components/auth/FormularioLogin";
import "../globals.css";
import "./login.css";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  const sessao = await sessaoAtual();
  if (sessao) redirect(sessao.papel === "MEMBRO" ? "/app" : "/escolher");

  await obterTokenCsrf();

  const tenant = await tenantDaRequisicao();
  const dados = tenant ? await carregarDadosSite(tenant.id) : null;
  const nome = dados?.config.nomeExibicao ?? "Discipular";
  const tagline = dados?.config.tagline ?? "Uma Casa de Discípulos.";

  const logo = dados?.config.logoClaroId
    ? urlArquivoPublico(dados.config.logoClaroId)
    : tenant?.slug === "discipular"
      ? "/marca/logo-white.png"
      : null;

  return (
    <>
      {dados && <style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />}
      {/* Inter (texto) — Archivo (títulos) já vem do tema do tenant. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />

      <main className="tela-login">
        {/* Marca (esquerda) */}
        <aside className="tela-login__marca">
          <div>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={nome} className="tela-login__logo" />
            ) : (
              <span className="tela-login__ref">{nome}</span>
            )}
          </div>
          <p className="tela-login__versiculo">
            Uma casa de <b>discípulos</b>.
          </p>
          <p className="tela-login__ref">{tagline}</p>
        </aside>

        {/* Formulário (direita) */}
        <section className="tela-login__form">
          <div className="tela-login__caixa">
            <p className="tela-login__eyebrow">Área restrita</p>
            <h1 className="tela-login__titulo">{nome}</h1>

            <FormularioLogin />

            <div className="tela-login__divisor">ou</div>
            <button type="button" className="tela-login__secundario" disabled title="Disponível em breve">
              Entrar com código no WhatsApp · em breve
            </button>

            <p className="tela-login__links">
              <a href="/recuperar-senha">Esqueci minha senha</a>
            </p>
            <p className="tela-login__voltar">
              <a href="/">← Voltar ao site</a>
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
