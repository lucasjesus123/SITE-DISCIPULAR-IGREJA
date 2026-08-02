import Link from "next/link";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";
import { CopiarPix } from "@/components/app/CopiarPix";
import { ContribuirPix } from "@/components/app/ContribuirPix";
import { asaasDisponivel } from "@/lib/pagamentos/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contribuir" };

/**
 * Contribuição por PIX.
 *
 * TELA PÚBLICA. Ofertar não exige cadastro — e transformar a contribuição em
 * área logada só criaria atrito num momento em que a pessoa já decidiu dar.
 *
 * O QUE ESTA TELA MOSTRA E O QUE ELA NÃO MOSTRA
 * Mostra a chave PIX, o titular e o texto que a própria igreja escreveu no
 * painel (`pixDescricao`). NÃO mostra dados bancários: eles existem no schema
 * em `dadosBancariosCriptografados`, cifrados em repouso justamente porque
 * agência e conta são o alvo clássico da fraude de transferência. Decifrá-los
 * para uma página pública anularia a razão de terem sido cifrados.
 *
 * Também não há campo de valor, nem integração de pagamento, nem coleta de
 * nada: a página não recebe uma informação sequer do visitante. Uma tela que
 * não coleta dado não pode vazar dado.
 */
export default async function AppContribuir() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const dados = await carregarDadosSite(tenant.id);
  const { config } = dados;

  const chave = config.pixChave?.trim() ?? "";
  const pixAutomatico = await asaasDisponivel(tenant.id);

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Generosidade</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Contribuir</h1>
        <p style={{ fontSize: ".88rem", color: "var(--bone-dim)", marginTop: ".7rem", lineHeight: 1.6 }}>
          Sua contribuição sustenta o trabalho da igreja: as contas da casa, os projetos sociais e
          quem é cuidado por aqui todos os dias.
        </p>
      </header>

      {/* Fluxo automático (ASAAS): escolhe tipo/valor e paga no app, com recibo
          e lançamento no Financeiro. Quando não configurado, cai na chave PIX. */}
      {pixAutomatico && (
        <section style={{ padding: "0 1.25rem 1.75rem" }}>
          <ContribuirPix />
        </section>
      )}

      {pixAutomatico ? null : chave.length === 0 ? (
        <section style={{ padding: "0 1.25rem 2.5rem" }}>
          <div
            style={{
              padding: "1.5rem",
              background: "var(--ink-700)",
              border: "1px solid var(--line-on-dark)",
              borderRadius: "var(--radius-lg)",
              color: "var(--bone-dim)",
              fontSize: ".9rem",
              lineHeight: 1.6,
            }}
          >
            A chave PIX ainda não foi cadastrada. Fale com a secretaria da igreja para saber como
            contribuir.
          </div>
        </section>
      ) : (
        <>
          <section style={{ padding: "0 1.25rem 1.75rem" }}>
            <CopiarPix chave={chave} titular={config.pixTitular} />
          </section>

          <section style={{ padding: "0 1.25rem 2rem" }}>
            <p className="eyebrow" style={{ marginBottom: "1rem" }}>
              Como contribuir
            </p>

            <ol style={{ display: "grid", gap: ".8rem", listStyle: "none", padding: 0, margin: 0 }}>
              <Passo numero={1}>Toque em “Copiar chave” aqui em cima.</Passo>
              <Passo numero={2}>Abra o aplicativo do seu banco e escolha PIX.</Passo>
              <Passo numero={3}>Selecione “Pix copia e cola” ou “Transferir com chave” e cole.</Passo>
              <Passo numero={4}>
                Confira se o nome que aparece é o da igreja antes de confirmar. Essa conferência é
                sua última proteção contra chave trocada.
              </Passo>
            </ol>
          </section>
        </>
      )}

      {config.pixDescricao && (
        <section style={{ padding: "0 1.25rem 2rem" }}>
          <div
            style={{
              padding: "1.2rem",
              border: "1px solid var(--gold-line)",
              borderRadius: "var(--radius-lg)",
              background: "rgb(var(--gold-rgb) / .06)",
            }}
          >
            {/*
              Texto escrito pela igreja no painel. Renderizado como TEXTO, com
              as quebras de linha preservadas por CSS. Nada de
              `dangerouslySetInnerHTML`: o conteúdo é digitado por um usuário e
              esta página é servida no domínio da igreja, com os cookies dela.
            */}
            <p
              style={{
                color: "var(--bone-dim)",
                fontSize: ".9rem",
                lineHeight: 1.7,
                whiteSpace: "pre-wrap",
              }}
            >
              {config.pixDescricao}
            </p>
          </div>
        </section>
      )}

      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", lineHeight: 1.7 }}>
          A igreja nunca vai pedir sua contribuição por mensagem privada, nem enviar outra chave por
          WhatsApp. Se receber algo assim, confirme com a secretaria antes de transferir.
        </p>

        {config.whatsapp && (
          <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", marginTop: ".8rem" }}>
            Em caso de dúvida, fale com a gente pelo telefone da secretaria.
          </p>
        )}

        <Link href="/app" className="btn btn--block btn--ghost" style={{ marginTop: "1.6rem" }}>
          Voltar ao início
        </Link>
      </section>
    </>
  );
}

function Passo({ numero, children }: { numero: number; children: React.ReactNode }) {
  return (
    <li
      style={{
        display: "flex",
        gap: ".9rem",
        padding: ".9rem 1rem",
        background: "var(--ink-700)",
        border: "1px solid var(--line-on-dark)",
        borderRadius: "var(--radius-lg)",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.1rem",
          color: "var(--gold)",
          lineHeight: 1.4,
          minWidth: "1.2rem",
        }}
      >
        {numero}
      </span>
      <span style={{ fontSize: ".9rem", color: "var(--bone-dim)", lineHeight: 1.6 }}>{children}</span>
    </li>
  );
}
