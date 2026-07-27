import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioMensagem } from "@/components/painel/FormularioMensagem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova mensagem" };

/**
 * Cadastro de uma mensagem nova.
 *
 * A permissão é conferida AQUI e de novo dentro da Server Action. Não é
 * redundância: esta checagem impede que a tela apareça, a da action impede que
 * a escrita aconteça. Quem chamar a action direto, sem passar pela tela, é
 * barrado do mesmo jeito.
 */
export default async function NovaMensagem() {
  await exigirPermissao("mensagens.gerenciar");

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/mensagens" className="link" style={{ fontSize: ".72rem" }}>
              ← Mensagens
            </Link>
          </p>
          <h1 className="painel__titulo">Nova mensagem</h1>
          <p className="painel__sub">
            O endereço público é gerado a partir do título. Ele pode ser ajustado depois de criada,
            na própria mensagem.
          </p>
        </div>
      </div>

      <FormularioMensagem modo="criar" />
    </>
  );
}
