import Link from "next/link";
import { exigirPermissao } from "@/lib/auth/rbac";
import { FormularioCelula } from "@/components/painel/FormularioCelula";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova célula" };

/**
 * Criação de célula.
 *
 * Exige `celulas.gerenciar` — que o líder de célula NÃO tem. Ele relata os
 * encontros da própria célula; abrir célula nova é decisão de quem enxerga a
 * igreja inteira.
 */
export default async function NovaCelula() {
  const ctx = await exigirPermissao("celulas.gerenciar");

  const campi = await ctx.db.campus.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    take: 50,
  });

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/celulas" className="link" style={{ fontSize: ".72rem" }}>
              ← Células
            </Link>
          </p>
          <h1 className="painel__titulo">Nova célula</h1>
          <p className="painel__sub">
            Depois de criar, atribua o líder na tela de usuários para que ele passe a enxergar apenas
            esta célula no painel.
          </p>
        </div>
      </div>

      <FormularioCelula modo="criar" campi={campi} />
    </>
  );
}
