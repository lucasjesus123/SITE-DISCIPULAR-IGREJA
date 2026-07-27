import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/rbac";
import { auditar } from "@/lib/audit";
import { id as idSchema } from "@/lib/validation/comum";
import { rotuloTipo } from "@/app/painel/page";
import { FormularioTriagem } from "@/components/painel/FormularioTriagem";

export const dynamic = "force-dynamic";
export const metadata = { title: "Triagem" };

/**
 * Detalhe de uma submissão + formulário de triagem.
 *
 * Esta é a tela onde o dado pessoal completo aparece: testemunho de batismo,
 * conteúdo de pedido de oração, endereço, telefone. Por isso a abertura é
 * auditada individualmente — se um dia alguém perguntar "quem leu o
 * testemunho da Maria?", a resposta existe.
 */
export default async function DetalheSubmissao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await exigirPermissao("submissoes.ler");
  const { id: idBruto } = await params;

  // Valida o formato do ID ANTES de consultar. Um valor absurdo vira 404,
  // não uma exceção do Prisma vazando o nome da coluna.
  const parse = idSchema.safeParse(idBruto);
  if (!parse.success) notFound();

  // Escopado ao tenant: um ID válido de outra igreja simplesmente não existe.
  const submissao = await ctx.db.submissao.findFirst({
    where: { id: parse.data },
    select: {
      id: true, tipo: true, status: true, nome: true, email: true, telefone: true,
      dados: true, origem: true, paginaOrigem: true, scoreSpam: true,
      notaInterna: true, pessoaGeradaId: true, consentimentoLgpd: true,
      criadoEm: true, processadoEm: true,
    },
  });

  if (!submissao) notFound();

  const [celulas, pessoaVinculada] = await Promise.all([
    ctx.db.celula.findMany({
      where: { ativa: true },
      select: { id: true, nome: true, bairro: true },
      orderBy: { nome: "asc" },
      take: 200,
    }),
    submissao.pessoaGeradaId
      ? ctx.db.pessoa.findFirst({
          where: { id: submissao.pessoaGeradaId },
          select: { id: true, nome: true, status: true },
        })
      : Promise.resolve(null),
  ]);

  await auditar(ctx, {
    acao: "submissao.ler",
    alvoTipo: "Submissao",
    alvoId: submissao.id,
    detalhes: { tipo: submissao.tipo },
  });

  const campos = normalizarCampos(submissao.dados);

  return (
    <>
      <div className="painel__topo">
        <div>
          <p style={{ marginBottom: ".6rem" }}>
            <Link href="/painel/caixa-entrada" className="link" style={{ fontSize: ".72rem" }}>
              ← Caixa de entrada
            </Link>
          </p>
          <h1 className="painel__titulo">{submissao.nome}</h1>
          <p className="painel__sub">
            {rotuloTipo(submissao.tipo)} · recebido em{" "}
            {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(
              submissao.criadoEm,
            )}{" "}
            · via {submissao.origem === "APP" ? "aplicativo" : "site"}
          </p>
        </div>
      </div>

      {submissao.scoreSpam >= 60 && (
        <div className="alerta alerta--aviso" style={{ marginBottom: "1.5rem" }} role="note">
          <strong>Possível spam.</strong> Esta submissão recebeu pontuação {submissao.scoreSpam} nas
          verificações automáticas. Confira antes de criar um cadastro a partir dela.
        </div>
      )}

      {!submissao.consentimentoLgpd && (
        <div className="alerta alerta--erro" style={{ marginBottom: "1.5rem" }} role="note">
          <strong>Sem consentimento LGPD.</strong> Esta submissão não registra autorização para
          tratamento de dados. Não é possível criar um cadastro a partir dela.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: "1.5rem", alignItems: "start" }}>
        {/* -------------------------------------------------- DADOS ENVIADOS */}
        <section className="secao-painel" style={{ marginBottom: 0 }}>
          <h2 className="secao-painel__titulo">O que a pessoa enviou</h2>
          <p className="secao-painel__desc">Conteúdo exatamente como foi preenchido.</p>

          <dl style={{ display: "grid", gap: "1.1rem", margin: 0 }}>
            <Linha rotulo="Nome" valor={submissao.nome} />
            <Linha rotulo="Telefone" valor={submissao.telefone} />
            <Linha rotulo="E-mail" valor={submissao.email} />
            {campos.map(({ chave, rotulo, valor }) => (
              <Linha key={chave} rotulo={rotulo} valor={valor} />
            ))}
          </dl>
        </section>

        {/* --------------------------------------------------------- TRIAGEM */}
        <div>
          {pessoaVinculada && (
            <div className="secao-painel" style={{ marginBottom: "1.5rem" }}>
              <h2 className="secao-painel__titulo" style={{ fontSize: "1rem" }}>
                Cadastro vinculado
              </h2>
              <p style={{ marginTop: ".6rem" }}>
                <Link href={`/painel/pessoas/${pessoaVinculada.id}`} style={{ fontWeight: 600 }}>
                  {pessoaVinculada.nome}
                </Link>
                <span className="etiqueta etiqueta--concluido" style={{ marginLeft: ".6rem" }}>
                  {pessoaVinculada.status}
                </span>
              </p>
            </div>
          )}

          {ctx.pode("submissoes.processar") ? (
            <FormularioTriagem
              submissaoId={submissao.id}
              statusAtual={submissao.status}
              notaAtual={submissao.notaInterna}
              jaTemPessoa={submissao.pessoaGeradaId !== null}
              podeCriarPessoa={submissao.consentimentoLgpd && ctx.pode("pessoas.criar")}
              celulas={celulas}
            />
          ) : (
            <div className="secao-painel" style={{ marginBottom: 0 }}>
              <p className="dim">Você tem acesso de leitura a esta submissão.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="cartao__rotulo">{rotulo}</dt>
      {/*
        `whiteSpace: pre-wrap` preserva as quebras de linha do testemunho sem
        precisar renderizar HTML. O React escapa o conteúdo, então nem um
        `<script>` colado pelo usuário vira marcação.
      */}
      <dd style={{ margin: ".3rem 0 0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{valor}</dd>
    </div>
  );
}

/** Rótulos legíveis para os campos guardados no JSON da submissão. */
const ROTULOS: Record<string, string> = {
  mensagem: "Mensagem",
  pedido: "Pedido de oração",
  testemunho: "Testemunho",
  observacoes: "Observações",
  categoria: "Categoria",
  titulo: "Resumo",
  urgente: "Urgente",
  anonimo: "Pedido anônimo",
  visibilidade: "Visibilidade",
  querContatoPastoral: "Quer contato pastoral",
  querVisitaPastoral: "Quer visita pastoral",
  comoConheceu: "Como conheceu",
  primeiraVisita: "Primeira visita",
  faixaEtaria: "Faixa etária",
  dataNascimento: "Data de nascimento",
  genero: "Gênero",
  estadoCivil: "Estado civil",
  cep: "CEP",
  logradouro: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  dataConversao: "Data de conversão",
  jaEBatizado: "Já é batizado",
  jaFoiBatizado: "Já foi batizado",
  ondeFoiBatizado: "Onde foi batizado",
  dataBatismo: "Data do batismo",
  igrejaAnterior: "Igreja anterior",
  motivoTransferencia: "Motivo da transferência",
  participaCelula: "Participa de célula",
  areasInteresse: "Áreas de interesse",
  aceitouJesus: "Aceitou Jesus",
  menorIdade: "Menor de idade",
  responsavelNome: "Responsável",
  responsavelTelefone: "Telefone do responsável",
  autorizacaoResponsavel: "Responsável autoriza",
  assunto: "Assunto",
  diaPreferido: "Dia preferido",
  jaEMembro: "Já é membro",
};

/** Campos que não precisam aparecer (já exibidos no topo ou de controle). */
const OCULTOS = new Set(["nome", "email", "telefone", "consentimentoLgpd", "website", "_t", "cursoId", "celulaId", "campusId"]);

function normalizarCampos(dados: unknown): { chave: string; rotulo: string; valor: string | null }[] {
  if (typeof dados !== "object" || dados === null) return [];

  const saida: { chave: string; rotulo: string; valor: string | null }[] = [];

  for (const [chave, valor] of Object.entries(dados as Record<string, unknown>)) {
    if (OCULTOS.has(chave)) continue;
    if (valor === null || valor === undefined || valor === "" || valor === false) continue;

    let texto: string;
    if (typeof valor === "boolean") texto = "Sim";
    else if (Array.isArray(valor)) texto = valor.map(String).join(", ");
    else if (typeof valor === "object") continue;
    else texto = String(valor);

    // Teto de tamanho: um campo com 500 KB (que passou por alguma versão
    // antiga sem limite) não deve travar a renderização da tela.
    saida.push({
      chave,
      rotulo: ROTULOS[chave] ?? chave,
      valor: texto.slice(0, 5000),
    });
  }

  return saida;
}
