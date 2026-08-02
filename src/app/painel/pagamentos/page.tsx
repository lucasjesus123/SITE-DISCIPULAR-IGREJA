import { exigirPermissao } from "@/lib/auth/rbac";
import { statusPagamento } from "@/lib/pagamentos/config";
import { FormConfigPagamento } from "@/components/painel/FormConfigPagamento";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pagamentos" };

export default async function PaginaPagamentos() {
  const ctx = await exigirPermissao("config.gerenciar");
  const status = await statusPagamento(ctx.db);

  const base = ctx.tenant.hostCanonico ? `https://${ctx.tenant.hostCanonico}` : "";
  const webhookUrl = `${base}/api/webhooks/asaas`;

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Pagamentos (PIX)</h1>
          <p className="painel__sub">Conecte o ASAAS para receber dízimos e ofertas pelo app — cada contribuição vira uma entrada no Financeiro.</p>
        </div>
      </div>

      <section className="secao-painel" style={{ maxWidth: 640 }}>
        <h2 className="secao-painel__titulo">Gateway de pagamento</h2>
        <p className="secao-painel__desc">As credenciais ficam só aqui no servidor, criptografadas. Você pode testar no ambiente Sandbox antes de ativar em Produção.</p>
        <FormConfigPagamento status={status} webhookUrl={webhookUrl} />
      </section>
    </>
  );
}
