import { exigirPermissao } from "@/lib/auth/rbac";
import { carregarTogglesApp } from "@/lib/services/app-membro";
import { FormConfigApp } from "@/components/painel/FormConfigApp";

export const dynamic = "force-dynamic";
export const metadata = { title: "App de Membros" };

export default async function PaginaConfigApp() {
  const ctx = await exigirPermissao("config.gerenciar");
  const toggles = await carregarTogglesApp(ctx.db);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Configurações do App de Membros</h1>
          <p className="painel__sub">Ligue ou desligue cada recurso do app. O que estiver desligado some da navegação dos membros.</p>
        </div>
      </div>

      <section className="secao-painel" style={{ maxWidth: 620 }}>
        <h2 className="secao-painel__titulo">Recursos do app</h2>
        <p className="secao-painel__desc">Cada item vale para a igreja inteira. As mudanças entram no ar na hora.</p>
        <FormConfigApp toggles={toggles} />
      </section>
    </>
  );
}
