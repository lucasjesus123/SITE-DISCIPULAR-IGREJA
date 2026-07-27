import { z } from "zod";
import type { Papel, Prisma } from "@prisma/client";

import { exigirPermissao, papeisAtribuiveis } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { ConviteUsuario } from "@/components/painel/ConviteUsuario";
import { ListaUsuarios } from "@/components/painel/ListaUsuarios";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários e papéis" };

/**
 * Usuários e papéis da igreja.
 *
 * O QUE ESTA TELA REALMENTE ADMINISTRA
 * Não é "cadastro de pessoas" (isso é /painel/pessoas). É a lista de quem
 * consegue ABRIR o painel e com qual alcance. Uma linha a mais aqui é uma
 * pessoa a mais lendo pedidos de oração sobre doença e crise familiar.
 *
 * POR QUE AS CONSULTAS USAM `prisma` E NÃO `ctx.db`
 * `Membership`, `User` e `Sessao` são modelos GLOBAIS na classificação de
 * src/lib/db/tenant-client.ts — o cliente escopado os deixa passar sem injetar
 * filtro. Então o `tenantId: ctx.tenant.id` escrito à mão em cada `where` NÃO é
 * redundância: é o próprio isolamento. Sem ele, esta página listaria os
 * usuários de todas as igrejas da plataforma.
 *
 * O tenant vem de `exigirPermissao()`, que o resolve pelo hostname. Nunca de
 * searchParams.
 */

const schemaFiltros = z.object({
  // Lista fechada: o valor que chega ao `where` é sempre um destes literais,
  // nunca uma string arbitrária da URL.
  papel: z.enum(["TODOS", "ADMIN", "PASTOR", "SECRETARIA", "LIDER_CELULA", "MEMBRO"]).default("TODOS"),
  situacao: z.enum(["TODOS", "ativos", "inativos"]).default("TODOS"),
  pagina: z.coerce.number().int().min(1).max(1_000).default(1),
});

/** Teto de página. Ver `paginacao` em src/lib/validation/comum.ts. */
const POR_PAGINA = 25;

export default async function PainelUsuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await exigirPermissao("usuarios.ler");

  const params = await searchParams;
  // `.safeParse` com fallback: um `?pagina=abc` colado por alguém não pode
  // derrubar a página nem virar 500.
  const filtros = schemaFiltros.safeParse(params).data ?? schemaFiltros.parse({});

  const where: Prisma.MembershipWhereInput = {
    tenantId: ctx.tenant.id,
    ...(filtros.papel !== "TODOS" ? { papel: filtros.papel } : {}),
    ...(filtros.situacao === "ativos" ? { ativo: true } : {}),
    ...(filtros.situacao === "inativos" ? { ativo: false } : {}),
  };

  const [vinculos, total, ativos, admins, tenant, celulas] = await Promise.all([
    prisma.membership.findMany({
      where,
      orderBy: [{ ativo: "desc" }, { papel: "asc" }, { criadoEm: "asc" }],
      skip: (filtros.pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      // `select` explícito e mesquinho. Um `include: { user: true }` traria
      // `senhaHash`, `tentativasFalhas` e `bloqueadoAte` para dentro do payload
      // do React Server Component — e daí para o HTML entregue ao navegador.
      select: {
        id: true,
        papel: true,
        ativo: true,
        criadoEm: true,
        celula: { select: { id: true, nome: true } },
        user: {
          select: {
            id: true,
            nome: true,
            email: true,
            ativo: true,
            ultimoLoginEm: true,
            emailVerificadoEm: true,
          },
        },
      },
    }),
    prisma.membership.count({ where }),
    prisma.membership.count({ where: { tenantId: ctx.tenant.id, ativo: true } }),
    prisma.membership.count({ where: { tenantId: ctx.tenant.id, papel: "ADMIN", ativo: true } }),
    prisma.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { limiteUsuarios: true },
    }),
    // Células vêm pelo cliente ESCOPADO: são dado de igreja.
    ctx.db.celula.findMany({
      where: { ativa: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true },
      take: 200,
    }),
  ]);

  const limiteUsuarios = tenant?.limiteUsuarios ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const podeGerenciar = ctx.pode("usuarios.gerenciar");

  /**
   * A lista de papéis concedíveis é calculada NO SERVIDOR e desce como prop.
   *
   * O componente cliente usa isto só para montar o `<select>`. A decisão de
   * verdade é repetida dentro de cada Server Action — um `<option>` a mais
   * inserido pelo DevTools não concede nada.
   */
  const papeisDisponiveis: Papel[] = podeGerenciar ? papeisAtribuiveis(ctx.papel) : [];

  const vagas = Math.max(0, limiteUsuarios - ativos);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Usuários e papéis</h1>
          <p className="painel__sub">
            Quem consegue abrir o painel desta igreja e até onde cada um enxerga.
          </p>
        </div>
      </div>

      <div className="cartoes" style={{ marginBottom: "2rem" }}>
        <Cartao rotulo="Acessos ativos" valor={ativos} nota={`Limite do plano: ${limiteUsuarios}`} />
        <Cartao
          rotulo="Vagas restantes"
          valor={vagas}
          nota={vagas === 0 ? "Desative quem não usa mais" : "Disponíveis para convite"}
          destaque={vagas === 0}
        />
        <Cartao
          rotulo="Administradores"
          valor={admins}
          nota={admins === 1 ? "Só um — considere um segundo" : "Com acesso total à igreja"}
          destaque={admins === 1}
        />
      </div>

      {admins === 1 && (
        <div className="alerta alerta--aviso" role="status" style={{ marginBottom: "1.6rem" }}>
          <strong>Existe apenas um administrador ativo.</strong> O sistema impede que ele seja
          rebaixado ou removido — senão a igreja ficaria trancada para fora do próprio painel. Ainda
          assim, promova uma segunda pessoa de confiança: se esta perder o acesso ao e-mail, só o
          suporte consegue destravar.
        </div>
      )}

      {podeGerenciar && (
        <ConviteUsuario
          papeisDisponiveis={papeisDisponiveis}
          celulas={celulas}
          vagasRestantes={vagas}
        />
      )}

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Equipe</h2>
        <p className="secao-painel__desc">
          {total.toLocaleString("pt-BR")} {total === 1 ? "vínculo" : "vínculos"} no recorte atual.
        </p>

        <div className="barra-ferramentas">
          <Chip href="/painel/usuarios" ativo={filtros.papel === "TODOS" && filtros.situacao === "TODOS"}>
            Todos
          </Chip>
          <Chip href="/painel/usuarios?situacao=ativos" ativo={filtros.situacao === "ativos"}>
            Ativos
          </Chip>
          <Chip href="/painel/usuarios?situacao=inativos" ativo={filtros.situacao === "inativos"}>
            Desativados
          </Chip>
          <Chip href="/painel/usuarios?papel=ADMIN" ativo={filtros.papel === "ADMIN"}>
            Administradores
          </Chip>
          <Chip href="/painel/usuarios?papel=LIDER_CELULA" ativo={filtros.papel === "LIDER_CELULA"}>
            Líderes de célula
          </Chip>
        </div>

        {vinculos.length === 0 ? (
          <div className="vazio">Nenhum usuário com esses filtros.</div>
        ) : (
          <ListaUsuarios
            usuarios={vinculos.map((v) => ({
              membershipId: v.id,
              userId: v.user.id,
              nome: v.user.nome,
              email: v.user.email,
              papel: v.papel,
              ativo: v.ativo,
              contaAtiva: v.user.ativo,
              emailVerificado: v.user.emailVerificadoEm !== null,
              celulaId: v.celula?.id ?? null,
              celulaNome: v.celula?.nome ?? null,
              desde: v.criadoEm.toLocaleDateString("pt-BR"),
              ultimoLogin: v.user.ultimoLoginEm
                ? v.user.ultimoLoginEm.toLocaleDateString("pt-BR")
                : null,
            }))}
            papeisDisponiveis={papeisDisponiveis}
            celulas={celulas}
            podeGerenciar={podeGerenciar}
            /* Marca a própria linha: o componente desabilita as ações nela, e a
               Server Action recusa de novo no servidor. */
            meuUserId={ctx.sessao.userId}
            /* Quando só existe um admin ativo, a UI já explica por que os
               controles daquela linha estão travados, em vez de deixar a pessoa
               clicar e receber um erro. */
            adminsAtivos={admins}
          />
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
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">O que cada papel enxerga</h2>
        <p className="secao-painel__desc">
          A regra vale para o sistema inteiro, não só para o menu: esconder um item de tela não é
          controle de acesso. Cada página e cada ação reconfere a permissão no servidor.
        </p>

        <div className="tabela-wrap">
          <table className="tabela">
            <thead>
              <tr>
                <th>Papel</th>
                <th>Alcance</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="etiqueta etiqueta--urgente">Administrador</span>
                </td>
                <td>
                  Tudo dentro da igreja: usuários, configurações, auditoria, exclusão de dados e
                  LGPD.
                </td>
              </tr>
              <tr>
                <td>
                  <span className="etiqueta etiqueta--andamento">Pastor</span>
                </td>
                <td>
                  Gestão pastoral completa, incluindo observações pastorais e o site. Não mexe em
                  usuários nem em configurações.
                </td>
              </tr>
              <tr>
                <td>
                  <span className="etiqueta etiqueta--novo">Secretaria</span>
                </td>
                <td>
                  Cadastros, triagem, agenda e cursos. Sem acesso a observações pastorais, usuários
                  ou site.
                </td>
              </tr>
              <tr>
                <td>
                  <span className="etiqueta etiqueta--concluido">Líder de célula</span>
                </td>
                <td>
                  Somente a própria célula: as pessoas dela e o registro dos encontros. Não enxerga o
                  resto da igreja.
                </td>
              </tr>
              <tr>
                <td>
                  <span className="etiqueta etiqueta--spam">Membro</span>
                </td>
                <td>
                  Não abre o painel de gestão. Usa o aplicativo e vê apenas os próprios dados.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function linkPagina(filtros: z.infer<typeof schemaFiltros>, pagina: number): string {
  const query = new URLSearchParams();
  if (filtros.papel !== "TODOS") query.set("papel", filtros.papel);
  if (filtros.situacao !== "TODOS") query.set("situacao", filtros.situacao);
  query.set("pagina", String(pagina));
  return `/painel/usuarios?${query.toString()}`;
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className="filtro-chip" aria-pressed={ativo}>
      {children}
    </a>
  );
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
