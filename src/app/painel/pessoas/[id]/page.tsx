import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao, filtrarCamposSensiveis, filtroDeEscopo } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { id as idSchema } from "@/lib/validation/comum";
import { FormularioPessoa } from "@/components/painel/FormularioPessoa";
import { HistoricoInteracoes, type ItemInteracao } from "@/components/painel/HistoricoInteracoes";
import { TransferenciaCelula } from "@/components/painel/TransferenciaCelula";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha da pessoa" };

/**
 * Ficha completa de uma pessoa.
 *
 * TRÊS RECORTES SE SOMAM AQUI
 *   1. Tenant  — o `ctx.db` confina tudo à igreja do hostname.
 *   2. Papel   — `filtroDeEscopo()` prende o líder de célula à célula dele.
 *   3. Campo   — `filtrarCamposSensiveis()` tira as observações pastorais de
 *                quem não tem `pessoas.lerSensivel`.
 *
 * O terceiro é o menos óbvio e o mais fácil de fazer errado. Ver o comentário
 * no ponto em que ele é aplicado.
 */
export default async function FichaPessoa({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("pessoas.ler");
  const { id: idBruto } = await params;

  // Valida o FORMATO antes de consultar: um valor absurdo vira 404 e não uma
  // exceção do Prisma vazando nome de coluna na tela de erro.
  const parse = idSchema.safeParse(idBruto);
  if (!parse.success) notFound();
  const id = parse.data;

  const registro = await ctx.db.pessoa.findFirst({
    where: { id, excluidoEm: null, ...filtroDeEscopo(ctx) },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      dataNascimento: true,
      genero: true,
      estadoCivil: true,
      status: true,
      origem: true,
      cep: true,
      logradouro: true,
      numero: true,
      complemento: true,
      bairro: true,
      cidade: true,
      uf: true,
      dataConversao: true,
      batizado: true,
      dataBatismo: true,
      igrejaAnterior: true,
      observacoesPastorais: true,
      consentimentoLgpd: true,
      consentimentoEm: true,
      consentimentoOrigem: true,
      criadoEm: true,
      atualizadoEm: true,
      celulaId: true,
      campusId: true,
      celula: { select: { id: true, nome: true, bairro: true, liderNome: true } },
      campus: { select: { id: true, nome: true } },
      userId: true,
    },
  });

  if (!registro) notFound();

  /**
   * O FILTRO DE CAMPO SENSÍVEL ACONTECE AQUI, NO SERVIDOR, ANTES DE RENDERIZAR.
   *
   * Por quê não basta esconder no JSX: em RSC, tudo que entra na árvore é
   * serializado no payload que vai para o navegador. Um `{pode && <p>{obs}</p>}`
   * ainda mandaria o texto pelo fio em vários cenários — e num componente
   * cliente ele apareceria cru nas props, visível no DevTools ou salvando o
   * HTML. Filtrar no objeto, antes de qualquer JSX, é o que garante que a
   * observação pastoral simplesmente não sai do servidor para quem não pode
   * lê-la. A tela é consequência do dado, nunca o contrário.
   */
  const pessoa = filtrarCamposSensiveis(ctx, registro);

  const [interacoes, batismos, matriculas, celulas, campi] = await Promise.all([
    ctx.db.interacao.findMany({
      where: { pessoaId: pessoa.id },
      orderBy: { criadoEm: "desc" },
      take: 50, // teto: uma ficha de 10 anos não pode virar uma página de 5 MB
      select: { id: true, tipo: true, descricao: true, autorNome: true, criadoEm: true },
    }),
    ctx.db.solicitacaoBatismo.findMany({
      where: { pessoaId: pessoa.id },
      orderBy: { criadoEm: "desc" },
      take: 10,
      select: { id: true, status: true, criadoEm: true, dataBatismo: true, turmaPreparatoria: true },
    }),
    ctx.db.matricula.findMany({
      where: { pessoaId: pessoa.id },
      orderBy: { criadoEm: "desc" },
      take: 20,
      select: { id: true, status: true, criadoEm: true, curso: { select: { nome: true } } },
    }),
    ctx.pode("pessoas.editar")
      ? ctx.db.celula.findMany({
          where: { ativa: true },
          select: { id: true, nome: true, bairro: true },
          orderBy: { nome: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    ctx.pode("pessoas.editar")
      ? ctx.db.campus.findMany({
          where: { ativo: true },
          select: { id: true, nome: true },
          orderBy: [{ ordem: "asc" }, { nome: "asc" }],
          take: 50,
        })
      : Promise.resolve([]),
  ]);

  // Abrir a ficha é acesso a dado pessoal completo: endereço, telefone,
  // jornada de fé. Fica registrado, inclusive se veio com o campo sensível.
  await auditar(ctx, {
    acao: "pessoa.ler",
    alvoTipo: "Pessoa",
    alvoId: pessoa.id,
    detalhes: { comObservacoesPastorais: ctx.pode("pessoas.lerSensivel") },
  });

  const idade = calcularIdade(pessoa.dataNascimento);
  const endereco = montarEndereco(pessoa);

  const itensHistorico: ItemInteracao[] = interacoes.map((i) => ({
    id: i.id,
    tipo: i.tipo,
    descricao: i.descricao,
    autor: i.autorNome ?? "Equipe",
    quando: formatarDataHora(i.criadoEm),
  }));

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/pessoas" className="link" style={{ fontSize: ".72rem" }}>
              ← Pessoas
            </Link>
          </p>
          <h1 className="painel__titulo">{pessoa.nome}</h1>
          <p className="painel__sub">
            <span className={`etiqueta etiqueta--${classeStatus(pessoa.status)}`}>
              {rotuloStatus(pessoa.status)}
            </span>
            {pessoa.batizado && (
              <span className="etiqueta etiqueta--concluido" style={{ marginLeft: ".5rem" }}>
                Batizado
              </span>
            )}
            {pessoa.userId && (
              <span className="etiqueta etiqueta--andamento" style={{ marginLeft: ".5rem" }}>
                Usa o app
              </span>
            )}
            <span style={{ marginLeft: ".7rem" }}>
              Cadastrada em {formatarCarimbo(pessoa.criadoEm)} · via {rotuloOrigem(pessoa.origem)}
            </span>
          </p>
        </div>
      </div>

      {!pessoa.consentimentoLgpd && (
        <div className="alerta alerta--aviso" role="note" style={{ marginBottom: "1.5rem" }}>
          <strong>Sem consentimento LGPD registrado.</strong> Esta ficha não tem autorização
          registrada para contato e tratamento de dados. Registre-a na próxima conversa antes de
          incluir esta pessoa em comunicações da igreja.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ------------------------------------------------ COLUNA PRINCIPAL */}
        <div>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Dados pessoais</h2>
            <dl style={{ display: "grid", gap: "1.1rem", margin: 0 }}>
              <Linha rotulo="Telefone" valor={pessoa.telefone} />
              <Linha rotulo="E-mail" valor={pessoa.email} />
              <Linha
                rotulo="Nascimento"
                valor={
                  pessoa.dataNascimento
                    ? `${formatarDataPura(pessoa.dataNascimento)}${idade !== null ? ` · ${idade} anos` : ""}`
                    : null
                }
              />
              <Linha rotulo="Gênero" valor={rotuloGenero(pessoa.genero)} />
              <Linha rotulo="Estado civil" valor={rotuloEstadoCivil(pessoa.estadoCivil)} />
              <Linha rotulo="Endereço" valor={endereco} />
            </dl>
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Jornada de fé</h2>
            <dl style={{ display: "grid", gap: "1.1rem", margin: 0 }}>
              <Linha
                rotulo="Conversão"
                valor={pessoa.dataConversao ? formatarDataPura(pessoa.dataConversao) : null}
              />
              <Linha
                rotulo="Batismo nas águas"
                valor={
                  pessoa.batizado
                    ? pessoa.dataBatismo
                      ? `Sim, em ${formatarDataPura(pessoa.dataBatismo)}`
                      : "Sim, data não registrada"
                    : "Ainda não"
                }
              />
              <Linha rotulo="Igreja anterior" valor={pessoa.igrejaAnterior} />
              <Linha
                rotulo="Consentimento LGPD"
                valor={
                  pessoa.consentimentoLgpd
                    ? `Autorizado${pessoa.consentimentoEm ? ` em ${formatarCarimbo(pessoa.consentimentoEm)}` : ""}${
                        pessoa.consentimentoOrigem ? ` · origem: ${pessoa.consentimentoOrigem}` : ""
                      }`
                    : "Não registrado"
                }
              />
            </dl>
          </section>

          {/*
            A seção só existe quando há conteúdo E quando quem lê tem permissão.
            Como o campo já foi zerado por `filtrarCamposSensiveis`, esta
            condição nunca é verdadeira para quem não pode — a checagem de
            permissão real já aconteceu lá em cima, na consulta.
          */}
          {pessoa.observacoesPastorais && (
            <section className="secao-painel" style={{ borderColor: "var(--gold-line)" }}>
              <h2 className="secao-painel__titulo">Observações pastorais</h2>
              <p className="secao-painel__desc">
                Conteúdo restrito. Sua leitura fica registrada na auditoria da igreja.
              </p>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
                {pessoa.observacoesPastorais}
              </p>
            </section>
          )}

          <HistoricoInteracoes
            pessoaId={pessoa.id}
            itens={itensHistorico}
            podeRegistrar={ctx.pode("pessoas.ler")}
          />

          {ctx.pode("pessoas.editar") && (
            <section className="secao-painel">
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Editar cadastro</summary>
                <div style={{ marginTop: "1.4rem" }}>
                  <FormularioPessoa
                    modo="editar"
                    pessoaId={pessoa.id}
                    celulas={celulas}
                    campi={campi}
                    podeEditarSensivel={ctx.pode("pessoas.lerSensivel")}
                    podeExcluir={ctx.pode("pessoas.excluir")}
                    inicial={{
                      nome: pessoa.nome,
                      email: pessoa.email ?? "",
                      telefone: pessoa.telefone ?? "",
                      dataNascimento: paraInputData(pessoa.dataNascimento),
                      genero: pessoa.genero,
                      estadoCivil: pessoa.estadoCivil,
                      status: pessoa.status,
                      cep: pessoa.cep ?? "",
                      logradouro: pessoa.logradouro ?? "",
                      numero: pessoa.numero ?? "",
                      complemento: pessoa.complemento ?? "",
                      bairro: pessoa.bairro ?? "",
                      cidade: pessoa.cidade ?? "",
                      uf: pessoa.uf ?? "",
                      dataConversao: paraInputData(pessoa.dataConversao),
                      batizado: pessoa.batizado,
                      dataBatismo: paraInputData(pessoa.dataBatismo),
                      igrejaAnterior: pessoa.igrejaAnterior ?? "",
                      celulaId: pessoa.celulaId ?? "",
                      campusId: pessoa.campusId ?? "",
                      observacoesPastorais: pessoa.observacoesPastorais ?? "",
                      consentimentoLgpd: pessoa.consentimentoLgpd,
                    }}
                  />
                </div>
              </details>
            </section>
          )}
        </div>

        {/* ------------------------------------------------------ COLUNA LATERAL */}
        <div>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Célula
            </h2>
            {pessoa.celula ? (
              <p style={{ marginTop: ".6rem" }}>
                <Link href={`/painel/celulas/${pessoa.celula.id}`} style={{ fontWeight: 600 }}>
                  {pessoa.celula.nome}
                </Link>
                <span className="dim" style={{ display: "block", fontSize: ".82rem", marginTop: ".25rem" }}>
                  {[pessoa.celula.bairro, pessoa.celula.liderNome].filter(Boolean).join(" · ") || "—"}
                </span>
              </p>
            ) : (
              <p className="dim" style={{ marginTop: ".6rem", fontSize: ".88rem" }}>
                Ainda não está em nenhuma célula.
              </p>
            )}

            {pessoa.campus && (
              <p className="dim" style={{ marginTop: ".8rem", fontSize: ".82rem" }}>
                Campus: {pessoa.campus.nome}
              </p>
            )}

            {ctx.pode("pessoas.editar") && (
              <TransferenciaCelula
                pessoaId={pessoa.id}
                celulaAtualId={pessoa.celulaId}
                celulas={celulas}
              />
            )}
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Batismos
            </h2>
            {batismos.length === 0 ? (
              <p className="dim" style={{ marginTop: ".6rem", fontSize: ".88rem" }}>
                Nenhuma solicitação registrada.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: ".9rem 0 0", padding: 0, display: "grid", gap: ".8rem" }}>
                {batismos.map((b) => (
                  <li key={b.id}>
                    <Link href={`/painel/batismos/${b.id}`} style={{ fontWeight: 600 }}>
                      Solicitação de {formatarCarimbo(b.criadoEm)}
                    </Link>
                    <span className="dim" style={{ display: "block", fontSize: ".8rem", marginTop: ".2rem" }}>
                      {rotuloStatusBatismo(b.status)}
                      {b.dataBatismo ? ` · ${formatarAgendamento(b.dataBatismo)}` : ""}
                      {b.turmaPreparatoria ? ` · turma ${b.turmaPreparatoria}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Escola
            </h2>
            {matriculas.length === 0 ? (
              <p className="dim" style={{ marginTop: ".6rem", fontSize: ".88rem" }}>
                Nenhuma matrícula.
              </p>
            ) : (
              <ul style={{ listStyle: "none", margin: ".9rem 0 0", padding: 0, display: "grid", gap: ".8rem" }}>
                {matriculas.map((m) => (
                  <li key={m.id}>
                    <strong style={{ fontSize: ".9rem" }}>{m.curso.nome}</strong>
                    <span className="dim" style={{ display: "block", fontSize: ".8rem", marginTop: ".2rem" }}>
                      {rotuloStatusMatricula(m.status)} · desde {formatarCarimbo(m.criadoEm)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Apresentação
// -----------------------------------------------------------------------------

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="cartao__rotulo">{rotulo}</dt>
      <dd style={{ margin: ".3rem 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{valor}</dd>
    </div>
  );
}

/**
 * Colunas `@db.Date` (nascimento, conversão, batismo) são gravadas à
 * meia-noite UTC. Formatá-las no fuso de São Paulo (UTC-3) mostraria o DIA
 * ANTERIOR — um aniversário 15/03 viraria 14/03. Por isso data pura é UTC.
 */
function formatarDataPura(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(data);
}

/** Timestamps reais (criadoEm, consentimentoEm) no fuso da igreja: um cadastro
 *  feito às 22h não pode aparecer com a data do dia seguinte. */
function formatarCarimbo(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

/** Fixar o fuso evita que o resultado mude conforme a máquina que renderiza. */
function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(data);
}

/** Agendamento de batismo é gravado e exibido em UTC — ver batismos/acoes.ts. */
function formatarAgendamento(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(data);
}

function paraInputData(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10) : "";
}

function calcularIdade(nascimento: Date | null): number | null {
  if (!nascimento) return null;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const mes = hoje.getUTCMonth() - nascimento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < nascimento.getUTCDate())) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

function montarEndereco(p: {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}): string | null {
  const linha1 = [p.logradouro, p.numero].filter(Boolean).join(", ");
  const linha2 = [p.complemento, p.bairro].filter(Boolean).join(" · ");
  const linha3 = [[p.cidade, p.uf].filter(Boolean).join("/"), p.cep].filter(Boolean).join(" · ");
  const partes = [linha1, linha2, linha3].filter((l) => l.length > 0);
  return partes.length > 0 ? partes.join("\n") : null;
}

function rotuloStatus(s: string): string {
  const mapa: Record<string, string> = {
    VISITANTE: "Visitante",
    EM_ACOMPANHAMENTO: "Em acompanhamento",
    CONGREGANTE: "Congregante",
    MEMBRO: "Membro",
    INATIVO: "Inativo",
    TRANSFERIDO: "Transferido",
  };
  return mapa[s] ?? s;
}

function classeStatus(s: string): string {
  if (s === "MEMBRO") return "novo";
  if (s === "VISITANTE" || s === "EM_ACOMPANHAMENTO") return "andamento";
  return "concluido";
}

function rotuloGenero(g: string): string | null {
  const mapa: Record<string, string> = { MASCULINO: "Masculino", FEMININO: "Feminino" };
  return mapa[g] ?? null;
}

function rotuloEstadoCivil(e: string): string | null {
  const mapa: Record<string, string> = {
    SOLTEIRO: "Solteiro(a)",
    CASADO: "Casado(a)",
    DIVORCIADO: "Divorciado(a)",
    VIUVO: "Viúvo(a)",
    UNIAO_ESTAVEL: "União estável",
  };
  return mapa[e] ?? null;
}

function rotuloOrigem(o: string): string {
  const mapa: Record<string, string> = {
    SITE: "site",
    APP: "aplicativo",
    PAINEL: "painel",
    IMPORTACAO: "importação",
    CELULA: "célula",
  };
  return mapa[o] ?? o.toLowerCase();
}

function rotuloStatusBatismo(s: string): string {
  const mapa: Record<string, string> = {
    SOLICITADO: "Solicitado",
    EM_PREPARO: "Em preparo",
    APROVADO: "Aprovado",
    AGENDADO: "Agendado",
    REALIZADO: "Realizado",
    RECUSADO: "Recusado",
    CANCELADO: "Cancelado",
  };
  return mapa[s] ?? s;
}

function rotuloStatusMatricula(s: string): string {
  const mapa: Record<string, string> = {
    INSCRITO: "Inscrito",
    CONFIRMADO: "Confirmado",
    CURSANDO: "Cursando",
    CONCLUIDO: "Concluído",
    CANCELADO: "Cancelado",
  };
  return mapa[s] ?? s;
}
