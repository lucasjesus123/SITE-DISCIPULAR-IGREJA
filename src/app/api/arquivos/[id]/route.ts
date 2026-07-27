import { NextResponse } from "next/server";
import { exigirAcessoTenant } from "@/lib/auth/rbac";
import { tratarErro } from "@/lib/http/erros";
import { logger } from "@/lib/logger";
import { exigirTenant } from "@/lib/tenant/resolve";
import { detectarMimePorMagicBytes, lerConteudo, metadadosArquivo } from "@/lib/storage/arquivos";
import { MIMES_PERMITIDOS, MIME_PARA_EXTENSAO } from "@/lib/storage/urls";
import { id as idSchema } from "@/lib/validation/comum";

/**
 * =============================================================================
 * GET /api/arquivos/[id] — entrega de upload
 * =============================================================================
 *
 * POR QUE ESTA ROTA EXISTE, EM VEZ DE `public/uploads/`
 *
 * Servir um arquivo enviado por usuário a partir da MESMA ORIGEM do painel,
 * sem os cabeçalhos abaixo, é XSS armazenado — não "um risco teórico", mas o
 * caminho exato:
 *
 *   1. A secretária da Igreja A envia "curriculo.pdf". O arquivo é, na
 *      verdade, um documento HTML com <script> dentro (ou um PDF poliglota,
 *      que é HTML válido E PDF válido ao mesmo tempo).
 *   2. Sem `X-Content-Type-Options: nosniff`, o navegador ignora o
 *      Content-Type que declaramos, fareja o conteúdo, conclui "isto é HTML"
 *      e RENDERIZA.
 *   3. Sem `Content-Disposition: attachment`, isso acontece numa aba, não num
 *      download.
 *   4. Renderizado em igrejaA.com.br, o script tem acesso a `document.cookie`
 *      e pode fazer `fetch()` autenticado para qualquer rota do painel — com
 *      os privilégios de quem abriu o link. Se quem abriu foi o pastor, o
 *      script exporta a base de membros.
 *
 * Cada cabeçalho fecha um degrau dessa escada:
 *
 *   Content-Type      -> do MIME DETECTADO nos bytes, nunca do banco cru
 *   nosniff           -> o navegador obedece ao Content-Type que mandamos
 *   Content-Disposition attachment (PDF) -> baixa, não abre
 *   CSP "default-src 'none'; sandbox"    -> mesmo que algo renderize, não
 *                                           carrega recurso, não roda script,
 *                                           não tem origem
 *   Cache-Control private                -> proxy compartilhado não guarda
 *   Vary: Cookie                         -> cache do navegador não serve o
 *                                           arquivo de um usuário a outro
 *
 * ISOLAMENTO
 * O tenant vem do HOSTNAME e a busca passa pelo cliente escopado. Um id da
 * Igreja B simplesmente NÃO EXISTE quando a requisição chega por
 * igrejaA.com.br — a resposta é 404, não 403. Um 403 confirmaria a existência
 * do arquivo em outra igreja, que é justamente o que um atacante quer saber ao
 * iterar identificadores.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Imagens abrem na página; PDF sempre baixa. */
const ABRE_NA_PAGINA = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // ---- 1. Identificador: allowlist de formato antes de tocar o banco.
    const { id: idBruto } = await params;
    const analise = idSchema.safeParse(idBruto);
    if (!analise.success) {
      return naoEncontrado();
    }

    // ---- 2. Tenant pelo HOSTNAME. Não existe parâmetro de igreja nesta rota.
    const tenant = await exigirTenant();

    // ---- 3. Metadados primeiro, disco depois.
    // Precisamos saber se o arquivo é público e qual o sha256 antes de decidir
    // ler os bytes: uma galeria com 40 imagens já em cache do navegador vira 40
    // respostas 304 sem uma única leitura de disco.
    const meta = await metadadosArquivo(tenant.id, analise.data);
    if (!meta) {
      return naoEncontrado();
    }

    // ---- 4. Autorização, só para arquivo restrito.
    //
    // `exigirAcessoTenant()` exige sessão válida E membership ativo NESTA
    // igreja. Um pastor da Igreja B logado que cole a URL da Igreja A é
    // recusado, porque a sessão dele aponta para outro tenant.
    if (!meta.publico) {
      await exigirAcessoTenant();
    }

    // ---- 5. Revalidação por ETag.
    //
    // O sha256 é um ETag perfeito: ele MUDA se e somente se o conteúdo mudar.
    // Usar `criadoEm` ou o id seria mais frágil.
    const etag = `"${meta.sha256}"`;
    if (etagConfere(request.headers.get("if-none-match"), etag)) {
      return new NextResponse(null, {
        status: 304,
        headers: cabecalhosDeSeguranca(meta.publico, etag),
      });
    }

    // ---- 6. Bytes.
    const conteudo = await lerConteudo(tenant.id, meta.caminho);
    if (!conteudo) {
      // Registro existe, arquivo não. Vale investigar (disco remontado,
      // restauração parcial de backup), mas para o cliente é 404 igual.
      logger.aviso("Arquivo registrado sem conteúdo em disco", {
        arquivoId: meta.id,
        tenantId: tenant.id,
      });
      return naoEncontrado();
    }

    /**
     * ---- 7. MIME DETECTADO, não o do banco.
     *
     * A coluna `mimeType` foi preenchida por magic bytes no upload, então em
     * condições normais os dois valores batem. Detectamos de novo porque a
     * coluna é texto no banco e o arquivo é um byte no disco: se qualquer um
     * dos dois for adulterado depois (SQL injection em outra rota, restauração
     * inconsistente, acesso ao servidor), a divergência aparece AQUI, na única
     * função que efetivamente coloca o valor num cabeçalho HTTP.
     *
     * Sem esta linha, um UPDATE em `arquivos.mime_type` bastaria para
     * transformar qualquer upload em `text/html` servido da nossa origem.
     */
    const mimeDetectado = detectarMimePorMagicBytes(conteudo);
    if (!mimeDetectado || !MIMES_PERMITIDOS.has(mimeDetectado)) {
      logger.aviso("Conteúdo em disco não corresponde a um tipo permitido", {
        arquivoId: meta.id,
        tenantId: tenant.id,
        mimeNoBanco: meta.mimeType,
        alerta: "investigar",
      });
      return naoEncontrado();
    }

    const cabecalhos = cabecalhosDeSeguranca(meta.publico, etag);
    cabecalhos.set("Content-Type", mimeDetectado);
    cabecalhos.set("Content-Length", String(conteudo.length));
    cabecalhos.set(
      "Content-Disposition",
      montarDisposition(meta.nomeOriginal, mimeDetectado),
    );

    // `conteudo` é um Buffer do Node; o BodyInit do Response aceita
    // Uint8Array — a conversão evita depender do tipo global de Buffer.
    return new NextResponse(new Uint8Array(conteudo), { status: 200, headers: cabecalhos });
  } catch (erro) {
    return tratarErro(erro, { rota: "arquivos/[id]" });
  }
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

function naoEncontrado(): NextResponse {
  return NextResponse.json(
    { erro: "Arquivo não encontrado." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Os cabeçalhos que precisam existir em TODA resposta desta rota — inclusive
 * no 304, que também é servido a partir do cache do navegador e portanto
 * precisa carregar as mesmas garantias.
 */
function cabecalhosDeSeguranca(publico: boolean, etag: string): Headers {
  const h = new Headers();

  // Manda o navegador respeitar o Content-Type declarado, em vez de farejar o
  // conteúdo. É o cabeçalho que impede um "PNG" com HTML dentro de virar
  // página executável.
  h.set("X-Content-Type-Options", "nosniff");

  // Se algo escapar de todas as barreiras anteriores e for renderizado: sem
  // origem (sandbox), sem carregar recurso nenhum (default-src 'none'), sem
  // script, sem formulário, sem navegação de topo.
  h.set("Content-Security-Policy", "default-src 'none'; sandbox");

  // Evita que a URL do arquivo vaze no Referer para um destino externo.
  h.set("Referrer-Policy", "no-referrer");

  // Não suportamos Range: entregamos o arquivo inteiro. Dizer isso
  // explicitamente evita que um cliente tente e receba resposta parcial
  // inconsistente.
  h.set("Accept-Ranges", "none");

  h.set("ETag", etag);

  /**
   * `private` nos dois casos, mesmo no arquivo público.
   *
   * "Público" aqui significa "não exige sessão", não "pode ficar guardado em
   * qualquer CDN ou proxy corporativo compartilhado". Como a resposta depende
   * do HOSTNAME (que determina a igreja) e potencialmente do cookie, deixar um
   * intermediário cachear seria arriscar servir o arquivo de uma igreja a
   * quem pediu o de outra.
   */
  h.set(
    "Cache-Control",
    publico
      ? "private, max-age=3600, must-revalidate"
      : "private, max-age=0, must-revalidate",
  );

  // A resposta muda conforme a sessão: sem isto, o cache do navegador poderia
  // reaproveitar entre usuários diferentes no mesmo dispositivo.
  h.set("Vary", "Cookie");

  return h;
}

/**
 * Compara o `If-None-Match` do cliente com o nosso ETag.
 *
 * O cabeçalho pode trazer vários valores separados por vírgula, cada um
 * possivelmente com o prefixo `W/` (validação fraca). `*` casa com qualquer
 * representação existente.
 */
function etagConfere(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;

  const normalizar = (v: string) => v.trim().replace(/^W\//, "");
  const meu = normalizar(etag);

  return ifNoneMatch
    .split(",")
    .some((candidato) => {
      const c = normalizar(candidato);
      return c === "*" || c === meu;
    });
}

/**
 * Monta o `Content-Disposition`.
 *
 * DUAS DECISÕES DE SEGURANÇA AQUI:
 *
 * 1. `inline` só para imagem; `attachment` para PDF. Imagem renderizada por um
 *    `<img>` não executa nada. Já o visualizador de PDF do navegador é um
 *    interpretador completo, com histórico de falhas próprio e suporte a
 *    JavaScript embutido — não queremos que ele abra na nossa origem.
 *
 * 2. O nome do arquivo é RECONSTRUÍDO, nunca interpolado cru. `nomeOriginal`
 *    veio do cliente; se contivesse `"` ou CRLF, quebraria o cabeçalho e
 *    permitiria injetar outros cabeçalhos na resposta (response splitting). A
 *    extensão também é regerada a partir do MIME detectado, para que um
 *    "foto.html" não chegue ao disco do usuário como .html.
 */
function montarDisposition(nomeOriginal: string, mime: string): string {
  const modo = ABRE_NA_PAGINA.has(mime) ? "inline" : "attachment";

  const extensao = MIME_PARA_EXTENSAO[mime] ?? "bin";

  const base =
    nomeOriginal
      .normalize("NFC")
      // Fora: controles (CR/LF incluídos), aspas, barras e o ponto-e-vírgula
      // que separa parâmetros do próprio cabeçalho.
      .replace(/[\u0000-\u001F\u007F"\\/;]/g, "")
      // Remove a extensão que o usuário mandou: quem manda é o MIME detectado.
      .replace(/\.[A-Za-z0-9]{1,8}$/, "")
      .trim()
      .slice(0, 80) || "arquivo";

  const nome = `${base}.${extensao}`;

  // Fallback ASCII para clientes antigos + `filename*` (RFC 5987) para
  // preservar acentos, que são a regra em nomes em português.
  const ascii = nome.replace(/[^\x20-\x7E]/g, "_");

  return `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}
