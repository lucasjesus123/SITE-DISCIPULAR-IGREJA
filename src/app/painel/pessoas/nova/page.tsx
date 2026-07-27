import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioPessoa } from "@/components/painel/FormularioPessoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cadastrar pessoa" };

/**
 * Cadastro manual de pessoa.
 *
 * A permissão é conferida AQUI, na renderização do servidor, e de novo dentro
 * da Server Action. Parece redundante e não é: esta checagem impede que a tela
 * apareça; a da action impede que a escrita aconteça. Quem tenta a segunda sem
 * passar pela primeira (chamando a action direto) é barrado do mesmo jeito.
 */
export default async function NovaPessoa() {
  const ctx = await exigirPermissao("pessoas.criar");

  // Listas auxiliares dos seletores. Vêm do `ctx.db`, então só existem as
  // células e campi desta igreja — não há como o seletor oferecer o registro
  // de outra.
  const [celulas, campi] = await Promise.all([
    ctx.db.celula.findMany({
      where: { ativa: true },
      select: { id: true, nome: true, bairro: true },
      orderBy: { nome: "asc" },
      take: 200,
    }),
    ctx.db.campus.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: [{ ordem: "asc" }, { nome: "asc" }],
      take: 50,
    }),
  ]);

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/pessoas" className="link" style={{ fontSize: ".72rem" }}>
              ← Pessoas
            </Link>
          </p>
          <h1 className="painel__titulo">Cadastrar pessoa</h1>
          <p className="painel__sub">
            Use esta tela para quem chegou pela porta da igreja. Quem chegou pelo site já está na
            caixa de entrada — cadastre por lá para não duplicar.
          </p>
        </div>
      </div>

      <FormularioPessoa
        modo="criar"
        celulas={celulas}
        campi={campi}
        podeEditarSensivel={ctx.pode("pessoas.lerSensivel")}
      />
    </>
  );
}
