import { exigirPermissao } from "@/lib/auth/rbac";
import { EditorTemplate } from "@/components/painel/EditorTemplate";
import { criarTemplatesPadrao } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Automações" };

export default async function PaginaAutomacoes() {
  const ctx = await exigirPermissao("automacoes.gerenciar");

  const templates = await ctx.db.mensagemTemplate.findMany({
    orderBy: { criadoEm: "asc" },
    select: { id: true, titulo: true, corpo: true, ativo: true },
  });

  const whatsappOk = await ctx.db.whatsappInstance.findUnique({
    where: { tenantId: ctx.tenant.id },
    select: { status: true },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Automações</h1>
          <p className="painel__sub">
            Mensagens que o sistema envia sozinho. Você edita o texto — 100% no seu jeito.
          </p>
        </div>
      </div>

      {whatsappOk?.status !== "conectado" && (
        <div className="alerta alerta--erro" role="status" style={{ marginBottom: "1.5rem" }}>
          O envio automático só acontece com o <strong>WhatsApp conectado</strong> (menu WhatsApp). Você já
          pode deixar as mensagens prontas aqui — elas começam a sair assim que o número for conectado.
        </div>
      )}

      {templates.length === 0 ? (
        <section className="secao-painel">
          <h2 className="secao-painel__titulo">Comece pelas mensagens padrão</h2>
          <p className="secao-painel__desc">
            Criamos os textos de boas-vindas, aniversário e convite de retorno — depois você edita como quiser.
          </p>
          <form action={criarTemplatesPadrao}>
            <button type="submit" className="btn">Criar mensagens padrão</button>
          </form>
        </section>
      ) : (
        <div className="stack" style={{ "--flow": "1.5rem" } as React.CSSProperties}>
          {templates.map((t) => (
            <EditorTemplate key={t.id} id={t.id} titulo={t.titulo} corpo={t.corpo} ativo={t.ativo} />
          ))}
        </div>
      )}
    </>
  );
}
