import { exigirPermissao } from "@/lib/auth/rbac";
import { tratarErro } from "@/lib/http/erros";
import { campoCsv, gerarSlug } from "@/lib/inscricoes/slug";

/**
 * GET /painel/inscricoes/<id>/lista — baixa a lista de inscritos em CSV.
 * Autorizado (inscricoes.gerenciar) e escopado ao tenant do host.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await exigirPermissao("inscricoes.gerenciar");

    const insc = await ctx.db.inscricao.findFirst({ where: { id }, select: { titulo: true } });
    if (!insc) return new Response("Não encontrado", { status: 404 });

    const respostas = await ctx.db.inscricaoResposta.findMany({
      where: { inscricaoId: id },
      orderBy: { criadoEm: "asc" },
      select: { nome: true, telefone: true, email: true, observacao: true, criadoEm: true },
    });

    const linhas = [
      ["Nome", "Telefone", "E-mail", "Observação", "Inscrito em"].join(";"),
      ...respostas.map((r) =>
        [campoCsv(r.nome), campoCsv(r.telefone), campoCsv(r.email), campoCsv(r.observacao), campoCsv(FMT.format(r.criadoEm))].join(";"),
      ),
    ];
    // BOM para o Excel abrir os acentos corretamente.
    const csv = "﻿" + linhas.join("\r\n");
    const arquivo = `inscritos-${gerarSlug(insc.titulo)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${arquivo}"`,
        "cache-control": "no-store",
      },
    });
  } catch (erro) {
    return tratarErro(erro, { rota: "inscricoes/lista" });
  }
}
