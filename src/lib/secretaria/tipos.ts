/**
 * Secretaria — definição DATA-DRIVEN dos formulários de cadastro.
 *
 * Um lugar só descreve cada formulário (Visitantes, Batismo, Apresentação de
 * Crianças, Integração, Decisão). O formulário, a lista, o relatório e o PDF
 * leem daqui — então acrescentar um campo é editar UMA linha, e nada sai do ar.
 *
 * PURO e testável: sem React, sem Prisma, sem I/O.
 */

export type TipoRegistro =
  | "VISITANTE"
  | "BATISMO"
  | "APRESENTACAO_CRIANCA"
  | "INTEGRACAO"
  | "DECISAO";

/** Colunas reais da tabela (o resto de cada formulário vai em `extra` JSON). */
export type ColunaRegistro =
  | "nome"
  | "contato"
  | "dataNascimento"
  | "comoConheceu"
  | "endereco"
  | "dataInscricao"
  | "dataReferencia"
  | "observacao";

const COLUNAS: ReadonlySet<string> = new Set<ColunaRegistro>([
  "nome", "contato", "dataNascimento", "comoConheceu",
  "endereco", "dataInscricao", "dataReferencia", "observacao",
]);

export type TipoCampo = "texto" | "tel" | "data" | "textarea" | "sim_nao" | "numero";

export interface CampoDef {
  /** Se for uma ColunaRegistro, grava na coluna; senão, entra em `extra`. */
  chave: string;
  rotulo: string;
  tipo: TipoCampo;
  obrigatorio?: boolean;
  /** Dica curta abaixo do campo. */
  ajuda?: string;
}

export interface FormularioDef {
  tipo: TipoRegistro;
  slug: string;
  rotulo: string;
  /** Rótulo no singular para "Novo …". */
  singular: string;
  icone: string; // 1 emoji/letra, exibido no card
  descricao: string;
  campos: CampoDef[];
}

/** É coluna real da tabela? (senão vai para o JSON `extra`) */
export function ehColuna(chave: string): chave is ColunaRegistro {
  return COLUNAS.has(chave);
}

const c = (chave: string, rotulo: string, tipo: TipoCampo, obrigatorio = false, ajuda?: string): CampoDef => ({
  chave, rotulo, tipo, obrigatorio, ajuda,
});

export const FORMULARIOS: Record<TipoRegistro, FormularioDef> = {
  VISITANTE: {
    tipo: "VISITANTE",
    slug: "visitantes",
    rotulo: "Visitantes",
    singular: "Visitante",
    icone: "👋",
    descricao: "Quem visitou a igreja pela primeira vez.",
    campos: [
      c("nome", "Nome completo", "texto", true),
      c("comoConheceu", "Como conheceu a igreja", "texto"),
      c("contato", "Contato WhatsApp", "tel"),
      c("dataNascimento", "Data de nascimento", "data"),
      c("dataReferencia", "Data da visita", "data"),
    ],
  },
  BATISMO: {
    tipo: "BATISMO",
    slug: "batismo",
    rotulo: "Batismo",
    singular: "Inscrição de batismo",
    icone: "💧",
    descricao: "Inscrições para o batismo nas águas.",
    campos: [
      c("nome", "Nome completo", "texto", true),
      c("comoConheceu", "Como conheceu a igreja", "texto"),
      c("contato", "Contato WhatsApp", "tel"),
      c("dataNascimento", "Data de nascimento", "data"),
      c("dataInscricao", "Data de inscrição", "data"),
      c("dataReferencia", "Data do batismo", "data"),
      c("endereco", "Endereço", "texto"),
    ],
  },
  APRESENTACAO_CRIANCA: {
    tipo: "APRESENTACAO_CRIANCA",
    slug: "apresentacao-criancas",
    rotulo: "Apresentação de Crianças",
    singular: "Apresentação de criança",
    icone: "🧒",
    descricao: "Apresentação/dedicação de crianças.",
    campos: [
      c("nome", "Nome da criança", "texto", true),
      c("nomePai", "Nome do pai", "texto"),
      c("nomeMae", "Nome da mãe", "texto"),
      c("dataNascimento", "Data de nascimento da criança", "data"),
      c("contato", "Fone / WhatsApp", "tel"),
      c("dataReferencia", "Data pretendida da apresentação", "data"),
      c("padrinhos", "Haverá padrinhos?", "sim_nao"),
      c("quantosPadrinhos", "Quantos padrinhos", "numero"),
      c("observacao", "Observação", "textarea"),
    ],
  },
  INTEGRACAO: {
    tipo: "INTEGRACAO",
    slug: "integracao",
    rotulo: "Integração",
    singular: "Integração",
    icone: "🤝",
    descricao: "Quem veio de outra igreja e está se integrando.",
    campos: [
      c("nome", "Nome completo", "texto", true),
      c("contato", "Contato WhatsApp", "tel"),
      c("dataNascimento", "Data de nascimento", "data"),
      c("dataInscricao", "Data de inscrição", "data"),
      c("endereco", "Endereço", "texto"),
      c("igrejaAnterior", "Igreja anterior", "texto"),
      c("cargoAnterior", "Cargo ministerial anterior", "texto"),
      c("batizado", "Batizado(a)?", "sim_nao"),
      c("dataReferencia", "Data da integração", "data"),
    ],
  },
  DECISAO: {
    tipo: "DECISAO",
    slug: "decisao",
    rotulo: "Decisão",
    singular: "Decisão",
    icone: "🙌",
    descricao: "Quem tomou uma decisão por Jesus.",
    campos: [
      c("nome", "Nome completo", "texto", true),
      c("dataReferencia", "Data da decisão", "data"),
      c("contato", "Contato WhatsApp", "tel"),
      c("dataNascimento", "Data de nascimento", "data"),
      c("observacao", "Observação", "textarea"),
    ],
  },
};

export const TIPOS: TipoRegistro[] = Object.keys(FORMULARIOS) as TipoRegistro[];

const POR_SLUG: Record<string, FormularioDef> = Object.fromEntries(
  TIPOS.map((t) => [FORMULARIOS[t].slug, FORMULARIOS[t]]),
);

/** Formulário a partir do slug da URL (ou null se o slug não existir). */
export function formularioPorSlug(slug: string): FormularioDef | null {
  return POR_SLUG[slug] ?? null;
}
