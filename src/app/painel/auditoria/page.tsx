import { z } from "zod";
import type { Prisma } from "@prisma/client";

import { exigirPermissao } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { id as idSchema } from "@/lib/validation/comum";
import { FiltrosAuditoria } from "@/components/painel/FiltrosAuditoria";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auditoria" };

/**
 * =============================================================================
 * AUDITORIA DA IGREJA
 * =============================================================================
 *
 * POR QUE ESTA TELA EXISTE
 *
 * Não é conformidade decorativa. Ela existe para responder perguntas que uma
 * igreja realmente faz, e que sem ela não têm resposta nenhuma:
 *
 *   "Quem apagou a ficha da Maria?"
 *   "Alguém andou lendo os pedidos de oração fora do horário?"
 *   "A secretária que saiu em março acessou alguma coisa depois disso?"
 *   "O fornecedor entrou no nosso painel? Quando, e para quê?"
 *
 * Sob a LGPD a igreja é a CONTROLADORA dos dados que guarda — a
 * responsabilidade por um acesso indevido é dela, não da plataforma. Uma
 * controladora que não consegue investigar o próprio sistema não tem como
 * cumprir esse papel. Por isso o log é do cliente e é ele quem o lê.
 *
 * A tela é SOMENTE LEITURA, e não existe em lugar nenhum do código um caminho
 * para editar ou apagar uma linha de `AuditLog`. Log que o operador consegue
 * alterar não prova nada sobre o próprio operador.
 *
 * POR QUE O ADMIN DA IGREJA JAMAIS VÊ O `PlatformAuditLog`
 *
 * São duas tabelas separadas de propósito (ver prisma/schema.prisma):
 *
 *   AuditLog          -> tem `tenantId`. É a trilha DESTA igreja.
 *   PlatformAuditLog  -> global. Registra o que o super admin faz em TODAS as
 *                        igrejas: criações, suspensões, mudanças de plano,
 *                        sessões de suporte, tentativas de login do sistema
 *                        inteiro.
 *
 * Ler a segunda revelaria a existência, o nome, o plano e a situação comercial
 * das outras igrejas clientes — dado de terceiros que não tem nenhuma relação
 * com esta. Seria vazamento entre clientes pela porta da frente, com o
 * agravante de ser exatamente a tela que deveria detectar vazamentos.
 *
 * A parte que interessa à igreja não fica de fora: eventos de autenticação dos
 * usuários dela e as sessões de suporte abertas no painel dela são gravados
 * NOS DOIS logs (ver `auditarAutenticacao` e `iniciarImpersonacao`). Ou seja,
 * a igreja enxerga tudo o que aconteceu com ela — e nada do que aconteceu com
 * as outras.
 *
 * A CONSULTA VAI POR `ctx.db`
 * `AuditLog` é modelo tenant-scoped, então o cliente escopado injeta o filtro
 * sozinho. Mesmo que alguém escrevesse um `where` esquecido aqui, a extensão
 * o completaria — e o RLS do Postgres ainda estaria atrás disso.
 */

/**
 * Grupos de ação, em vez de campo de texto livre.
 *
 * O valor que chega ao `where` é sempre um dos literais escritos abaixo, nunca
 * uma string vinda da URL. Além de fechar a entrada, isso dá ao pastor uma
 * lista do que existe para procurar — ninguém investiga digitando o nome exato
 * de um verbo interno do sistema.
 */
type Grupo =
  | "TODOS"
  | "pessoas"
  | "oracao"
  | "batismos"
  | "usuarios"
  | "configuracoes"
  | "lgpd"
  | "site"
  | "autenticacao"
  | "suporte";

const GRUPOS: Record<Grupo, Prisma.AuditLogWhereInput["acao"]> = {
  TODOS: undefined,
  pessoas: { startsWith: "pessoa." },
  oracao: { startsWith: "oracao." },
  batismos: { startsWith: "batismo." },
  usuarios: { startsWith: "usuario." },
  configuracoes: { startsWith: "config." },
  lgpd: { startsWith: "lgpd." },
  site: { startsWith: "site." },
  autenticacao: {
    in: [
      "login.sucesso",
      "login.falha",
      "logout",
      "senha.reset.solicitado",
      "senha.reset.concluido",
      "senha.alterada",
    ],
  },
  suporte: { startsWith: "impersonacao." },
};

const JANELAS_HORAS = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
  tudo: null,
} as const;

const schemaFiltros = z.object({
  grupo: z
    .enum([
      "TODOS",
      "pessoas",
      "oracao",
      "batismos",
      "usuarios",
      "configuracoes",
      "lgpd",
      "site",
      "autenticacao",
      "suporte",
    ])
    .default("TODOS"),
  periodo: z.enum(["24h", "7d", "30d", "90d", "tudo"]).default("30d"),
  /** Id do ator. Formato de CUID validado antes de tocar o banco. */
  ator: z
    .union([idSchema, z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  pagina: z.coerce.number().int().min(1).max(1_000).default(1),
});

/** Teto de página: sem ele um `?limite=100000` viraria DoS de memória. */
const POR_PAGINA = 50;

export default async function PainelAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("auditoria.ler");

  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const horas = JANELAS_HORAS[filtros.periodo];
  const desde = horas === null ? null : new Date(Date.now() - horas * 60 * 60 * 1000);
  const filtroAcao = GRUPOS[filtros.grupo];

  const where: Prisma.AuditLogWhereInput = {
    ...(filtroAcao ? { acao: filtroAcao } : {}),
    ...(desde ? { criadoEm: { gte: desde } } : {}),
    ...(filtros.ator ? { atorUserId: filtros.ator } : {}),
  };

  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [registros, total, acessosSuporte, loginsFalhos, equipe] = await Promise.all([
    ctx.db.auditLog.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        criadoEm: true,
        atorUserId: true,
        atorNome: true,
        atorPapel: true,
        impersonadoPor: true,
        acao: true,
        alvoTipo: true,
        alvoId: true,
        detalhes: true,
      },
    }),
    ctx.db.auditLog.count({ where }),
    ctx.db.auditLog.count({
      where: { impersonadoPor: { not: null }, criadoEm: { gte: trintaDias } },
    }),
    ctx.db.auditLog.count({ where: { acao: "login.falha", criadoEm: { gte: trintaDias } } }),
    /**
     * A lista de atores para o filtro vem dos MEMBERSHIPS desta igreja, não de
     * um `distinct` sobre o log. Duas razões: é uma lista fechada (o valor
     * escolhido é sempre um id que pertence a esta igreja) e é a lista que faz
     * sentido para quem investiga — nomes de pessoas, não ids soltos.
     *
     * `Membership` é modelo GLOBAL: o `tenantId` no `where` é escrito à mão e é
     * ele que impede a lista de trazer usuários de outras igrejas.
     */
    prisma.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: { criadoEm: "asc" },
      select: { userId: true, user: { select: { nome: true } } },
      take: 200,
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Auditoria</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "registro" : "registros"} no recorte
            atual. Somente leitura — nem o administrador pode editar ou apagar uma linha daqui.
          </p>
        </div>
      </div>

      <div className="cartoes" style={{ marginBottom: "2rem" }}>
        <Cartao
          rotulo="Acessos do suporte (30d)"
          valor={acessosSuporte}
          nota={
            acessosSuporte > 0
              ? "Ações feitas por sessão de suporte do fornecedor"
              : "Nenhum acesso externo no período"
          }
          destaque={acessosSuporte > 0}
        />
        <Cartao
          rotulo="Logins falhos (30d)"
          valor={loginsFalhos}
          nota={loginsFalhos > 30 ? "Volume acima do normal — investigue" : "Dentro do esperado"}
          destaque={loginsFalhos > 30}
        />
      </div>

      <FiltrosAuditoria
        grupo={filtros.grupo}
        periodo={filtros.periodo}
        ator={filtros.ator ?? ""}
        atores={equipe.map((m) => ({ id: m.userId, nome: m.user.nome }))}
      />

      {registros.length === 0 ? (
        <div className="vazio">Nenhum registro com esses filtros.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: ".8rem" }}>
                    {r.criadoEm.toLocaleString("pt-BR")}
                  </td>
                  <td style={{ fontSize: ".82rem" }}>
                    {r.atorNome ?? <span className="dim">sistema</span>}
                    {r.atorPapel && (
                      <div className="dim" style={{ fontSize: ".72rem" }}>
                        {r.atorPapel}
                      </div>
                    )}
                    {/*
                      Etiqueta de impersonação: a igreja tem direito de saber
                      quando uma ação no painel dela foi feita pelo fornecedor
                      em sessão de suporte, e por quem.
                    */}
                    {r.impersonadoPor && (
                      <div style={{ marginTop: ".25rem" }}>
                        <span className="etiqueta etiqueta--urgente">
                          suporte: {r.impersonadoPor}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <EtiquetaAcao acao={r.acao} />
                  </td>
                  <td style={{ fontSize: ".8rem" }}>
                    {r.alvoTipo ? (
                      <>
                        {r.alvoTipo}
                        {r.alvoId && (
                          <div className="dim" style={{ fontSize: ".7rem" }}>
                            {r.alvoId}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td>
                    <Detalhes valor={r.detalhes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {filtros.pagina > 1 && <a href={linkPagina(filtros, filtros.pagina - 1)}>← Anterior</a>}
          <span aria-current="page">
            {filtros.pagina} de {totalPaginas}
          </span>
          {filtros.pagina < totalPaginas && (
            <a href={linkPagina(filtros, filtros.pagina + 1)}>Próxima →</a>
          )}
        </nav>
      )}

      <section className="secao-painel" style={{ marginTop: "2rem" }}>
        <h2 className="secao-painel__titulo">Como ler esta tela</h2>
        <p className="secao-painel__desc">
          Os detalhes de cada linha já saem mascarados na gravação: e-mail, telefone, observações
          pastorais e o texto de pedidos de oração aparecem como <code>[alterado]</code>, e senhas e
          tokens nunca chegam a ser gravados. O log registra <strong>que</strong> algo mudou e{" "}
          <strong>quem</strong> mudou — ele não é uma segunda cópia dos dados sensíveis, porque uma
          trilha de auditoria vazada seria tão grave quanto o banco vazado.
        </p>
        <p className="secao-painel__desc">
          Esta é a auditoria <strong>desta igreja</strong>. As ações administrativas da plataforma
          sobre outras igrejas ficam em um registro separado, ao qual nenhum cliente tem acesso —
          pelo mesmo motivo que nenhuma outra igreja tem acesso a esta tela.
        </p>
      </section>
    </>
  );
}

function linkPagina(filtros: z.infer<typeof schemaFiltros>, pagina: number): string {
  const query = new URLSearchParams();
  if (filtros.grupo !== "TODOS") query.set("grupo", filtros.grupo);
  if (filtros.periodo !== "30d") query.set("periodo", filtros.periodo);
  if (filtros.ator) query.set("ator", filtros.ator);
  query.set("pagina", String(pagina));
  return `/painel/auditoria?${query.toString()}`;
}

/**
 * Renderiza `detalhes` como TEXTO dentro de um <pre>.
 *
 * O conteúdo já passou por `mascarar()` na gravação, mas continua sendo dado
 * que veio de fora. `JSON.stringify` + escape automático do React é o que
 * impede que uma chave maliciosa gravada meses atrás vire marcação nesta
 * página. `dangerouslySetInnerHTML` aqui seria XSS armazenado na tela que
 * investiga incidentes — o lugar menos indicado do sistema para ter um.
 */
function Detalhes({ valor }: { valor: unknown }) {
  if (valor === null || valor === undefined) return <span className="dim">—</span>;

  let texto: string;
  try {
    texto = JSON.stringify(valor);
  } catch {
    return <span className="dim">—</span>;
  }

  return (
    <pre
      style={{
        fontSize: ".72rem",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxWidth: "420px",
        color: "var(--graphite-dim)",
        margin: 0,
      }}
    >
      {texto.length > 400 ? `${texto.slice(0, 400)}…` : texto}
    </pre>
  );
}

function EtiquetaAcao({ acao }: { acao: string }) {
  // Destaque para o que alguém procura quando algo deu errado.
  const critica =
    acao.startsWith("impersonacao.") ||
    acao.startsWith("lgpd.") ||
    acao === "login.falha" ||
    acao.endsWith(".excluir") ||
    acao.endsWith(".remover");
  const positiva = acao === "login.sucesso" || acao.endsWith(".criar");

  const classe = critica ? "urgente" : positiva ? "novo" : "concluido";
  return <span className={`etiqueta etiqueta--${classe}`}>{acao}</span>;
}

function Cartao({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: number;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div className={`cartao${destaque ? " cartao--destaque" : ""}`}>
      <span className="cartao__rotulo">{rotulo}</span>
      <span className="cartao__valor">{valor.toLocaleString("pt-BR")}</span>
      <span className="cartao__nota">{nota}</span>
    </div>
  );
}
