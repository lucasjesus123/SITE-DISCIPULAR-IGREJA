import { exigirPermissao } from "@/lib/auth/rbac";
import { FormDisparo } from "@/components/painel/FormDisparo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disparos" };

export default async function PaginaDisparos() {
  await exigirPermissao("automacoes.gerenciar");

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Disparos de WhatsApp</h1>
          <p className="painel__sub">Envie um aviso, convite ou comunicado para os contatos da igreja.</p>
        </div>
      </div>

      <section className="secao-painel" style={{ maxWidth: 620 }}>
        <h2 className="secao-painel__titulo">Novo disparo</h2>
        <p className="secao-painel__desc">Escolha o público e escreva a mensagem. As automáticas (boas-vindas, aniversário, convite) ficam na aba Automações.</p>
        <FormDisparo />
      </section>
    </>
  );
}
