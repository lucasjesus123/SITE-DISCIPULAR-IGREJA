import { NextResponse } from "next/server";
import { contextoDeRequest } from "@/lib/http/contexto";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { exigirCsrf } from "@/lib/security/csrf";
import { resolverTenantPorHost } from "@/lib/tenant/resolve";
import { receberSubmissao, tenantAceitaSubmissoes } from "@/lib/services/submissoes";
import { ehTipoValido } from "@/lib/validation/submissoes";
import { logger } from "@/lib/logger";

/**
 * Endpoint único dos formulários públicos.
 *
 *   POST /api/publico/formularios/visitante
 *   POST /api/publico/formularios/pedido-oracao
 *   POST /api/publico/formularios/batismo   ... etc.
 *
 * Recebe tanto do SITE quanto do APP — o mesmo contrato, a mesma validação,
 * as mesmas defesas. Duplicar essa lógica em dois endpoints seria garantir
 * que um dos dois ficaria para trás numa correção futura.
 *
 * ORDEM DAS DEFESAS (importa)
 *   1. Tamanho do corpo      — antes de qualquer parse
 *   2. Tipo de formulário    — allowlist
 *   3. Tenant pelo HOSTNAME  — nunca por parâmetro
 *   4. Tenant operacional
 *   5. Rate limit por IP     — antes do trabalho caro
 *   6. CSRF
 *   7. Parse + validação Zod
 *   8. Persistência
 *
 * Cada etapa é mais cara que a anterior. Barato primeiro é o que impede que
 * uma enxurrada de lixo consuma CPU e conexões de banco.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 64 KB. Nenhum formulário legítimo chega perto disso. */
const TAMANHO_MAXIMO = 64 * 1024;

/** URL amigável -> tipo interno. Allowlist: qualquer outro valor é 404. */
const MAPA_TIPOS = {
  visitante: "VISITANTE",
  "novo-membro": "NOVO_MEMBRO",
  batismo: "BATISMO",
  "pedido-oracao": "PEDIDO_ORACAO",
  contato: "CONTATO",
  "inscricao-curso": "INSCRICAO_CURSO",
  "quero-celula": "QUERO_CELULA",
} as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tipo: string }> },
) {
  try {
    // ---- 1. Tamanho do corpo
    // Checado pelo header ANTES de ler o stream: um corpo de 500 MB não deve
    // nem ser bufferizado para depois ser rejeitado.
    const tamanho = Number(request.headers.get("content-length") ?? "0");
    if (tamanho > TAMANHO_MAXIMO) {
      return NextResponse.json({ erro: "Requisição muito grande." }, { status: 413 });
    }

    // ---- 2. Tipo do formulário
    const { tipo: tipoUrl } = await params;
    const tipoInterno = MAPA_TIPOS[tipoUrl as keyof typeof MAPA_TIPOS];
    if (!tipoInterno || !ehTipoValido(tipoInterno)) {
      return NextResponse.json({ erro: "Formulário não encontrado." }, { status: 404 });
    }

    const ctx = contextoDeRequest(request);

    // ---- 3. Tenant pelo HOSTNAME
    //
    // Repare que NÃO existe parâmetro de tenant nesta rota. Não é omissão:
    // é o desenho. Um visitante em igrejaA.com.br só consegue criar
    // submissão para a Igreja A, porque o host dele é o da Igreja A.
    const tenant = await resolverTenantPorHost(ctx.host);
    if (!tenant) {
      return NextResponse.json({ erro: "Igreja não encontrada." }, { status: 404 });
    }

    // ---- 4. Tenant operacional
    if (!(await tenantAceitaSubmissoes(tenant.id))) {
      return NextResponse.json(
        { erro: "Este site está temporariamente indisponível." },
        { status: 503 },
      );
    }

    // ---- 5. Rate limit por IP, isolado por igreja
    //
    // O `tenant.id` na chave é intencional: um ataque contra a Igreja A não
    // pode bloquear os visitantes da Igreja B que estejam atrás do mesmo IP
    // (rede de escola, operadora móvel com CGNAT).
    const regra = tipoInterno === "PEDIDO_ORACAO" ? REGRAS.pedidoOracao : REGRAS.submissaoPublica;
    const limite = await verificarLimite(regra, ctx.ipHash, tenant.id);
    if (!limite.permitido) {
      return respostaLimiteExcedido(limite.tentarEmSegundos);
    }

    // ---- 6. CSRF
    await exigirCsrf(request);

    // ---- 7. Parse
    let corpo: unknown;
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const texto = await request.text();
      if (texto.length > TAMANHO_MAXIMO) {
        return NextResponse.json({ erro: "Requisição muito grande." }, { status: 413 });
      }
      try {
        corpo = JSON.parse(texto);
      } catch {
        return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
      }
    } else if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const form = await request.formData();
      corpo = formDataParaObjeto(form);
    } else {
      return NextResponse.json({ erro: "Formato não suportado." }, { status: 415 });
    }

    // Um objeto vazio ou um array no lugar de objeto não deve chegar ao Zod
    // como surpresa.
    if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
      return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
    }

    // ---- 8. Validação + persistência
    const resultado = await receberSubmissao(tipoInterno, corpo, {
      tenantId: tenant.id,
      origem: detectarOrigem(request),
      ipHash: ctx.ipHash,
      userAgent: ctx.userAgent,
      paginaOrigem: request.headers.get("referer")?.slice(0, 200),
    });

    logger.info("Submissão pública recebida", {
      tipo: tipoInterno,
      tenantId: tenant.id,
      submissaoId: resultado.id,
      // Sem nome, e-mail ou telefone no log — são dados pessoais.
    });

    return NextResponse.json(
      { ok: true, mensagem: resultado.mensagem },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "publico/formularios" });
  }
}

/**
 * Converte FormData em objeto, agrupando campos repetidos em array.
 *
 * Campos `File` são DESCARTADOS: esta rota não aceita upload. Um arquivo
 * enviado aqui seria ignorado, nunca gravado — upload tem rota própria, com
 * validação de magic bytes e limite de tamanho.
 */
function formDataParaObjeto(form: FormData): Record<string, unknown> {
  const objeto: Record<string, unknown> = {};

  for (const [chave, valor] of form.entries()) {
    if (typeof valor !== "string") continue;

    // Protege contra poluição de protótipo: `__proto__=x` no corpo do
    // formulário poderia alterar o protótipo de Object no processo inteiro.
    if (chave === "__proto__" || chave === "constructor" || chave === "prototype") continue;

    // Teto de campos: um formulário com 10.000 campos é ataque, não uso.
    if (Object.keys(objeto).length > 100) break;

    const limpo = chave.endsWith("[]") ? chave.slice(0, -2) : chave;

    if (limpo in objeto) {
      const atual = objeto[limpo];
      objeto[limpo] = Array.isArray(atual) ? [...atual, valor] : [atual, valor];
    } else {
      objeto[limpo] = chave.endsWith("[]") ? [valor] : valor;
    }
  }

  return objeto;
}

/** Distingue submissão vinda do PWA da vinda do site. */
function detectarOrigem(request: Request): "SITE" | "APP" {
  const referer = request.headers.get("referer") ?? "";
  const cabecalho = request.headers.get("x-discipular-cliente") ?? "";
  if (cabecalho === "app" || referer.includes("/app")) return "APP";
  return "SITE";
}
