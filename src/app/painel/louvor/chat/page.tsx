import { exigirPermissao } from "@/lib/auth/rbac";
import { garantirMinisterioLouvor } from "@/lib/services/louvor";
import { SubnavLouvor } from "@/components/painel/louvor/SubnavLouvor";
import { ChatLouvor } from "@/components/painel/louvor/ChatLouvor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Louvor · Conversa" };

export default async function PaginaChatLouvor() {
  const ctx = await exigirPermissao("louvor.gerenciar");
  const ministerioId = await garantirMinisterioLouvor(ctx.db, ctx.tenant.id);

  // As últimas 100 mensagens, em ordem cronológica.
  const recentes = await ctx.db.chatMinisterio.findMany({
    where: { ministerioId, eventoId: null },
    orderBy: { criadoEm: "desc" },
    take: 100,
    select: { id: true, autorNome: true, texto: true, fixada: true, criadoEm: true },
  });
  const mensagens = recentes
    .reverse()
    .map((m) => ({ ...m, criadoEm: m.criadoEm.toISOString() }));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Conversa do Louvor</h1>
          <p className="painel__sub">Canal da equipe: avisos, combinações e o que precisar para o próximo culto.</p>
        </div>
      </div>

      <SubnavLouvor />

      <section className="secao-painel">
        <ChatLouvor mensagens={mensagens} nomeUsuario={ctx.sessao.nome} />
      </section>
    </>
  );
}
