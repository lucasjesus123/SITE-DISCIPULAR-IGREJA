import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { carregarDadosSite } from "@/lib/services/site";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Como tratamos os seus dados pessoais.",
};

export const dynamic = "force-dynamic";

/**
 * Política de privacidade — obrigatória sob a LGPD para qualquer site que
 * colete dado pessoal, e este coleta bastante: nome, telefone, endereço,
 * data de nascimento e, nos pedidos de oração, dado sensível de saúde e vida
 * familiar.
 *
 * A igreja é a CONTROLADORA desses dados. A plataforma é OPERADORA. Este
 * texto explicita a divisão, porque ela define quem responde por quê.
 */
export default async function PaginaPrivacidade() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const { config } = await carregarDadosSite(tenant.id);
  const nome = config.nomeExibicao;

  return (
    <>
      <section className="section theme-dark">
        <div className="container container--narrow">
          <p className="eyebrow">Privacidade</p>
          <h1 style={{ marginTop: "1.2rem" }}>Como cuidamos dos seus dados.</h1>
          <p className="lead" style={{ marginTop: "1.4rem" }}>
            Última atualização: {new Date().toLocaleDateString("pt-BR")}
          </p>
        </div>
      </section>

      <section className="section theme-light">
        <div className="container container--narrow measure dim" style={{ display: "grid", gap: "2.5rem" }}>
          <Secao titulo="Quem é responsável">
            <p>
              A <strong>{nome}</strong> é a controladora dos seus dados pessoais: é ela quem decide
              por que e como eles são usados. A plataforma que hospeda este site atua como
              operadora, tratando os dados apenas conforme as instruções da igreja.
            </p>
          </Secao>

          <Secao titulo="Que dados coletamos">
            <ul style={{ display: "grid", gap: ".6rem", paddingLeft: "1.2rem" }}>
              <li>
                <strong>Cadastro:</strong> nome, telefone, e-mail, data de nascimento, endereço e
                estado civil, quando você preenche nossos formulários.
              </li>
              <li>
                <strong>Vida de igreja:</strong> célula que frequenta, cursos, batismo e histórico
                de contato pastoral.
              </li>
              <li>
                <strong>Pedidos de oração:</strong> o conteúdo que você escreve. Pode incluir
                informação sobre saúde e vida familiar — por isso o tratamento é restrito.
              </li>
              <li>
                <strong>Técnicos:</strong> guardamos uma versão embaralhada (hash) do seu endereço
                IP, para conseguirmos identificar abuso sem armazenar o IP em si.
              </li>
            </ul>
          </Secao>

          <Secao titulo="Por que usamos">
            <p>
              Para responder ao que você pediu, acompanhar você pastoralmente, organizar cultos,
              células e cursos, e cumprir obrigações legais. Não vendemos, alugamos nem cedemos
              seus dados para terceiros com finalidade comercial.
            </p>
          </Secao>

          <Secao titulo="Quem tem acesso">
            <p>
              Apenas a equipe da igreja, e cada pessoa vê somente o necessário para a sua função.
              Observações pastorais e o conteúdo dos pedidos de oração ficam restritos à liderança
              pastoral. Todo acesso a dado sensível fica registrado em trilha de auditoria.
            </p>
          </Secao>

          <Secao titulo="Pedidos de oração">
            <p>
              Por padrão, seu pedido é visto <strong>somente pela equipe pastoral</strong>. Ele só
              aparece no aplicativo dos membros ou no site se você escolher isso explicitamente no
              formulário. Você também pode enviar de forma anônima — nesse caso não registramos seu
              nome nem seu contato.
            </p>
          </Secao>

          <Secao titulo="Por quanto tempo guardamos">
            <p>
              Enquanto você mantiver vínculo com a igreja, e depois disso pelo prazo necessário
              para cumprir obrigações legais. Pedidos de oração já respondidos são arquivados e
              podem ser apagados a seu pedido.
            </p>
          </Secao>

          <Secao titulo="Seus direitos">
            <p>
              A LGPD garante que você possa confirmar se tratamos seus dados, acessá-los, corrigir
              o que estiver errado, pedir a exclusão, revogar consentimento e solicitar
              portabilidade. Para exercer qualquer um desses direitos, fale conosco
              {config.emailContato ? (
                <>
                  {" "}
                  por <a href={`mailto:${config.emailContato}`} className="gold">{config.emailContato}</a>
                </>
              ) : (
                " pelos nossos canais de contato"
              )}
              .
            </p>
          </Secao>

          <Secao titulo="Segurança">
            <p>
              As senhas são guardadas com algoritmo de derivação resistente a ataque de força
              bruta; nunca em texto legível. Os dados trafegam sempre criptografados (HTTPS). Os
              dados de cada igreja ficam isolados dos das demais por controles na aplicação e no
              próprio banco de dados. Ainda assim, nenhum sistema é infalível: se ocorrer um
              incidente relevante, comunicaremos você e a ANPD conforme a lei exige.
            </p>
          </Secao>

          <Secao titulo="Cookies">
            <p>
              Usamos apenas cookies essenciais: um para manter você conectado e outro para proteger
              os formulários contra fraude. Não usamos cookies de publicidade nem de rastreamento
              entre sites.
            </p>
          </Secao>
        </div>
      </section>
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="h4" style={{ color: "var(--fg)", marginBottom: ".9rem" }}>
        {titulo}
      </h2>
      {children}
    </div>
  );
}
