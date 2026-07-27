import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { termoBusca } from "@/lib/validation/comum";

export const dynamic = "force-dynamic";
export const metadata = { title: "Auditoria" };

/**
 * Trilha de auditoria da PLATAFORMA.
 *
 * É a tabela onde uma investigação começa: quem criou, suspendeu ou entrou
 * como qual igreja, e todos os eventos de autenticação do sistema inteiro.
 * Fica separada da auditoria por igreja de propósito — um ADMIN de igreja lê a
 * dele e nunca esta.
 *
 * A tela é só de LEITURA. Não existe editar nem apagar registro de auditoria
 * em lugar nenhum do código: um log que o operador consegue alterar não prova
 * coisa alguma sobre o próprio operador.
 */

/**
 * Grupos de ação em vez de campo livre.
 *
 * Poderia ser um input de texto batendo em `acao: { contains }`. Lista fechada
 * é melhor por dois motivos: o operador descobre o que existe sem adivinhar, e
 * o valor que chega ao `where` é sempre um dos que escrevemos aqui — não uma
 * string da URL.
 */
type Grupo = "TODOS" | "igrejas" | "dominios" | "impersonacao" | "autenticacao";

const GRUPOS: Record<Grupo, Prisma.PlatformAuditLogWhereInput["acao"]> = {
  TODOS: undefined,
  igrejas: { startsWith: "tenant." },
  dominios: { startsWith: "dominio." },
  impersonacao: { startsWith: "impersonacao." },
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
};

const JANELAS_HORAS = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
  tudo: null,
} as const;

const schemaFiltros = z.object({
  grupo: z.enum(["TODOS", "igrejas", "dominios", "impersonacao", "autenticacao"]).default("TODOS"),
  periodo: z.enum(["24h", "7d", "30d", "90d", "tudo"]).default("30d"),
  /** Busca por e-mail do ator. Vai para `contains`, que é parametrizado. */
  ator: termoBusca,
  pagina: z.coerce.number().int().min(1).max(1_000).default(1),
});

const POR_PAGINA = 50;

export default async function AuditoriaPlataforma({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPlataformaAdmin();

  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const horas = JANELAS_HORAS[filtros.periodo];
  const desde = horas === null ? null : new Date(Date.now() - horas * 60 * 60 * 1000);
  const filtroAcao = GRUPOS[filtros.grupo];

  const where: Prisma.PlatformAuditLogWhereInput = {
    ...(filtroAcao ? { acao: filtroAcao } : {}),
    ...(desde ? { criadoEm: { gte: desde } } : {}),
    ...(filtros.ator ? { atorEmail: { contains: filtros.ator, mode: "insensitive" } } : {}),
  };

  const vinteQuatroHoras = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const trintaDias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [registros, total, loginsFalhos, impersonacoes] = await Promise.all([
    prisma.platformAuditLog.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        criadoEm: true,
        atorEmail: true,
        atorUserId: true,
        acao: true,
        alvoTipo: true,
        alvoId: true,
        detalhes: true,
      },
    }),
    prisma.platformAuditLog.count({ where }),
    prisma.platformAuditLog.count({
      where: { acao: "login.falha", criadoEm: { gte: vinteQuatroHoras } },
    }),
    prisma.platformAuditLog.count({
      where: { acao: "impersonacao.iniciar", criadoEm: { gte: trintaDias } },
    }),
  ]);

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Auditoria</h1>
          <p className="painel__sub">
            {total.toLocaleString("pt-BR")} {total === 1 ? "registro" : "registros"} no recorte atual.
            Somente leitura.
          </p>
        </div>
      </div>

      <div className="cartoes" style={{ marginBottom: "2rem" }}>
        <Cartao
          rotulo="Logins falhos (24h)"
          valor={loginsFalhos}
          nota={loginsFalhos > 50 ? "Volume acima do normal — investigar" : "Dentro do esperado"}
          destaque={loginsFalhos > 50}
        />
        <Cartao
          rotulo="Sessões de suporte (30d)"
          valor={impersonacoes}
          nota="Acessos a dados de clientes"
          destaque={impersonacoes > 0}
        />
      </div>

      <form method="get" className="barra-ferramentas" style={{ alignItems: "flex-end" }}>
        <div className="campo" style={{ minWidth: "180px" }}>
          <label className="campo__rotulo" htmlFor="grupo">
            Tipo de ação
          </label>
          <select id="grupo" name="grupo" defaultValue={filtros.grupo}>
            <option value="TODOS">Todas</option>
            <option value="igrejas">Igrejas</option>
            <option value="dominios">Domínios</option>
            <option value="impersonacao">Sessões de suporte</option>
            <option value="autenticacao">Autenticação</option>
          </select>
        </div>

        <div className="campo" style={{ minWidth: "150px" }}>
          <label className="campo__rotulo" htmlFor="periodo">
            Período
          </label>
          <select id="periodo" name="periodo" defaultValue={filtros.periodo}>
            <option value="24h">Últimas 24 horas</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
            <option value="tudo">Tudo</option>
          </select>
        </div>

        <div className="campo" style={{ minWidth: "220px", flex: 1 }}>
          <label className="campo__rotulo" htmlFor="ator">
            E-mail do ator
          </label>
          <input
            id="ator"
            name="ator"
            type="search"
            defaultValue={filtros.ator ?? ""}
            maxLength={80}
            placeholder="parte do e-mail"
          />
        </div>

        <button type="submit" className="btn btn--sm">
          Filtrar
        </button>
      </form>

      {registros.length === 0 ? (
        <div className="vazio">Nenhum registro com esses filtros.</div>
      ) : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Ator</th>
                <th>Ação</th>
                <th>Alvo</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((registro) => (
                <tr key={registro.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: ".8rem" }}>
                    {registro.criadoEm.toLocaleString("pt-BR")}
                  </td>
                  <td style={{ fontSize: ".82rem" }}>
                    {registro.atorEmail ?? <span className="dim">sistema</span>}
                  </td>
                  <td>
                    <EtiquetaAcao acao={registro.acao} />
                  </td>
                  <td style={{ fontSize: ".8rem" }}>
                    {registro.alvoTipo ? (
                      <>
                        {registro.alvoTipo}
                        {registro.alvoId && registro.alvoTipo === "Tenant" ? (
                          <>
                            {" · "}
                            <Link href={`/plataforma/igrejas/${registro.alvoId}`}>abrir</Link>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="dim">—</span>
                    )}
                  </td>
                  <td>
                    <Detalhes valor={registro.detalhes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPaginas > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {filtros.pagina > 1 && <Link href={linkPagina(filtros, filtros.pagina - 1)}>← Anterior</Link>}
          <span aria-current="page">
            {filtros.pagina} de {totalPaginas}
          </span>
          {filtros.pagina < totalPaginas && (
            <Link href={linkPagina(filtros, filtros.pagina + 1)}>Próxima →</Link>
          )}
        </nav>
      )}
    </>
  );
}

function linkPagina(filtros: z.infer<typeof schemaFiltros>, pagina: number): string {
  const query = new URLSearchParams();
  if (filtros.grupo !== "TODOS") query.set("grupo", filtros.grupo);
  if (filtros.periodo !== "30d") query.set("periodo", filtros.periodo);
  if (filtros.ator) query.set("ator", filtros.ator);
  query.set("pagina", String(pagina));
  return `/plataforma/auditoria?${query.toString()}`;
}

/**
 * Renderiza `detalhes` como TEXTO dentro de um <pre>.
 *
 * O conteúdo já passou por `mascarar()` na gravação, mas ele continua sendo
 * dado que veio de fora. Serializar com `JSON.stringify` e deixar o React
 * escapar é o que impede que uma chave maliciosa gravada há seis meses vire
 * marcação nesta página. `dangerouslySetInnerHTML` aqui seria XSS armazenado
 * na tela que administra todas as igrejas — o pior alvo possível.
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
  // Ações que merecem destaque visual: são as que alguém procura quando algo
  // deu errado.
  const critica = acao.startsWith("impersonacao.") || acao === "login.falha";
  const positiva = acao === "login.sucesso" || acao === "tenant.criar";

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
