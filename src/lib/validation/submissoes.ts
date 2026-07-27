import { z } from "zod";
import {
  antiSpam,
  consentimentoObrigatorio,
  dataOpcional,
  email,
  emailOpcional,
  id,
  idOpcional,
  nomePessoa,
  telefone,
  telefoneOpcional,
  textoLimpo,
  textoLongo,
  uf,
  cep,
} from "@/lib/validation/comum";

/**
 * Schemas dos formulários públicos (site e app).
 *
 * Estes são os únicos pontos em que dado de quem não está autenticado entra
 * no sistema. Tudo aqui é allowlist estrito: campo que não está no schema é
 * DESCARTADO pelo Zod, não repassado.
 *
 * Isso resolve mass assignment por construção. Se alguém enviar
 * `{ nome: "x", status: "MEMBRO", tenantId: "outro" }`, o `.parse()` devolve
 * apenas `{ nome: "x" }` — os outros campos nem chegam ao serviço.
 */

// -----------------------------------------------------------------------------
// Visitante — "vim visitar / quero conhecer"
// -----------------------------------------------------------------------------

export const schemaVisitante = antiSpam.extend({
  nome: nomePessoa,
  email: emailOpcional,
  telefone,
  comoConheceu: z
    .enum(["AMIGO", "REDES_SOCIAIS", "PASSANDO", "EVANGELISMO", "CELULA", "OUTRO"])
    .optional(),
  primeiraVisita: z.coerce.boolean().optional().default(true),
  campusId: idOpcional,
  faixaEtaria: z.enum(["CRIANCA", "ADOLESCENTE", "JOVEM", "ADULTO", "IDOSO"]).optional(),
  querContato: z.coerce.boolean().optional().default(false),
  querVisitaPastoral: z.coerce.boolean().optional().default(false),
  mensagem: textoLongo(1000).optional(),
  consentimentoLgpd: consentimentoObrigatorio,
});

// -----------------------------------------------------------------------------
// Novo membro — formulário completo
// -----------------------------------------------------------------------------

export const schemaNovoMembro = antiSpam.extend({
  nome: nomePessoa,
  email,
  telefone,
  dataNascimento: dataOpcional,
  genero: z.enum(["MASCULINO", "FEMININO", "NAO_INFORMADO"]).optional().default("NAO_INFORMADO"),
  estadoCivil: z
    .enum(["SOLTEIRO", "CASADO", "DIVORCIADO", "VIUVO", "UNIAO_ESTAVEL", "NAO_INFORMADO"])
    .optional()
    .default("NAO_INFORMADO"),

  cep,
  logradouro: textoLimpo(200).optional(),
  numero: textoLimpo(20).optional(),
  complemento: textoLimpo(100).optional(),
  bairro: textoLimpo(100).optional(),
  cidade: textoLimpo(100).optional(),
  uf,

  // Jornada de fé
  jaEConvertido: z.coerce.boolean().optional().default(false),
  dataConversao: dataOpcional,
  jaEBatizado: z.coerce.boolean().optional().default(false),
  dataBatismo: dataOpcional,
  igrejaAnterior: textoLimpo(160).optional(),
  motivoTransferencia: textoLongo(600).optional(),

  participaCelula: z.coerce.boolean().optional().default(false),
  celulaId: idOpcional,
  campusId: idOpcional,

  areasInteresse: z
    .array(
      z.enum([
        "LOUVOR", "INFANTIL", "JOVENS", "INTERCESSAO", "DIACONIA",
        "MIDIA", "RECEPCAO", "ENSINO", "MISSOES", "ACAO_SOCIAL",
      ]),
    )
    // Teto: sem ele, um array com 100.000 itens vira DoS de memória
    // (o Zod valida item a item antes de o handler ver o tamanho).
    .max(10)
    .optional()
    .default([]),

  observacoes: textoLongo(1000).optional(),
  consentimentoLgpd: consentimentoObrigatorio,
});

// -----------------------------------------------------------------------------
// Batismo
// -----------------------------------------------------------------------------

export const schemaBatismo = antiSpam
  .extend({
    nome: nomePessoa,
    email: emailOpcional,
    telefone,
    dataNascimento: dataOpcional,

    // Testemunho
    aceitouJesus: z.coerce.boolean(),
    dataConversao: dataOpcional,
    testemunho: textoLongo(2000, 20),
    jaFoiBatizado: z.coerce.boolean().optional().default(false),
    ondeFoiBatizado: textoLimpo(200).optional(),

    participaCelula: z.coerce.boolean().optional().default(false),
    celulaId: idOpcional,
    campusId: idOpcional,

    // Menor de idade
    menorIdade: z.coerce.boolean().optional().default(false),
    responsavelNome: textoLimpo(160).optional(),
    responsavelTelefone: telefoneOpcional,
    autorizacaoResponsavel: z.coerce.boolean().optional().default(false),

    observacoes: textoLongo(1000).optional(),
    consentimentoLgpd: consentimentoObrigatorio,
  })
  /**
   * Regra de negócio que também é regra jurídica: batismo de menor sem
   * autorização do responsável expõe a igreja. Validar aqui, no schema,
   * garante que nenhum caminho de entrada (site, app, importação) escapa.
   */
  .refine(
    (d) => !d.menorIdade || (d.responsavelNome && d.responsavelTelefone && d.autorizacaoResponsavel),
    {
      message: "Para menores de idade é obrigatório informar e autorizar o responsável.",
      path: ["responsavelNome"],
    },
  );

// -----------------------------------------------------------------------------
// Pedido de oração
// -----------------------------------------------------------------------------

export const schemaPedidoOracao = antiSpam
  .extend({
    anonimo: z.coerce.boolean().optional().default(false),
    nome: z.union([nomePessoa, z.literal("")]).optional(),
    email: emailOpcional,
    telefone: telefoneOpcional,

    categoria: z
      .enum(["SAUDE", "FAMILIA", "FINANCEIRO", "ESPIRITUAL", "LUTO", "GRATIDAO", "TRABALHO", "GERAL"])
      .optional()
      .default("GERAL"),
    titulo: textoLimpo(160).optional(),
    pedido: textoLongo(3000, 10),
    urgente: z.coerce.boolean().optional().default(false),

    /**
     * O padrão é PRIVADO por decisão de projeto.
     *
     * Pedido de oração fala de câncer, desemprego, separação, filho preso.
     * Se o padrão fosse "mural", uma pessoa em crise que não lesse o
     * formulário com atenção exporia isso para a igreja inteira. O padrão
     * seguro protege quem está mais vulnerável no momento de preencher.
     */
    visibilidade: z
      .enum(["PRIVADO", "MURAL_MEMBROS", "PUBLICO"])
      .optional()
      .default("PRIVADO"),

    querContatoPastoral: z.coerce.boolean().optional().default(false),
    consentimentoLgpd: consentimentoObrigatorio,
  })
  .refine((d) => d.anonimo || (d.nome && d.nome.length >= 2), {
    message: "Informe seu nome ou marque a opção de pedido anônimo.",
    path: ["nome"],
  })
  .refine((d) => !d.querContatoPastoral || d.telefone || d.email, {
    message: "Para receber contato pastoral, informe telefone ou e-mail.",
    path: ["telefone"],
  })
  /**
   * Publicar no site exige nome — e nome exige não ser anônimo. Sem esta
   * checagem, um pedido anônimo poderia ir para o site público, o que é
   * contraditório e cria uma expectativa falsa de privacidade.
   */
  .refine((d) => d.visibilidade !== "PUBLICO" || !d.anonimo, {
    message: "Pedidos anônimos não podem ser publicados no site.",
    path: ["visibilidade"],
  });

// -----------------------------------------------------------------------------
// Contato genérico
// -----------------------------------------------------------------------------

export const schemaContato = antiSpam.extend({
  nome: nomePessoa,
  email,
  telefone: telefoneOpcional,
  assunto: textoLimpo(160),
  mensagem: textoLongo(3000, 10),
  consentimentoLgpd: consentimentoObrigatorio,
});

// -----------------------------------------------------------------------------
// Inscrição em curso da Escola
// -----------------------------------------------------------------------------

export const schemaInscricaoCurso = antiSpam.extend({
  cursoId: id,
  nome: nomePessoa,
  email,
  telefone,
  dataNascimento: dataOpcional,
  jaEMembro: z.coerce.boolean().optional().default(false),
  observacoes: textoLongo(600).optional(),
  consentimentoLgpd: consentimentoObrigatorio,
});

// -----------------------------------------------------------------------------
// "Quero participar de uma célula"
// -----------------------------------------------------------------------------

export const schemaQueroCelula = antiSpam.extend({
  nome: nomePessoa,
  email: emailOpcional,
  telefone,
  bairro: textoLimpo(100).optional(),
  cidade: textoLimpo(100).optional(),
  celulaId: idOpcional,
  diaPreferido: z.coerce.number().int().min(0).max(6).optional(),
  observacoes: textoLongo(600).optional(),
  consentimentoLgpd: consentimentoObrigatorio,
});

// -----------------------------------------------------------------------------
// Mapa tipo -> schema
// -----------------------------------------------------------------------------

export const SCHEMAS_POR_TIPO = {
  VISITANTE: schemaVisitante,
  NOVO_MEMBRO: schemaNovoMembro,
  BATISMO: schemaBatismo,
  PEDIDO_ORACAO: schemaPedidoOracao,
  CONTATO: schemaContato,
  INSCRICAO_CURSO: schemaInscricaoCurso,
  QUERO_CELULA: schemaQueroCelula,
} as const;

export type TipoFormulario = keyof typeof SCHEMAS_POR_TIPO;

export function ehTipoValido(tipo: string): tipo is TipoFormulario {
  return Object.prototype.hasOwnProperty.call(SCHEMAS_POR_TIPO, tipo);
}

// -----------------------------------------------------------------------------
// Triagem no painel
// -----------------------------------------------------------------------------

export const schemaTriagem = z.object({
  status: z.enum(["NOVO", "EM_ANALISE", "CONCLUIDO", "ARQUIVADO", "SPAM"]),
  notaInterna: textoLongo(2000).optional(),
  /** Quando true, cria (ou vincula) a Pessoa a partir da submissão. */
  criarPessoa: z.coerce.boolean().optional().default(false),
  /** Vincular a uma pessoa que já existe, em vez de criar duplicada. */
  pessoaExistenteId: idOpcional,
  statusPessoa: z
    .enum(["VISITANTE", "EM_ACOMPANHAMENTO", "CONGREGANTE", "MEMBRO"])
    .optional(),
  celulaId: idOpcional,
});

export type DadosTriagem = z.infer<typeof schemaTriagem>;
