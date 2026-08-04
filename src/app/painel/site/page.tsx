import { exigirPermissao } from "@/lib/auth/rbac";
import { fontesDisponiveis, normalizarTema } from "@/lib/site/theme";
import { EditorSite } from "@/components/painel/EditorSite";
import { EditorConteudoHome } from "@/components/painel/site/EditorConteudoHome";
import { parseMinisterios, parseDepoimentos } from "@/lib/site/conteudo-home";
import type { ArquivoEnviado } from "@/components/painel/CampoUpload";
import { urlArquivoPublico } from "@/lib/storage/urls";

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
      heroEyebrow: true, heroTitulo: true, heroSubtitulo: true, heroImagemId: true, fundoImagemId: true, fotoPastorId: true, fotoPastoraId: true,
      heroCtaTexto: true, heroCtaLink: true,
      emailContato: true, telefoneContato: true, whatsapp: true,
      instagram: true, facebook: true, youtube: true, spotify: true,
      pixChave: true, pixTitular: true, pixDescricao: true,
      pwaNome: true, pwaNomeCurto: true, pwaCorTema: true,
      ministeriosJson: true, depoimentosJson: true,
      // dadosBancariosCriptografados fica DE FORA de propósito.
    },
  });
  const ministeriosHome = parseMinisterios(config?.ministeriosJson);
  const depoimentosHome = parseDepoimentos(config?.depoimentosJson);

  const tema = normalizarTema(config);

  // Detalhes das imagens atuais, para os campos de upload já mostrarem a foto.
  async function carregarImagem(id: string | null | undefined): Promise<ArquivoEnviado | null> {
    if (!id) return null;
    const arq = await ctx.db.arquivo.findFirst({
      where: { id },
      select: { id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true },
    });
    if (!arq) return null;
    return {
      id: arq.id,
      url: urlArquivoPublico(arq.id),
      nome: arq.nomeOriginal,
      mimeType: arq.mimeType,
      tamanhoBytes: arq.tamanhoBytes,
    };
  }
  const heroImagemInicial = await carregarImagem(config?.heroImagemId);
  const fundoImagemInicial = await carregarImagem(config?.fundoImagemId);
  const fotoPastorInicial = await carregarImagem(config?.fotoPastorId);
  const fotoPastoraInicial = await carregarImagem(config?.fotoPastoraId);

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
          heroImagemId: config?.heroImagemId ?? "",
          fundoImagemId: config?.fundoImagemId ?? "",
          fotoPastorId: config?.fotoPastorId ?? "",
          fotoPastoraId: config?.fotoPastoraId ?? "",
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
        heroImagemInicial={heroImagemInicial}
        fundoImagemInicial={fundoImagemInicial}
        fotoPastorInicial={fotoPastorInicial}
        fotoPastoraInicial={fotoPastoraInicial}
      />

      <section className="secao-painel" style={{ marginTop: "1.6rem" }}>
        <h2 className="secao-painel__titulo">Conteúdo da home</h2>
        <p className="secao-painel__desc">Ministérios e depoimentos que aparecem na página inicial.</p>
        <EditorConteudoHome ministerios={ministeriosHome} depoimentos={depoimentosHome} />
      </section>
    </>
  );
}
