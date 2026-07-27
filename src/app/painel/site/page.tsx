import { exigirPermissao } from "@/lib/auth/rbac";
import { fontesDisponiveis, normalizarTema } from "@/lib/site/theme";
import { EditorSite } from "@/components/painel/EditorSite";

export const dynamic = "force-dynamic";
export const metadata = { title: "Site da igreja" };

/**
 * Editor whitelabel.
 *
 * O que a igreja edita aqui reflete imediatamente no site público E no PWA:
 * cores, fontes, textos do destaque, contatos, redes e PIX.
 *
 * Note o que NÃO é enviado ao cliente: `dadosBancariosCriptografados`. O
 * campo existe no banco, mas nunca é decifrado para popular o formulário —
 * quem quiser trocar digita de novo. Decifrar para exibir colocaria o dado em
 * claro no HTML da página, ao alcance de qualquer XSS futuro.
 */
export default async function PaginaConfigSite() {
  const ctx = await exigirPermissao("site.editar");

  const config = await ctx.db.siteConfig.findFirst({
    select: {
      nomeExibicao: true, tagline: true, descricaoSeo: true,
      corAcento: true, corAcentoClara: true, corTinta: true, corPapel: true,
      fonteTitulo: true, fonteTexto: true,
      heroEyebrow: true, heroTitulo: true, heroSubtitulo: true,
      heroCtaTexto: true, heroCtaLink: true,
      emailContato: true, telefoneContato: true, whatsapp: true,
      instagram: true, facebook: true, youtube: true, spotify: true,
      pixChave: true, pixTitular: true, pixDescricao: true,
      pwaNome: true, pwaNomeCurto: true, pwaCorTema: true,
      // dadosBancariosCriptografados fica DE FORA de propósito.
    },
  });

  const tema = normalizarTema(config);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Site da igreja</h1>
          <p className="painel__sub">
            Tudo que você mudar aqui vale para o site e para o aplicativo dos membros.
          </p>
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer" className="btn btn--sm btn--ghost">
          Ver o site
        </a>
      </div>

      <EditorSite
        inicial={{
          nomeExibicao: config?.nomeExibicao ?? ctx.tenant.nome,
          tagline: config?.tagline ?? "",
          descricaoSeo: config?.descricaoSeo ?? "",
          corAcento: tema.corAcento,
          corAcentoClara: tema.corAcentoClara,
          corTinta: tema.corTinta,
          corPapel: tema.corPapel,
          fonteTitulo: tema.fonteTitulo,
          fonteTexto: tema.fonteTexto,
          heroEyebrow: config?.heroEyebrow ?? "",
          heroTitulo: config?.heroTitulo ?? "",
          heroSubtitulo: config?.heroSubtitulo ?? "",
          heroCtaTexto: config?.heroCtaTexto ?? "",
          heroCtaLink: config?.heroCtaLink ?? "",
          emailContato: config?.emailContato ?? "",
          telefoneContato: config?.telefoneContato ?? "",
          whatsapp: config?.whatsapp ?? "",
          instagram: config?.instagram ?? "",
          facebook: config?.facebook ?? "",
          youtube: config?.youtube ?? "",
          spotify: config?.spotify ?? "",
          pixChave: config?.pixChave ?? "",
          pixTitular: config?.pixTitular ?? "",
          pixDescricao: config?.pixDescricao ?? "",
          pwaNome: config?.pwaNome ?? "",
          pwaNomeCurto: config?.pwaNomeCurto ?? "",
          pwaCorTema: config?.pwaCorTema ?? tema.corTinta,
        }}
        fontes={fontesDisponiveis}
      />
    </>
  );
}
