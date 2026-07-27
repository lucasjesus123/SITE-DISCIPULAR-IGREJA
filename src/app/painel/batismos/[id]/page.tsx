import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { id as idSchema } from "@/lib/validation/comum";
import { AcoesBatismo } from "@/components/painel/AcoesBatismo";
import {
  classeStatus,
  ehMenorDeIdade,
  formatarAgendamento,
  formatarCarimbo,
  formatarDataPura,
  rotuloStatus,
} from "@/app/painel/batismos/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Solicitação de batismo" };

/**
 * Detalhe de uma solicitação de batismo.
 *
 * Aqui aparece o testemunho — texto em que a pessoa conta a própria conversão,
 * às vezes com abuso, vício, perda e crise familiar no meio. É dado pessoal
 * sensível. Por isso a abertura desta tela é auditada individualmente, e o
 * testemunho não aparece em nenhuma listagem.
 */
export default async function DetalheBatismo({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await exigirPermissao("batismos.ler");
  const { id: idBruto } = await params;

  const parse = idSchema.safeParse(idBruto);
  if (!parse.success) notFound();

  // Escopado ao tenant pelo `ctx.db`: um ID de outra igreja não existe aqui.
  const solicitacao = await ctx.db.solicitacaoBatismo.findFirst({
    where: { id: parse.data },
    select: {
      id: true,
      nome: true,
      email: true,
      telefone: true,
      dataNascimento: true,
      status: true,
      respostas: true,
      menorIdade: true,
      responsavelNome: true,
      responsavelTelefone: true,
      autorizacaoResponsavel: true,
      turmaPreparatoria: true,
      dataBatismo: true,
      campusId: true,
      observacoes: true,
      motivoRecusa: true,
      criadoEm: true,
      atualizadoEm: true,
      pessoa: { select: { id: true, nome: true, status: true, batizado: true } },
      campus: { select: { id: true, nome: true } },
    },
  });

  if (!solicitacao) notFound();

  const campi = ctx.pode("batismos.aprovar")
    ? await ctx.db.campus.findMany({
        where: { ativo: true },
        select: { id: true, nome: true },
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        take: 50,
      })
    : [];

  await auditar(ctx, {
    acao: "batismo.ler",
    alvoTipo: "SolicitacaoBatismo",
    alvoId: solicitacao.id,
    detalhes: { status: solicitacao.status },
  });

  const idade = calcularIdade(solicitacao.dataNascimento);
  const menorPelaData = ehMenorDeIdade(solicitacao.dataNascimento);
  const menor = solicitacao.menorIdade || menorPelaData;
  const travado = menor && !solicitacao.autorizacaoResponsavel;

  const campos = normalizarRespostas(solicitacao.respostas);
  const testemunho = extrairTexto(solicitacao.respostas, "testemunho");

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/batismos" className="link" style={{ fontSize: ".72rem" }}>
              ← Batismos
            </Link>
          </p>
          <h1 className="painel__titulo">{solicitacao.nome}</h1>
          <p className="painel__sub">
            <span className={`etiqueta etiqueta--${classeStatus(solicitacao.status)}`}>
              {rotuloStatus(solicitacao.status)}
            </span>
            <span style={{ marginLeft: ".7rem" }}>
              Solicitado em {formatarCarimbo(solicitacao.criadoEm)}
              {idade !== null ? ` · ${idade} anos` : ""}
            </span>
          </p>
        </div>
      </div>

      {travado && (
        <div className="alerta alerta--erro" role="note" style={{ marginBottom: "1.5rem" }}>
          <strong>Menor de idade sem autorização do responsável.</strong>{" "}
          {menorPelaData && !solicitacao.menorIdade
            ? "A data de nascimento informada indica menos de 18 anos, ainda que o formulário não tenha sido marcado como de menor. "
            : ""}
          Aprovação, agendamento e registro do batismo estão bloqueados até a autorização ser
          registrada — é exigência legal, não preferência do sistema.
        </div>
      )}

      {solicitacao.status === "RECUSADO" && solicitacao.motivoRecusa && (
        <div className="alerta alerta--aviso" role="note" style={{ marginBottom: "1.5rem" }}>
          <strong>Solicitação recusada.</strong>
          <p style={{ marginTop: ".5rem", whiteSpace: "pre-wrap" }}>{solicitacao.motivoRecusa}</p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ------------------------------------------------ COLUNA PRINCIPAL */}
        <div>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo">Testemunho</h2>
            <p className="secao-painel__desc">
              Escrito pela própria pessoa. Sua leitura fica registrada na auditoria.
            </p>
            {testemunho ? (
              // `pre-wrap` preserva os parágrafos sem renderizar HTML: o React
              // escapa o conteúdo, então nada colado no formulário vira marcação.
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{testemunho}</p>
            ) : (
              <p className="dim">Sem testemunho registrado nesta solicitação.</p>
            )}
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo">O que foi respondido</h2>
            <dl style={{ display: "grid", gap: "1.1rem", margin: 0 }}>
              <Linha rotulo="Telefone" valor={solicitacao.telefone} />
              <Linha rotulo="E-mail" valor={solicitacao.email} />
              <Linha
                rotulo="Data de nascimento"
                valor={
                  solicitacao.dataNascimento ? formatarDataPura(solicitacao.dataNascimento) : null
                }
              />
              {campos.map((c) => (
                <Linha key={c.chave} rotulo={c.rotulo} valor={c.valor} />
              ))}
            </dl>
          </section>

          {solicitacao.observacoes && (
            <section className="secao-painel">
              <h2 className="secao-painel__titulo">Observações da equipe</h2>
              <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{solicitacao.observacoes}</p>
            </section>
          )}
        </div>

        {/* ------------------------------------------------------ COLUNA LATERAL */}
        <div>
          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Situação
            </h2>
            <dl style={{ display: "grid", gap: "1rem", margin: ".9rem 0 0" }}>
              <Linha
                rotulo="Data marcada"
                valor={
                  solicitacao.dataBatismo ? formatarAgendamento(solicitacao.dataBatismo) : "Sem data"
                }
              />
              <Linha rotulo="Campus" valor={solicitacao.campus?.nome ?? null} />
              <Linha rotulo="Turma preparatória" valor={solicitacao.turmaPreparatoria} />
            </dl>
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Menor de idade
            </h2>
            {menor ? (
              <dl style={{ display: "grid", gap: "1rem", margin: ".9rem 0 0" }}>
                <Linha rotulo="Responsável" valor={solicitacao.responsavelNome} />
                <Linha rotulo="Telefone do responsável" valor={solicitacao.responsavelTelefone} />
                <Linha
                  rotulo="Autorização"
                  valor={solicitacao.autorizacaoResponsavel ? "Registrada" : "Pendente"}
                />
              </dl>
            ) : (
              <p className="dim" style={{ marginTop: ".6rem", fontSize: ".88rem" }}>
                Maior de idade — não se aplica.
              </p>
            )}
          </section>

          <section className="secao-painel">
            <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
              Cadastro vinculado
            </h2>
            {solicitacao.pessoa ? (
              <p style={{ marginTop: ".6rem" }}>
                <Link href={`/painel/pessoas/${solicitacao.pessoa.id}`} style={{ fontWeight: 600 }}>
                  {solicitacao.pessoa.nome}
                </Link>
                <span className="dim" style={{ display: "block", fontSize: ".82rem", marginTop: ".25rem" }}>
                  {solicitacao.pessoa.batizado ? "Ficha já marca como batizado" : "Ficha ainda não marca batismo"}
                </span>
              </p>
            ) : (
              <p className="dim" style={{ marginTop: ".6rem", fontSize: ".88rem" }}>
                Esta solicitação não tem ficha vinculada. Vincule pela caixa de entrada para que o
                batismo entre no histórico da pessoa.
              </p>
            )}
          </section>

          {ctx.pode("batismos.aprovar") ? (
            <AcoesBatismo
              batismoId={solicitacao.id}
              status={solicitacao.status}
              menor={menor}
              autorizado={solicitacao.autorizacaoResponsavel}
              campi={campi}
              dataAtual={paraInputData(solicitacao.dataBatismo)}
              horaAtual={paraInputHora(solicitacao.dataBatismo)}
              turmaAtual={solicitacao.turmaPreparatoria ?? ""}
              campusAtualId={solicitacao.campusId ?? ""}
              responsavelNomeAtual={solicitacao.responsavelNome ?? ""}
              responsavelTelefoneAtual={solicitacao.responsavelTelefone ?? ""}
            />
          ) : (
            <div className="secao-painel" style={{ marginBottom: 0 }}>
              <p className="dim">Você tem acesso de leitura a esta solicitação.</p>
            </div>
          )}
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

function calcularIdade(nascimento: Date | null): number | null {
  if (!nascimento) return null;
  const hoje = new Date();
  let idade = hoje.getUTCFullYear() - nascimento.getUTCFullYear();
  const mes = hoje.getUTCMonth() - nascimento.getUTCMonth();
  if (mes < 0 || (mes === 0 && hoje.getUTCDate() < nascimento.getUTCDate())) idade -= 1;
  return idade >= 0 && idade < 130 ? idade : null;
}

function paraInputData(data: Date | null): string {
  return data ? data.toISOString().slice(0, 10) : "";
}

/** O agendamento é gravado em UTC (ver batismos/acoes.ts); a hora exibida no
 *  formulário vem da mesma referência, senão ela "andaria" a cada edição. */
function paraInputHora(data: Date | null): string {
  return data ? data.toISOString().slice(11, 16) : "";
}

const ROTULOS: Record<string, string> = {
  aceitouJesus: "Aceitou Jesus",
  dataConversao: "Data de conversão",
  jaFoiBatizado: "Já foi batizado antes",
  ondeFoiBatizado: "Onde foi batizado",
  participaCelula: "Participa de célula",
  menorIdade: "Menor de idade",
  responsavelNome: "Responsável",
  responsavelTelefone: "Telefone do responsável",
  autorizacaoResponsavel: "Responsável autoriza",
  observacoes: "Observações da pessoa",
};

/** Campos já exibidos em outro lugar, ou de controle interno. */
const OCULTOS = new Set([
  "nome",
  "email",
  "telefone",
  "dataNascimento",
  "testemunho",
  "consentimentoLgpd",
  "website",
  "_t",
  "celulaId",
  "campusId",
]);

function normalizarRespostas(dados: unknown): { chave: string; rotulo: string; valor: string }[] {
  if (typeof dados !== "object" || dados === null) return [];

  const saida: { chave: string; rotulo: string; valor: string }[] = [];

  for (const [chave, valor] of Object.entries(dados as Record<string, unknown>)) {
    if (OCULTOS.has(chave)) continue;
    if (valor === null || valor === undefined || valor === "" || valor === false) continue;

    let texto: string;
    if (typeof valor === "boolean") texto = "Sim";
    else if (Array.isArray(valor)) texto = valor.map(String).join(", ");
    else if (typeof valor === "object") continue;
    else texto = String(valor);

    // Teto de tamanho: um campo gigante (vindo de alguma versão antiga sem
    // limite) não pode travar a renderização da tela.
    saida.push({ chave, rotulo: ROTULOS[chave] ?? chave, valor: texto.slice(0, 5000) });
  }

  return saida;
}

function extrairTexto(dados: unknown, chave: string): string | null {
  if (typeof dados !== "object" || dados === null) return null;
  const valor = (dados as Record<string, unknown>)[chave];
  return typeof valor === "string" && valor.trim() !== "" ? valor.slice(0, 20_000) : null;
}
