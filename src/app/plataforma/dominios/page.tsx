import Link from "next/link";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { termoBusca } from "@/lib/validation/comum";
import { AcoesDominio, InstrucaoDns } from "@/components/plataforma/AcoesDominio";
import { EtiquetaDominio } from "@/components/plataforma/DominiosDaIgreja";

export const dynamic = "force-dynamic";
export const metadata = { title: "Domínios" };

/**
 * Todos os domínios próprios da plataforma, em uma tela.
 *
 * POR QUE ESTA TELA EXISTE
 * Vinculação de domínio é a operação onde o cliente mais trava (ele precisa
 * mexer no painel do registrador) e a que tem a pior consequência quando dá
 * errado: um domínio pendente significa site fora do ar; um domínio
 * verificado errado significaria tráfego de uma igreja servindo o conteúdo de
 * outra. Ver a fila inteira, com o último erro de DNS de cada um, é o que
 * transforma "o cliente reclamou" em "eu já sabia".
 */

const schemaFiltros = z.object({
  busca: termoBusca,
  status: z.enum(["PENDENTE", "VERIFICADO", "ERRO", "TODOS"]).default("TODOS"),
  pagina: z.coerce.number().int().min(1).max(1_000).default(1),
});

const POR_PAGINA = 25;

export default async function ListaDominios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPlataformaAdmin();

  const params = await searchParams;
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.TenantDomainWhereInput = {
    ...(filtros.status !== "TODOS" ? { status: filtros.status } : {}),
    ...(filtros.busca ? { hostname: { contains: filtros.busca, mode: "insensitive" } } : {}),
  };

  const [dominios, total, porStatus] = await Promise.all([
    prisma.tenantDomain.findMany({
      where,
      orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        hostname: true,
        status: true,
        principal: true,
        verificadoEm: true,
        ultimoErro: true,
        criadoEm: true,
        /**
         * O token de verificação aparece na tela, de propósito.
         *
         * Ele não é credencial de acesso: serve só para provar controle do DNS,
         * e o destino dele é justamente ficar PÚBLICO num registro TXT. Quem
         * opera o suporte precisa dele para ditar a instrução ao cliente. O que
         * ele NÃO pode fazer é ir para log ou auditoria — e não vai:
         * `tokenVerificacao` está na denylist de `mascarar()` em lib/audit.ts.
         */
        tokenVerificacao: true,
        tenant: { select: { id: true, nome: true, slug: true, status: true } },
      },
    }),
    prisma.tenantDomain.count({ where }),
    prisma.tenantDomain.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const contagem: Record<string, number> = {};
  for (const linha of porStatus) contagem[linha.status] = linha._count._all;

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Domínios</h1>
          <p className="painel__sub">
            Um domínio só passa a servir conteúdo depois de verificado. Até lá, a igreja responde em{" "}
            <strong>slug.{env.ROOT_DOMAIN}</strong>.
          </p>
        </div>
      </div>

      <div className="cartoes" style={{ marginBottom: "2rem" }}>
        <Cartao rotulo="Verificados" valor={contagem.VERIFICADO ?? 0} nota="Servindo normalmente" />
        <Cartao
          rotulo="Aguardando DNS"
          valor={contagem.PENDENTE ?? 0}
          nota="Cliente ainda não publicou o TXT"
          destaque={(contagem.PENDENTE ?? 0) > 0}
        />
        <Cartao
          rotulo="Com erro"
          valor={contagem.ERRO ?? 0}
          nota="Falha na última consulta"
          destaque={(contagem.ERRO ?? 0) > 0}
        />
      </div>

      <form method="get" className="barra-ferramentas" style={{ alignItems: "flex-end" }}>
        <div className="campo" style={{ minWidth: "240px", flex: 1 }}>
          <label className="campo__rotulo" htmlFor="busca">
            Buscar domínio
          </label>
          <input
            id="busca"
            name="busca"
            type="search"
            defaultValue={filtros.busca ?? ""}
            maxLength={80}
            placeholder="igrejaexemplo.com.br"
          />
        </div>
        <div className="campo" style={{ minWidth: "170px" }}>
          <label className="campo__rotulo" htmlFor="status">
            Situação
          </label>
          <select id="status" name="status" defaultValue={filtros.status}>
            <option value="TODOS">Todas</option>
            <option value="PENDENTE">Aguardando DNS</option>
            <option value="VERIFICADO">Verificados</option>
            <option value="ERRO">Com erro</option>
          </select>
        </div>
        <button type="submit" className="btn btn--sm">
          Filtrar
        </button>
      </form>

      {dominios.length === 0 ? (
        <div className="vazio">Nenhum domínio com esses filtros.</div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {dominios.map((dominio) => (
            <article key={dominio.id} className="secao-painel" style={{ marginBottom: 0 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ fontSize: "1.05rem" }}>{dominio.hostname}</strong>
                    <EtiquetaDominio status={dominio.status} />
                    {dominio.principal && <span className="etiqueta etiqueta--andamento">Principal</span>}
                  </div>

                  <p className="dim" style={{ fontSize: ".82rem", marginTop: ".4rem" }}>
                    <Link href={`/plataforma/igrejas/${dominio.tenant.id}`}>{dominio.tenant.nome}</Link>
                    {" · "}
                    {dominio.tenant.slug}.{env.ROOT_DOMAIN}
                    {" · cadastrado em "}
                    {dominio.criadoEm.toLocaleDateString("pt-BR")}
                    {dominio.verificadoEm && ` · verificado em ${dominio.verificadoEm.toLocaleDateString("pt-BR")}`}
                  </p>

                  {dominio.ultimoErro && (
                    <p style={{ fontSize: ".82rem", color: "#cf222e", marginTop: ".4rem" }}>
                      Último erro: {dominio.ultimoErro}
                    </p>
                  )}
                </div>
              </div>

              {/* Instrução de DNS só onde ela ainda é necessária. */}
              {dominio.status !== "VERIFICADO" && (
                <div style={{ marginBottom: "1rem" }}>
                  <InstrucaoDns
                    nome={`_discipular.${dominio.hostname}`}
                    valor={`discipular-verificacao=${dominio.tokenVerificacao}`}
                  />
                </div>
              )}

              <AcoesDominio
                tenantId={dominio.tenant.id}
                dominioId={dominio.id}
                hostname={dominio.hostname}
                status={dominio.status}
                principal={dominio.principal}
              />
            </article>
          ))}
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
  if (filtros.busca) query.set("busca", filtros.busca);
  if (filtros.status !== "TODOS") query.set("status", filtros.status);
  query.set("pagina", String(pagina));
  return `/plataforma/dominios?${query.toString()}`;
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
