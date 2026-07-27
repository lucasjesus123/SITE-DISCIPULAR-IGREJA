import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { InstruirInstalacao } from "@/components/app/InstruirInstalacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instalar o aplicativo" };

/**
 * Como instalar o PWA na tela inicial.
 *
 * POR QUE UMA PÁGINA INTEIRA PARA ISSO
 * O ganho do PWA só aparece depois de instalado: ícone na tela inicial, abertura
 * em tela cheia e as telas visitadas disponíveis mesmo sem sinal — o que importa
 * de verdade num salão lotado com a rede móvel congestionada. E instalar não é
 * óbvio: no iPhone o caminho está escondido dentro do menu Compartilhar, e a
 * maioria das pessoas nunca precisou usá-lo.
 *
 * A página é pública e sem dado nenhum: são instruções, não configuração.
 */
export default async function AppInstalar() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const dados = await carregarDadosSite(tenant.id);
  const nome = dados.config.nomeExibicao;

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Na sua tela inicial</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Instalar o aplicativo</h1>
        <p style={{ fontSize: ".88rem", color: "var(--bone-dim)", marginTop: ".7rem", lineHeight: 1.6 }}>
          Coloque {nome} junto dos seus outros aplicativos. Abre mais rápido, ocupa quase nada de
          espaço e continua funcionando em boa parte quando a internet oscila.
        </p>
      </header>

      <section style={{ padding: "0 1.25rem 2rem" }}>
        <InstruirInstalacao />
      </section>

      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", lineHeight: 1.7 }}>
          Não é preciso baixar nada de loja de aplicativos, e nada é instalado além do atalho: o app
          é este mesmo site, guardado no seu aparelho. Para remover, é só apagar o ícone.
        </p>

        <Link href="/app" className="btn btn--block btn--ghost" style={{ marginTop: "1.6rem" }}>
          Voltar ao início
        </Link>
      </section>
    </>
  );
}
