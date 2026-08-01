import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { tenantDb } from "@/lib/db/tenant-client";
import { FormularioInscricaoPublica } from "@/components/site/FormularioInscricaoPublica";

export const dynamic = "force-dynamic";

async function carregar(slug: string) {
  const tenant = await tenantDaRequisicao();
  if (!tenant) return null;
  const insc = await tenantDb(tenant.id).inscricao.findFirst({
    where: { slug },
    select: { titulo: true, descricao: true, slug: true, ativa: true, encerraEm: true, pedirTelefone: true, pedirEmail: true },
  });
  return insc;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const insc = await carregar(slug);
  return { title: insc ? insc.titulo : "Inscrição", robots: { index: false } };
}

export default async function PaginaInscricaoPublica({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const insc = await carregar(slug);
  if (!insc) notFound();

  const encerrada = !insc.ativa || (insc.encerraEm != null && insc.encerraEm.getTime() < Date.now());

  return (
    <section className="section theme-light">
      <div className="container" style={{ maxWidth: 620 }}>
        <p className="eyebrow">Inscrição</p>
        <h1 style={{ marginTop: "0.8rem" }}>{insc.titulo}</h1>
        {insc.descricao && (
          <p className="lead" style={{ marginTop: "1rem", whiteSpace: "pre-line" }}>{insc.descricao}</p>
        )}

        <div style={{ marginTop: "2rem" }}>
          {encerrada ? (
            <div className="alerta alerta--erro" role="status" style={{ fontSize: "1rem" }}>
              As inscrições para este evento estão encerradas.
            </div>
          ) : (
            <FormularioInscricaoPublica slug={insc.slug} pedirTelefone={insc.pedirTelefone} pedirEmail={insc.pedirEmail} />
          )}
        </div>
      </div>
    </section>
  );
}
