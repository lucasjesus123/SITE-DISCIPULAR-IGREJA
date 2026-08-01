import { NextResponse } from "next/server";
import { z } from "zod";
import { contextoDeRequest } from "@/lib/http/contexto";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { exigirCsrf } from "@/lib/security/csrf";
import { resolverTenantPorHost } from "@/lib/tenant/resolve";
import { tenantDb } from "@/lib/db/tenant-client";

/**
 * POST /api/publico/inscricao/<slug>
 *
 * Inscrição pública em 1 toque. Mesmas defesas dos demais formulários públicos:
 * tenant pelo HOST (nunca por parâmetro), rate limit por IP isolado por igreja,
 * CSRF, e só então grava. A inscrição precisa existir, pertencer à igreja do
 * host e estar ATIVA.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TAMANHO_MAXIMO = 32 * 1024;

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(160),
  telefone: z.string().trim().max(20).optional(),
  email: z.string().trim().email("E-mail inválido.").max(254).optional().or(z.literal("")),
  observacao: z.string().trim().max(500).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const tamanho = Number(request.headers.get("content-length") ?? "0");
    if (tamanho > TAMANHO_MAXIMO) return NextResponse.json({ erro: "Requisição muito grande." }, { status: 413 });

    const { slug } = await params;
    const ctx = contextoDeRequest(request);

    const tenant = await resolverTenantPorHost(ctx.host);
    if (!tenant) return NextResponse.json({ erro: "Igreja não encontrada." }, { status: 404 });

    const limite = await verificarLimite(REGRAS.submissaoPublica, ctx.ipHash, tenant.id);
    if (!limite.permitido) return respostaLimiteExcedido(limite.tentarEmSegundos);

    await exigirCsrf(request);

    const texto = await request.text();
    if (texto.length > TAMANHO_MAXIMO) return NextResponse.json({ erro: "Requisição muito grande." }, { status: 413 });
    let corpo: unknown;
    try {
      corpo = JSON.parse(texto);
    } catch {
      return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
    }
    const dados = schema.parse(corpo);

    const db = tenantDb(tenant.id);
    const inscricao = await db.inscricao.findFirst({
      where: { slug, ativa: true },
      select: { id: true, encerraEm: true },
    });
    if (!inscricao) return NextResponse.json({ erro: "Inscrição encerrada ou inexistente." }, { status: 404 });
    if (inscricao.encerraEm && inscricao.encerraEm.getTime() < Date.now()) {
      return NextResponse.json({ erro: "As inscrições foram encerradas." }, { status: 410 });
    }

    await db.inscricaoResposta.create({
      data: {
        tenantId: tenant.id,
        inscricaoId: inscricao.id,
        nome: dados.nome,
        telefone: dados.telefone || null,
        email: dados.email || null,
        observacao: dados.observacao || null,
        ip: ctx.ipHash,
      },
    });

    return NextResponse.json(
      { ok: true, mensagem: "Inscrição confirmada! Em breve entraremos em contato." },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "publico/inscricao" });
  }
}
