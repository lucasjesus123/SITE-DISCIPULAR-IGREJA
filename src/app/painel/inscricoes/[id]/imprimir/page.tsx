import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";

/**
 * Versão imprimível da lista de inscritos. O usuário abre e usa Ctrl+P →
 * "Salvar como PDF" — assim geramos o PDF sem dependência pesada no servidor.
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de inscritos", robots: { index: false } };

const FMT = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function ImprimirInscritos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await exigirPermissao("inscricoes.gerenciar");

  const insc = await ctx.db.inscricao.findFirst({ where: { id }, select: { titulo: true } });
  if (!insc) notFound();

  const respostas = await ctx.db.inscricaoResposta.findMany({
    where: { inscricaoId: id },
    orderBy: { criadoEm: "asc" },
    select: { nome: true, telefone: true, email: true, criadoEm: true },
  });

  return (
    <main style={{ padding: "2rem", maxWidth: 800, margin: "0 auto", color: "#111", background: "#fff", fontFamily: "system-ui, sans-serif" }}>
      <style>{`@media print { .no-print { display: none !important; } } @page { margin: 1.5cm; }`}</style>

      <p className="no-print" style={{ marginBottom: "1.5rem", color: "#555" }}>
        Use <strong>Ctrl+P</strong> (ou Cmd+P) e escolha <strong>“Salvar como PDF”</strong>.
      </p>

      <h1 style={{ fontSize: "1.6rem", marginBottom: ".3rem" }}>{insc.titulo}</h1>
      <p style={{ color: "#555", marginBottom: "1.5rem" }}>
        Lista de inscritos · {respostas.length} pessoa{respostas.length === 1 ? "" : "s"} · gerada em {FMT.format(new Date())}
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".9rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #111", textAlign: "left" }}>
            <th style={{ padding: "6px 8px" }}>#</th>
            <th style={{ padding: "6px 8px" }}>Nome</th>
            <th style={{ padding: "6px 8px" }}>Telefone</th>
            <th style={{ padding: "6px 8px" }}>E-mail</th>
            <th style={{ padding: "6px 8px" }}>Inscrito em</th>
          </tr>
        </thead>
        <tbody>
          {respostas.map((r, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #ddd" }}>
              <td style={{ padding: "6px 8px" }}>{i + 1}</td>
              <td style={{ padding: "6px 8px" }}>{r.nome}</td>
              <td style={{ padding: "6px 8px" }}>{r.telefone ?? "—"}</td>
              <td style={{ padding: "6px 8px" }}>{r.email ?? "—"}</td>
              <td style={{ padding: "6px 8px" }}>{FMT.format(r.criadoEm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
