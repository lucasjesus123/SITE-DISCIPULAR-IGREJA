import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/session";
import { exigirAcessoTenant, NaoAutenticadoError, NaoAutorizadoError } from "@/lib/auth/rbac";
import { TenantIndisponivelError, TenantNaoEncontradoError } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { contadoresTriagem } from "@/lib/services/submissoes";
import { cssDoTema } from "@/lib/site/theme";
import { obterTokenCsrf } from "@/lib/security/csrf";
import { LateralPainel } from "@/components/painel/Lateral";
import { TopoPainel } from "@/components/painel/TopoPainel";
import { urlArquivoPublico } from "@/lib/storage/urls";
import { carregarModulos } from "@/lib/services/modulos";
import "../globals.css";

/**
 * Layout do painel de gestão.
 *
 * A AUTORIZAÇÃO ACONTECE AQUI, NO LAYOUT.
 *
 * Isso é deliberado: em Next.js App Router, o layout envolve todas as páginas
 * filhas, então nenhuma rota sob /painel pode ser alcançada sem passar por
 * este código. Se a verificação estivesse só em cada página, bastaria alguém
 * criar uma página nova e esquecer de verificar.
 *
 * Cada página AINDA verifica a permissão específica dela — este layout garante
 * apenas o mínimo (sessão válida + vínculo com a igreja do hostname).
 */

export const metadata: Metadata = {
  title: { default: "Painel", template: "%s · Painel" },
  // O painel NUNCA deve ser indexado.
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  let ctx;

  try {
    ctx = await exigirAcessoTenant();
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) redirect("/login");

    if (erro instanceof NaoAutorizadoError) {
      const sessao = await sessaoAtual();
      // Logado, mas sem vínculo com ESTA igreja. Não dizemos que a igreja
      // existe nem que ele está logado em outra: apenas mandamos para o login,
      // que é o comportamento indistinguível de "sessão expirou".
      if (!sessao) redirect("/login");
      redirect("/sem-acesso");
    }

    if (erro instanceof TenantNaoEncontradoError || erro instanceof TenantIndisponivelError) {
      redirect("/login");
    }

    throw erro;
  }

  // Membro comum não usa o painel de gestão — o lugar dele é o app.
  if (ctx.papel === "MEMBRO") redirect("/app");

  const [dados, contadores, , cookieStore, modulos] = await Promise.all([
    carregarDadosSite(ctx.tenant.id),
    contadoresTriagem(ctx.tenant.id),
    obterTokenCsrf(),
    cookies(),
    carregarModulos(ctx.db),
  ]);

  // Tema do painel escolhido pelo usuário (persistido em cookie). Ler no
  // servidor evita o "flash" de tema errado no primeiro carregamento.
  const tema = cookieStore.get("tema-painel")?.value === "escuro" ? "escuro" : "claro";

  // Logo para a sidebar (que é escura) — usa a marca clara. Fallback para a
  // marca oficial da Discipular quando é o tenant-âncora.
  const logoPainel = dados.config.logoClaroId
    ? urlArquivoPublico(dados.config.logoClaroId)
    : ctx.tenant.slug === "discipular"
      ? "/marca/logo-white.png"
      : null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />
      {/* Identidade Institucional: Archivo (títulos) + Inter (texto). */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700;800;900&family=Inter:wght@400;500;600;700&display=swap"
      />

      {/*
        Faixa de impersonação.

        Quando o super admin entra como uma igreja, ele PRECISA ver isso o
        tempo todo. Sem o aviso permanente, é questão de tempo até alguém
        fazer uma alteração achando que está no ambiente errado — e como as
        ações ficam registradas em nome da igreja, o rastro fica confuso.
      */}
      {ctx.sessao.impersonadoPor && (
        <div className="faixa-impersonacao" role="alert">
          Você está acessando como <strong>{ctx.tenant.nome}</strong> (sessão de suporte iniciada
          por {ctx.sessao.impersonadoPor}). Todas as ações ficam registradas.
        </div>
      )}

      <div className="painel" data-tema={tema}>
        <LateralPainel
          nomeIgreja={dados.config.nomeExibicao}
          logoUrl={logoPainel}
          nomeUsuario={ctx.sessao.nome}
          papel={ctx.papel}
          modulos={modulos}
          contadores={{
            caixaEntrada: contadores.total,
            oracoes: contadores.oracoesPendentes,
            batismos: contadores.batismosPendentes,
          }}
        />

        <main className="painel__conteudo">
          <TopoPainel
            nomeUsuario={ctx.sessao.nome}
            temaInicial={tema}
            novasMensagens={contadores.total}
          />
          {children}
        </main>
      </div>
    </>
  );
}
