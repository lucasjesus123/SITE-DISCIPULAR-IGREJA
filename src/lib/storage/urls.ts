/**
 * URLs de arquivos.
 *
 * DECISÃO CENTRAL: nenhum upload é servido por caminho estático.
 *
 * O caminho ingênuo seria gravar em `public/uploads/<arquivo>` e referenciar
 * direto. Isso cria três problemas de uma vez:
 *
 *   1. Qualquer pessoa com a URL acessa o arquivo — inclusive documentos de
 *      outra igreja, se conseguir adivinhar ou vazar o nome.
 *   2. Um arquivo `.html` ou `.svg` enviado por um usuário e servido da nossa
 *      origem executa JavaScript com os cookies do nosso domínio. É XSS
 *      armazenado com escopo total.
 *   3. Não há como revogar acesso nem auditar quem baixou o quê.
 *
 * Por isso tudo passa por /api/arquivos/[id], que confere o tenant, confere a
 * permissão e força `Content-Disposition` e `Content-Type` seguros.
 */

/** URL de arquivo marcado como público (logo, foto do site). */
export function urlArquivoPublico(arquivoId: string): string {
  // Valida o formato antes de compor a URL: um id malformado não deve
  // virar path.
  if (!/^c[a-z0-9]{20,30}$/.test(arquivoId)) return "";
  return `/api/arquivos/${arquivoId}`;
}

/** URL de arquivo restrito. Mesma rota — a diferença é a checagem no servidor. */
export function urlArquivoPrivado(arquivoId: string): string {
  return urlArquivoPublico(arquivoId);
}

/**
 * Extensão canônica a partir do MIME detectado por magic bytes.
 * Nunca usamos a extensão do nome enviado pelo usuário.
 */
export const MIME_PARA_EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

/**
 * Tipos aceitos em upload.
 *
 * SVG está FORA de propósito, mesmo sendo imagem: um `.svg` pode conter
 * `<script>` e é executado pelo navegador quando servido como
 * `image/svg+xml`. Aceitar SVG de usuário é aceitar XSS armazenado. Se um
 * cliente precisar de logo vetorial, a conversão para PNG é feita por nós.
 */
export const MIMES_PERMITIDOS = new Set(Object.keys(MIME_PARA_EXTENSAO));
