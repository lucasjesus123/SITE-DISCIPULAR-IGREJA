import Link from "next/link";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { FormularioNovaIgreja } from "@/components/plataforma/FormularioNovaIgreja";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova igreja" };

/**
 * Cadastro de uma igreja nova.
 *
 * A autorização já foi feita no layout da plataforma (super admin + domínio
 * raiz). Repetimos aqui de propósito: se um dia alguém mover esta rota para
 * fora daquele layout, ela continua fechada. Autorização em camada única é
 * autorização que some numa refatoração.
 */
export default async function NovaIgreja() {
  await exigirPlataformaAdmin();

  return (
    <>
      <div className="painel__topo">
        <div>
          <p className="eyebrow">Provisionamento</p>
          <h1 className="painel__titulo">Nova igreja</h1>
          <p className="painel__sub">
            A igreja nasce pronta: identidade visual padrão, configuração do ao vivo, páginas base do
            site e o primeiro usuário administrador. O endereço fica em{" "}
            <strong>slug.{env.ROOT_DOMAIN}</strong> até um domínio próprio ser verificado.
          </p>
        </div>
        <Link href="/plataforma/igrejas" className="btn btn--sm btn--ghost">
          Voltar
        </Link>
      </div>

      <FormularioNovaIgreja />
    </>
  );
}
