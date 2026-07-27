import { NextResponse } from "next/server";
import { z } from "zod";
import { auditar } from "@/lib/audit";
import { exigirPermissao } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { logger } from "@/lib/logger";
import { exigirCsrf } from "@/lib/security/csrf";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { ErroDeUpload, bytesUsadosPorTenant, salvarArquivo } from "@/lib/storage/arquivos";
import { urlArquivoPublico } from "@/lib/storage/urls";

/**
 * =============================================================================
 * POST /api/upload — recebimento de arquivo
 * =============================================================================
 *
 * ORDEM DAS DEFESAS (do mais barato para o mais caro)
 *
 *   1. Content-Length         — recusa 500 MB antes de bufferizar qualquer coisa
 *   2. exigirPermissao        — autentica, resolve o tenant pelo HOST, autoriza
 *   3. rate limit             — teto por usuário
 *   4. exigirCsrf             — a requisição partiu do nosso painel?
 *   5. cota de armazenamento  — consulta barata, antes de ler o multipart
 *   6. parse do multipart     — só agora os bytes entram na memória
 *   7. salvarArquivo          — magic bytes, sha256, nome aleatório, disco
 *   8. auditar                — quem enviou o quê
 *
 * A ordem não é estética. Cada etapa custa mais que a anterior; inverter
 * qualquer par significa gastar o recurso caro com uma requisição que seria
 * recusada de qualquer jeito — que é exatamente como um endpoint de upload
 * vira vetor de negação de serviço.
 *
 * NÃO EXISTE PARÂMETRO DE IGREJA AQUI. O tenant sai de `exigirPermissao()`,
 * que o resolve pelo hostname. Quem envia por igrejaA.com.br grava na Igreja A,
 * e não há campo no formulário capaz de mudar isso.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teto do corpo inteiro: o arquivo mais a moldura do multipart (boundaries,
 * cabeçalhos de parte, campos `_csrf` e `publico`). 64 KB de folga é generoso
 * para isso e continua muito longe de permitir um segundo arquivo escondido.
 */
const FOLGA_MULTIPART = 64 * 1024;

/** Campo do formulário que carrega o arquivo. */
const CAMPO_ARQUIVO = "arquivo";

const schemaCorpo = z.object({
  /**
   * "Público" significa servível sem sessão (logo, banner do site). O padrão é
   * restrito: se um formulário novo esquecer de mandar o campo, o arquivo
   * nasce protegido, e não exposto. Falha fechada.
   */
  publico: z
    .union([z.literal("true"), z.literal("1"), z.literal("on"), z.literal("false"), z.literal("0"), z.literal("")])
    .optional()
    .transform((v) => v === "true" || v === "1" || v === "on"),
});

export async function POST(request: Request) {
  try {
    // ---- 1. Tamanho declarado, antes de ler o stream.
    const declarado = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declarado) && declarado > env.MAX_UPLOAD_BYTES + FOLGA_MULTIPART) {
      return NextResponse.json(
        { erro: `Arquivo muito grande. O limite é ${formatarMb(env.MAX_UPLOAD_BYTES)}.` },
        { status: 413 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ erro: "Formato não suportado." }, { status: 415 });
    }

    // ---- 2. Autenticação + tenant pelo host + permissão.
    const ctx = await exigirPermissao("arquivos.enviar");

    // ---- 3. Rate limit por USUÁRIO (não por IP): uma conta comprometida não
    // escapa do teto trocando de rede, e um escritório atrás de um IP único
    // não é penalizado pelo colega.
    const limite = await verificarLimite(REGRAS.upload, ctx.sessao.userId, ctx.tenant.id);
    if (!limite.permitido) {
      return respostaLimiteExcedido(limite.tentarEmSegundos);
    }

    // ---- 4. CSRF.
    //
    // Quando o token vem no header `x-csrf-token` — que é o caminho do nosso
    // componente de upload — a validação nem toca no corpo. Só se o header
    // faltar é que `exigirCsrf` clona a requisição para procurar o campo
    // `_csrf` no multipart; nesse caso o arquivo é parseado duas vezes, o que
    // dobra o pico de memória. Vale manter o header como caminho principal.
    await exigirCsrf(request);

    // ---- 5. Cota de armazenamento da igreja.
    //
    // Duas consultas baratas antes de aceitar os bytes. Sem este teto, uma
    // única igreja no plano mais barato encheria o disco da VPS e derrubaria
    // TODAS as outras — o pior tipo de falha num sistema multi-tenant, porque
    // o dano ultrapassa a fronteira do cliente que causou.
    //
    // `Tenant` é modelo GLOBAL, por isso vai pelo `prisma` direto. Já a soma
    // dos arquivos passa pelo cliente escopado.
    const [plano, usados] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: ctx.tenant.id },
        select: { limiteStorageMb: true },
      }),
      bytesUsadosPorTenant(ctx.tenant.id),
    ]);

    const limiteBytes = (plano?.limiteStorageMb ?? 0) * 1024 * 1024;

    if (usados >= limiteBytes) {
      return NextResponse.json(
        {
          erro:
            `O armazenamento desta igreja está cheio (${formatarMb(limiteBytes)}). ` +
            `Remova arquivos antigos ou fale com o suporte para ampliar o plano.`,
        },
        { status: 413 },
      );
    }

    // ---- 6. Parse do multipart.
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      // Corpo truncado, boundary inválido, cliente que desistiu no meio.
      // Nenhum detalhe do parser vai para a resposta.
      return NextResponse.json({ erro: "Não foi possível ler o arquivo enviado." }, { status: 400 });
    }

    const enviado = form.get(CAMPO_ARQUIVO);
    if (!enviado || typeof enviado === "string") {
      return NextResponse.json({ erro: "Nenhum arquivo foi enviado." }, { status: 400 });
    }

    // O `size` do File já reflete o que chegou de fato — checar aqui evita
    // materializar o ArrayBuffer de um arquivo que já sabemos ser grande
    // demais.
    if (enviado.size > env.MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { erro: `Arquivo muito grande. O limite é ${formatarMb(env.MAX_UPLOAD_BYTES)}.` },
        { status: 413 },
      );
    }

    // Agora sim, com o tamanho real em mãos: cabe na cota?
    if (usados + enviado.size > limiteBytes) {
      return NextResponse.json(
        {
          erro:
            `Este arquivo não cabe no armazenamento disponível ` +
            `(${formatarMb(Math.max(0, limiteBytes - usados))} livres de ${formatarMb(limiteBytes)}).`,
        },
        { status: 413 },
      );
    }

    const opcoes = schemaCorpo.parse({
      publico: typeof form.get("publico") === "string" ? String(form.get("publico")) : undefined,
    });

    const buffer = Buffer.from(await enviado.arrayBuffer());

    // ---- 7. Validação de conteúdo + gravação.
    //
    // `enviado.name` e `enviado.type` são STRINGS ESCOLHIDAS PELO CLIENTE. O
    // nome só é guardado para exibição; o tipo declarado é simplesmente
    // ignorado — quem decide o MIME é o magic byte, dentro de `salvarArquivo`.
    const arquivo = await salvarArquivo({
      tenantId: ctx.tenant.id,
      nomeOriginal: typeof enviado.name === "string" ? enviado.name : "arquivo",
      buffer,
      publico: opcoes.publico,
      enviadoPorId: ctx.sessao.userId,
    });

    // ---- 8. Auditoria.
    await auditar(ctx, {
      acao: "arquivo.enviar",
      alvoTipo: "Arquivo",
      alvoId: arquivo.id,
      detalhes: {
        mimeType: arquivo.mimeType,
        tamanhoBytes: arquivo.tamanhoBytes,
        publico: arquivo.publico,
        deduplicado: arquivo.deduplicado,
      },
    });

    logger.info("Upload recebido", {
      tenantId: ctx.tenant.id,
      arquivoId: arquivo.id,
      mimeType: arquivo.mimeType,
      tamanhoBytes: arquivo.tamanhoBytes,
      // Sem o nome do arquivo: nome de arquivo é conteúdo enviado pelo
      // usuário e frequentemente contém nome de pessoa.
    });

    return NextResponse.json(
      {
        id: arquivo.id,
        url: urlArquivoPublico(arquivo.id),
        nome: arquivo.nomeOriginal,
        mimeType: arquivo.mimeType,
        tamanhoBytes: arquivo.tamanhoBytes,
        largura: arquivo.largura,
        altura: arquivo.altura,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    // Erros de validação de upload já vêm com status e com mensagem escrita
    // para o usuário final. Os demais caem no tratamento padrão, que nunca
    // devolve stack trace nem erro do Prisma.
    if (erro instanceof ErroDeUpload) {
      return NextResponse.json({ erro: erro.message }, { status: erro.status });
    }
    return tratarErro(erro, { rota: "upload" });
  }
}

function formatarMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1).replace(".", ",")} MB`;
}
