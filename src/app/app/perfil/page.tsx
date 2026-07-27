import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { tenantDaRequisicao } from "@/lib/tenant/resolve";
import { encerrarSessao, sessaoAtual } from "@/lib/auth/session";
import { tenantDb } from "@/lib/db/tenant-client";
import { auditarAutenticacao } from "@/lib/audit";
import { nomeDia } from "@/lib/services/site";

export const dynamic = "force-dynamic";
export const metadata = { title: "Perfil" };

/**
 * =============================================================================
 * A ÚNICA TELA DO APP QUE EXIGE LOGIN
 * =============================================================================
 *
 * A regra do PWA é o contrário da do painel: aqui o padrão é ABERTO. Agenda,
 * células, mensagens, transmissão e contribuição não pedem conta, porque quem
 * mais precisa dessas telas é justamente quem ainda não faz parte da igreja.
 *
 * O perfil é a exceção, e é fácil justificar: ele mostra o cadastro da pessoa,
 * a célula dela, os pedidos de oração que ela escreveu e os cursos em que se
 * matriculou. Isso é dado pessoal — parte dele sensível sob a LGPD. Então aqui
 * fechamos.
 *
 * AS DUAS CHECAGENS, E POR QUE A SEGUNDA É INDISPENSÁVEL
 *
 *   1. `sessaoAtual()` responde "quem é você?".
 *
 *   2. `sessao.tenantId === tenant.id` responde "você é desta igreja?".
 *
 * A segunda não é redundante. A sessão é um cookie de PRIMEIRO nível para o
 * domínio, e a mesma pessoa pode ter conta em duas igrejas da plataforma. Sem
 * essa comparação, um membro logado na Igreja A que abrisse
 * `igrejaB.discipular.app/app/perfil` chegaria autenticado numa tela da Igreja
 * B — e a consulta abaixo, escopada em `tenant.id` (o do HOSTNAME), procuraria
 * pelo `userId` dele dentro da Igreja B. Na maioria dos casos não acharia nada,
 * mas o desenho estaria errado: quem decide o escopo seria o cookie, e não o
 * host. É exatamente a checagem que `exigirAcessoTenant()` faz no painel, feita
 * à mão porque aqui não há papel nem permissão envolvidos — só identidade.
 *
 * Repare também no que NÃO é feito: não existe `?userId=` nem `?pessoaId=`
 * nesta rota. A pessoa exibida é sempre a da sessão. Sem parâmetro, não há
 * IDOR possível.
 */
export default async function AppPerfil() {
  const tenant = await tenantDaRequisicao();
  if (!tenant) notFound();

  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  if (sessao.tenantId !== tenant.id) redirect("/login");

  const db = tenantDb(tenant.id);

  const pessoa = await db.pessoa.findFirst({
    where: { userId: sessao.userId, excluidoEm: null },
    // `select` explícito e sem `observacoesPastorais`. Aquele campo é a
    // anotação que o pastor faz SOBRE a pessoa; ele nunca deve chegar ao
    // aparelho dela, e omiti-lo aqui é mais seguro do que escondê-lo no JSX —
    // o que não é selecionado não vai no payload do RSC.
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      status: true,
      batizado: true,
      dataBatismo: true,
      bairro: true,
      cidade: true,
      campus: { select: { nome: true } },
      celula: {
        select: {
          id: true,
          nome: true,
          diaSemana: true,
          horario: true,
          bairro: true,
          cidade: true,
          liderNome: true,
        },
      },
    },
  });

  /**
   * FALHA FECHADA QUANDO NÃO HÁ PESSOA VINCULADA.
   *
   * Se escrevêssemos `where: { pessoaId: pessoa?.id }` com `pessoa` nulo, o
   * valor chegaria como `undefined`, o Prisma DESCARTARIA a condição inteira e
   * a consulta devolveria os pedidos de oração de TODA a igreja para um membro
   * comum. É assim que vazamento acontece de verdade: não por ataque, por
   * `undefined` silencioso.
   *
   * O sentinela impossível segue o mesmo princípio de `filtroDeEscopo()` no
   * RBAC: na dúvida, filtrar por algo que não existe devolve lista vazia — que
   * é a resposta correta — em vez de devolver tudo.
   */
  const pessoaId = pessoa?.id ?? "__sem-pessoa-vinculada__";

  const [pedidos, matriculas] = await Promise.all([
    db.pedidoOracao.findMany({
      where: { pessoaId },
      orderBy: { criadoEm: "desc" },
      // O texto integral do pedido fica de fora de propósito: a lista serve
      // para acompanhar o status, e uma tela aberta no ônibus não precisa
      // exibir o relato inteiro para quem estiver ao lado.
      select: {
        id: true,
        titulo: true,
        categoria: true,
        status: true,
        urgente: true,
        criadoEm: true,
        respondidoEm: true,
      },
      take: 20,
    }),
    db.matricula.findMany({
      where: { pessoaId },
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        status: true,
        criadoEm: true,
        curso: { select: { nome: true, diaSemana: true, horario: true } },
      },
      take: 20,
    }),
  ]);

  const primeiroNome = sessao.nome.trim().split(/\s+/)[0] ?? sessao.nome;

  return (
    <>
      <header style={{ padding: "calc(env(safe-area-inset-top) + 1.5rem) 1.25rem 1.25rem" }}>
        <p className="eyebrow">Sua conta</p>
        <h1 style={{ fontSize: "1.9rem", marginTop: ".8rem" }}>Olá, {primeiroNome}</h1>
        <p style={{ fontSize: ".82rem", color: "var(--bone-faint)", marginTop: ".55rem" }}>
          {sessao.email}
        </p>
      </header>

      {/* ------------------------------------------------------- CADASTRO */}
      <section style={{ padding: "0 1.25rem 1.75rem" }}>
        <p className="eyebrow" style={{ marginBottom: "1rem" }}>
          Seus dados
        </p>

        {pessoa ? (
          <div style={cartao}>
            <Linha rotulo="Nome" valor={pessoa.nome} />
            {pessoa.telefone && <Linha rotulo="Telefone" valor={pessoa.telefone} />}
            {pessoa.email && <Linha rotulo="E-mail" valor={pessoa.email} />}
            <Linha rotulo="Situação" valor={ROTULO_STATUS[pessoa.status] ?? pessoa.status} />
            {pessoa.campus?.nome && <Linha rotulo="Campus" valor={pessoa.campus.nome} />}
            {(pessoa.bairro || pessoa.cidade) && (
              <Linha
                rotulo="Onde você mora"
                valor={[pessoa.bairro, pessoa.cidade].filter(Boolean).join(" · ")}
              />
            )}
            <Linha
              rotulo="Batismo"
              valor={
                pessoa.batizado
                  ? pessoa.dataBatismo
                    ? `Batizado em ${formatarData(pessoa.dataBatismo)}`
                    : "Batizado"
                  : "Ainda não"
              }
            />

            <p style={{ fontSize: ".78rem", color: "var(--bone-faint)", marginTop: "1rem", lineHeight: 1.6 }}>
              Algum dado errado? Fale com a secretaria — a correção é feita por lá para manter o
              cadastro da igreja consistente.
            </p>
          </div>
        ) : (
          <div style={cartao}>
            <p style={{ color: "var(--bone-dim)", fontSize: ".9rem", lineHeight: 1.6 }}>
              Sua conta ainda não está vinculada a um cadastro nesta igreja. Fale com a secretaria
              para completar seu registro e ver aqui sua célula e sua jornada.
            </p>
          </div>
        )}
      </section>

      {/* --------------------------------------------------- MINHA CÉLULA */}
      <section style={{ padding: "0 1.25rem 1.75rem" }}>
        <p className="eyebrow" style={{ marginBottom: "1rem" }}>
          Minha célula
        </p>

        {pessoa?.celula ? (
          <div style={cartao}>
            <p style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem" }}>
              {pessoa.celula.nome}
            </p>
            {(pessoa.celula.diaSemana !== null || pessoa.celula.horario) && (
              <p
                style={{
                  fontSize: ".72rem",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  fontWeight: 600,
                  marginTop: ".5rem",
                }}
              >
                {[nomeDia(pessoa.celula.diaSemana) || null, pessoa.celula.horario]
                  .filter(Boolean)
                  .join(" às ")}
              </p>
            )}
            {(pessoa.celula.bairro || pessoa.celula.cidade) && (
              <p style={{ fontSize: ".84rem", color: "var(--bone-dim)", marginTop: ".5rem" }}>
                {[pessoa.celula.bairro, pessoa.celula.cidade].filter(Boolean).join(" · ")}
              </p>
            )}
            {pessoa.celula.liderNome && (
              <p style={{ fontSize: ".8rem", color: "var(--bone-faint)", marginTop: ".4rem" }}>
                Liderança: {pessoa.celula.liderNome}
              </p>
            )}
          </div>
        ) : (
          <div style={cartao}>
            <p style={{ color: "var(--bone-dim)", fontSize: ".9rem", lineHeight: 1.6 }}>
              Você ainda não está em uma célula. É o melhor lugar para criar amizade de verdade na
              igreja.
            </p>
            <Link href="/app/celulas" className="btn btn--block" style={{ marginTop: "1.1rem" }}>
              Encontrar uma célula
            </Link>
          </div>
        )}
      </section>

      {/* -------------------------------------------- MEUS PEDIDOS DE ORAÇÃO */}
      <section style={{ padding: "0 1.25rem 1.75rem" }}>
        <p className="eyebrow" style={{ marginBottom: "1rem" }}>
          Meus pedidos de oração
        </p>

        {pedidos.length === 0 ? (
          <div style={cartao}>
            <p style={{ color: "var(--bone-dim)", fontSize: ".9rem", lineHeight: 1.6 }}>
              Você não tem pedidos registrados. Quando quiser, é só escrever — a equipe de
              intercessão ora por cada um.
            </p>
            <Link href="/app/oracao" className="btn btn--block btn--ghost" style={{ marginTop: "1.1rem" }}>
              Fazer um pedido
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: ".6rem" }}>
            {pedidos.map((p) => (
              <article key={p.id} style={cartao}>
                <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap", marginBottom: ".5rem" }}>
                  <span
                    style={{
                      fontSize: ".62rem",
                      letterSpacing: ".12em",
                      textTransform: "uppercase",
                      color: "var(--gold)",
                      fontWeight: 600,
                    }}
                  >
                    {ROTULO_CATEGORIA[p.categoria] ?? p.categoria}
                  </span>
                  {p.urgente && (
                    <span
                      style={{
                        fontSize: ".62rem",
                        letterSpacing: ".12em",
                        textTransform: "uppercase",
                        color: "#E5484D",
                        fontWeight: 600,
                      }}
                    >
                      Urgente
                    </span>
                  )}
                </div>

                <p style={{ fontSize: ".95rem", lineHeight: 1.5 }}>
                  {p.titulo ?? "Pedido sem título"}
                </p>

                <p style={{ fontSize: ".76rem", color: "var(--bone-faint)", marginTop: ".5rem" }}>
                  {ROTULO_ORACAO[p.status] ?? p.status} · enviado em {formatarDataHora(p.criadoEm)}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* ------------------------------------------------ MINHAS MATRÍCULAS */}
      {matriculas.length > 0 && (
        <section style={{ padding: "0 1.25rem 1.75rem" }}>
          <p className="eyebrow" style={{ marginBottom: "1rem" }}>
            Meus cursos
          </p>

          <div style={{ display: "grid", gap: ".6rem" }}>
            {matriculas.map((m) => (
              <article key={m.id} style={cartao}>
                <p style={{ fontWeight: 600, fontSize: ".95rem" }}>{m.curso.nome}</p>
                {(m.curso.diaSemana !== null || m.curso.horario) && (
                  <p style={{ fontSize: ".8rem", color: "var(--bone-dim)", marginTop: ".3rem" }}>
                    {[nomeDia(m.curso.diaSemana) || null, m.curso.horario].filter(Boolean).join(" às ")}
                  </p>
                )}
                <p style={{ fontSize: ".74rem", color: "var(--bone-faint)", marginTop: ".45rem" }}>
                  {ROTULO_MATRICULA[m.status] ?? m.status}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- SAIR */}
      <section style={{ padding: "0 1.25rem 2.5rem" }}>
        <Link href="/app/instalar" className="btn btn--block btn--ghost" style={{ marginBottom: ".7rem" }}>
          Instalar o aplicativo
        </Link>

        {/*
          Server Action em vez de fetch em componente cliente. O Next valida a
          origem da requisição de Server Action automaticamente, então o POST
          nasce protegido contra CSRF sem precisarmos carregar o token à mão —
          e o botão continua funcionando com JavaScript desligado, porque é um
          <form> de verdade.
        */}
        <form action={sair}>
          <button type="submit" className="btn btn--block btn--ghost">
            Sair da conta
          </button>
        </form>

        <p style={{ fontSize: ".76rem", color: "var(--bone-faint)", marginTop: "1rem", lineHeight: 1.6 }}>
          Sair encerra esta sessão no servidor, e não só neste aparelho. Se você acha que alguém
          entrou na sua conta, troque a senha: isso derruba todas as sessões de uma vez.
        </p>
      </section>
    </>
  );
}

/**
 * Logout.
 *
 * `encerrarSessao()` revoga a sessão no BANCO e só depois limpa o cookie.
 * Apagar apenas o cookie deixaria o token válido para quem tivesse copiado —
 * exatamente o cenário do celular perdido, que é quando alguém clica aqui.
 */
async function sair(): Promise<void> {
  "use server";

  const sessao = await sessaoAtual();
  await encerrarSessao();

  if (sessao) {
    await auditarAutenticacao({
      acao: "logout",
      email: sessao.email,
      userId: sessao.userId,
      tenantId: sessao.tenantId,
    });
  }

  // Volta para a parte pública do app, e não para /login: a pessoa continua
  // podendo ver agenda, mensagens e ao vivo sem conta.
  redirect("/app");
}

// -----------------------------------------------------------------------------

const cartao: React.CSSProperties = {
  padding: "1.1rem",
  background: "var(--ink-700)",
  border: "1px solid var(--line-on-dark)",
  borderRadius: "var(--radius-lg)",
};

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: "flex", gap: "1rem", justifyContent: "space-between", padding: ".35rem 0" }}>
      <span style={{ fontSize: ".78rem", color: "var(--bone-faint)", flex: "none" }}>{rotulo}</span>
      <span style={{ fontSize: ".88rem", textAlign: "right", wordBreak: "break-word" }}>{valor}</span>
    </div>
  );
}

const ROTULO_STATUS: Record<string, string> = {
  VISITANTE: "Visitante",
  EM_ACOMPANHAMENTO: "Em acompanhamento",
  CONGREGANTE: "Congregante",
  MEMBRO: "Membro",
  INATIVO: "Inativo",
  TRANSFERIDO: "Transferido",
};

const ROTULO_ORACAO: Record<string, string> = {
  RECEBIDO: "Recebido",
  ORANDO: "A equipe está orando",
  RESPONDIDO: "Respondido",
  ARQUIVADO: "Arquivado",
};

const ROTULO_MATRICULA: Record<string, string> = {
  INSCRITO: "Inscrito",
  CONFIRMADO: "Confirmado",
  CURSANDO: "Cursando",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

const ROTULO_CATEGORIA: Record<string, string> = {
  SAUDE: "Saúde",
  FAMILIA: "Família",
  FINANCEIRO: "Financeiro",
  TRABALHO: "Trabalho",
  ESPIRITUAL: "Espiritual",
  LUTO: "Luto",
  GRATIDAO: "Gratidão",
  GERAL: "Geral",
};

/** `dataBatismo` é `@db.Date`: sem `timeZone: "UTC"` o Brasil veria o dia anterior. */
function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(data);
}

function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}
