import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPlataformaAdmin } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { tenantDb } from "@/lib/db/tenant-client";
import { env } from "@/lib/env";
import { id as idSchema } from "@/lib/validation/comum";
import { ControlesIgreja } from "@/components/plataforma/ControlesIgreja";
import { DominiosDaIgreja, type DominioListado } from "@/components/plataforma/DominiosDaIgreja";
import { ModulosDaIgreja } from "@/components/plataforma/ModulosDaIgreja";
import { carregarModulosPorTenant } from "@/lib/services/modulos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Igreja" };

/**
 * Detalhe de uma igreja: contrato, uso, usuários, domínios e suporte.
 *
 * O QUE ESTA TELA MOSTRA — E O LIMITE QUE ELA RESPEITA
 * Números agregados e metadados de conta. Quantas pessoas existem, sim; QUEM
 * são elas, não. Quantos pedidos de oração chegaram, sim; o que dizem, jamais.
 *
 * Essa fronteira é o ponto inteiro do desenho: poder técnico de ler tudo não é
 * razão para construir a tela que exibe tudo. Para ver o conteúdo existe um
 * caminho só, e ele é caro de propósito — a sessão de suporte, com faixa
 * vermelha permanente e registro na auditoria da própria igreja.
 */
export default async function DetalheIgreja({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPlataformaAdmin();

  // O `id` vem da URL, ou seja, é entrada não confiável. Validamos o FORMATO
  // antes de encostar no banco: além de recusar lixo cedo, evita que uma
  // string arbitrária vire parte de uma consulta.
  const { id: idBruto } = await params;
  const analise = idSchema.safeParse(idBruto);
  if (!analise.success) notFound();
  const tenantId = analise.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      slug: true,
      nome: true,
      razaoSocial: true,
      cnpj: true,
      status: true,
      plano: true,
      trialExpiraEm: true,
      limiteUsuarios: true,
      limitePessoas: true,
      limiteStorageMb: true,
      criadoEm: true,
      excluidoEm: true,
      dominios: {
        orderBy: [{ principal: "desc" }, { criadoEm: "asc" }],
        select: {
          id: true,
          hostname: true,
          status: true,
          principal: true,
          verificadoEm: true,
          ultimoErro: true,
        },
      },
      membros: {
        orderBy: { criadoEm: "asc" },
        take: 100,
        select: {
          id: true,
          papel: true,
          ativo: true,
          criadoEm: true,
          user: {
            // `senhaHash` NUNCA entra num select. Não é só boa prática: o
            // objeto serializado desta página vai para o navegador, então
            // qualquer campo trazido aqui é um campo publicado.
            select: { id: true, nome: true, email: true, ativo: true, ultimoLoginEm: true },
          },
        },
      },
    },
  });

  if (!tenant) notFound();

  const [uso, sessoesSuporteAbertas, sessoesAtivas, modulos] = await Promise.all([
    contarUso(tenant.id),
    prisma.sessao.count({
      where: {
        userId: sessao.userId,
        impersonadoPor: { not: null },
        revogadaEm: null,
        expiraEm: { gt: new Date() },
      },
    }),
    prisma.sessao.count({
      where: { tenantAtivoId: tenant.id, revogadaEm: null, expiraEm: { gt: new Date() } },
    }),
    carregarModulosPorTenant(tenant.id),
  ]);

  const dominios: DominioListado[] = tenant.dominios.map((dominio) => ({
    id: dominio.id,
    hostname: dominio.hostname,
    status: dominio.status,
    principal: dominio.principal,
    verificadoEm: dominio.verificadoEm?.toLocaleString("pt-BR") ?? null,
    ultimoErro: dominio.ultimoErro,
  }));

  const hostSubdominio = `${tenant.slug}.${env.ROOT_DOMAIN}`;
  const storageUsadoMb = Math.round((uso.storageBytes / (1024 * 1024)) * 10) / 10;

  return (
    <>
      <div className="painel__topo">
        <div>
          <p className="eyebrow">Igreja</p>
          <h1 className="painel__titulo">{tenant.nome}</h1>
          <p className="painel__sub">
            {hostSubdominio} · cliente desde {tenant.criadoEm.toLocaleDateString("pt-BR")}
            {tenant.trialExpiraEm && tenant.status === "TRIAL" && (
              <> · avaliação até {tenant.trialExpiraEm.toLocaleDateString("pt-BR")}</>
            )}
          </p>
        </div>
        <Link href="/plataforma/igrejas" className="btn btn--sm btn--ghost">
          Voltar
        </Link>
      </div>

      {tenant.excluidoEm && (
        <div className="alerta alerta--erro" role="alert" style={{ marginBottom: "1.5rem" }}>
          Esta igreja está marcada para exclusão desde {tenant.excluidoEm.toLocaleDateString("pt-BR")}.
          O endereço dela não resolve mais. Reative a situação para trazê-la de volta.
        </div>
      )}

      <div className="cartoes" style={{ marginBottom: "2.5rem" }}>
        <Cartao
          rotulo="Usuários"
          valor={`${uso.usuarios} / ${tenant.limiteUsuarios}`}
          nota={proporcaoNota(uso.usuarios, tenant.limiteUsuarios)}
          destaque={uso.usuarios >= tenant.limiteUsuarios * 0.85}
        />
        <Cartao
          rotulo="Pessoas"
          valor={`${uso.pessoas.toLocaleString("pt-BR")} / ${tenant.limitePessoas.toLocaleString("pt-BR")}`}
          nota={proporcaoNota(uso.pessoas, tenant.limitePessoas)}
          destaque={uso.pessoas >= tenant.limitePessoas * 0.85}
        />
        <Cartao
          rotulo="Armazenamento"
          valor={`${storageUsadoMb} MB / ${tenant.limiteStorageMb} MB`}
          nota={`${uso.arquivos.toLocaleString("pt-BR")} arquivos`}
          destaque={storageUsadoMb >= tenant.limiteStorageMb * 0.85}
        />
        <Cartao rotulo="Sessões abertas" valor={String(sessoesAtivas)} nota="Nesta igreja, agora" />
      </div>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Uso do produto</h2>
        <p className="secao-painel__desc">
          Contagens, e apenas contagens. Elas respondem se a igreja está usando o sistema sem abrir
          nada do que há dentro dele.
        </p>

        <div className="cartoes">
          <Cartao rotulo="Na caixa de entrada" valor={String(uso.submissoesNovas)} nota="Aguardando triagem" />
          <Cartao rotulo="Pedidos de oração" valor={String(uso.oracoes)} nota="Total recebido" />
          <Cartao rotulo="Células" valor={String(uso.celulas)} nota="Ativas" />
          <Cartao rotulo="Páginas do site" valor={String(uso.paginas)} nota="Publicadas e rascunhos" />
        </div>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Dados cadastrais</h2>
        <dl className="grid cols-3" style={{ gap: "1.2rem" }}>
          <Dado rotulo="Endereço da plataforma" valor={hostSubdominio} />
          <Dado rotulo="Razão social" valor={tenant.razaoSocial ?? "—"} />
          <Dado rotulo="CNPJ" valor={tenant.cnpj ?? "—"} />
          <Dado rotulo="Plano" valor={tenant.plano} />
          <Dado rotulo="Situação" valor={tenant.status} />
          <Dado
            rotulo="Avaliação expira"
            valor={tenant.trialExpiraEm?.toLocaleDateString("pt-BR") ?? "—"}
          />
        </dl>
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Usuários</h2>
        <p className="secao-painel__desc">
          Contas com vínculo nesta igreja. O papel é a fonte da verdade da autorização — quem
          gerencia essa lista é o ADMIN da própria igreja, no painel dela.
        </p>

        {tenant.membros.length === 0 ? (
          <div className="vazio">Nenhum usuário vinculado.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Papel</th>
                  <th>Último acesso</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {tenant.membros.map((membro) => (
                  <tr key={membro.id}>
                    <td style={{ fontWeight: 600 }}>{membro.user.nome}</td>
                    <td style={{ fontSize: ".85rem", color: "var(--graphite-dim)" }}>{membro.user.email}</td>
                    <td>
                      <span className="etiqueta etiqueta--concluido">{membro.papel}</span>
                    </td>
                    <td style={{ fontSize: ".82rem" }}>
                      {membro.user.ultimoLoginEm?.toLocaleString("pt-BR") ?? "nunca"}
                    </td>
                    <td>
                      {membro.ativo && membro.user.ativo ? (
                        <span className="etiqueta etiqueta--novo">Ativo</span>
                      ) : (
                        <span className="etiqueta etiqueta--spam">Inativo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Módulos (gavetas)</h2>
        <p className="secao-painel__desc">Ligue só o que esta igreja contratou — site, app, Louvor, Kids, Financeiro… Ao ligar, a área aparece e se conecta ao resto.</p>
        <ModulosDaIgreja tenantId={tenant.id} modulos={modulos} />
      </section>

      <DominiosDaIgreja tenantId={tenant.id} hostSubdominio={hostSubdominio} dominios={dominios} />

      <ControlesIgreja
        tenantId={tenant.id}
        slug={tenant.slug}
        nome={tenant.nome}
        status={tenant.status}
        plano={tenant.plano}
        limiteUsuarios={tenant.limiteUsuarios}
        limitePessoas={tenant.limitePessoas}
        limiteStorageMb={tenant.limiteStorageMb}
        sessoesSuporteAbertas={sessoesSuporteAbertas}
      />
    </>
  );
}

/**
 * Contagens de uso de UMA igreja.
 *
 * POR QUE O SUPER ADMIN TAMBÉM PASSA PELO CLIENTE ESCOPADO
 * Poderíamos escrever `prisma.pessoa.count({ where: { tenantId } })` — o
 * resultado seria o mesmo hoje. Passamos por `tenantDb(id)` por três razões:
 *
 *  1. Um `where` esquecido aqui devolveria a contagem da plataforma INTEIRA
 *     exibida como se fosse de uma igreja. O erro seria silencioso e a tela
 *     continuaria plausível. Com o cliente escopado, esquecer o filtro é
 *     inofensivo: a extensão o injeta.
 *  2. Se o `id` vier adulterado e escapar da validação, a extensão ainda
 *     confina a consulta a um único tenant — nunca a vários.
 *  3. A regra "dado de igreja só sai por tenantDb" só é auditável se não tiver
 *     exceção. "Exceto para o super admin" é o tipo de exceção que alguém
 *     copia para um lugar onde ela não vale.
 */
async function contarUso(tenantId: string) {
  const db = tenantDb(tenantId);

  const [usuarios, pessoas, submissoesNovas, oracoes, celulas, paginas, arquivos] =
    await Promise.all([
      // Membership é GLOBAL (não tem tenantId como dado de igreja, é o vínculo
      // em si), então esta contagem usa o cliente base — corretamente.
      prisma.membership.count({ where: { tenantId, ativo: true } }),
      db.pessoa.count({ where: { excluidoEm: null } }),
      db.submissao.count({ where: { status: "NOVO" } }),
      db.pedidoOracao.count(),
      db.celula.count({ where: { ativa: true } }),
      db.sitePagina.count(),
      db.arquivo.aggregate({ _count: { _all: true }, _sum: { tamanhoBytes: true } }),
    ]);

  return {
    usuarios,
    pessoas,
    submissoesNovas,
    oracoes,
    celulas,
    paginas,
    arquivos: arquivos._count._all,
    storageBytes: arquivos._sum.tamanhoBytes ?? 0,
  };
}

function proporcaoNota(atual: number, teto: number): string {
  if (teto <= 0) return "Sem teto definido";
  const percentual = Math.round((atual / teto) * 100);
  if (percentual >= 100) return "Limite atingido";
  if (percentual >= 85) return `${percentual}% do limite — avaliar upgrade`;
  return `${percentual}% do limite`;
}

function Cartao({
  rotulo,
  valor,
  nota,
  destaque,
}: {
  rotulo: string;
  valor: string;
  nota: string;
  destaque?: boolean;
}) {
  return (
    <div className={`cartao${destaque ? " cartao--destaque" : ""}`}>
      <span className="cartao__rotulo">{rotulo}</span>
      <span className="cartao__valor" style={{ fontSize: "1.5rem" }}>
        {valor}
      </span>
      <span className="cartao__nota">{nota}</span>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="cartao__rotulo">{rotulo}</dt>
      <dd style={{ marginTop: ".3rem", fontSize: ".95rem" }}>{valor}</dd>
    </div>
  );
}
