import { exigirPermissao } from "@/lib/auth/rbac";
import { whatsappConfigurado } from "@/lib/whatsapp/uazapi";
import { ConectarWhatsapp } from "@/components/painel/ConectarWhatsapp";

export const dynamic = "force-dynamic";
export const metadata = { title: "WhatsApp" };

export default async function PaginaWhatsapp() {
  const ctx = await exigirPermissao("whatsapp.gerenciar");

  const instancia = await ctx.db.whatsappInstance.findUnique({
    where: { tenantId: ctx.tenant.id },
    select: { status: true, numero: true, perfilNome: true },
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">WhatsApp</h1>
          <p className="painel__sub">
            Conecte o número da igreja para enviar mensagens e ligar as automações.
          </p>
        </div>
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Conexão</h2>
        <p className="secao-painel__desc">
          Um número de WhatsApp por igreja. A conexão é feita lendo um QR Code, igual ao
          WhatsApp Web.
        </p>

        <ConectarWhatsapp
          inicial={{
            status: instancia?.status ?? "desconectado",
            numero: instancia?.numero ?? null,
            perfilNome: instancia?.perfilNome ?? null,
          }}
          configurado={whatsappConfigurado()}
        />
      </section>
    </>
  );
}
