import { z } from "zod";
import { corHex, textoLimpo, textoLongo, urlOpcional, youtubeVideoId } from "@/lib/validation/comum";

/**
 * Blocos de conteúdo das páginas do site.
 *
 * A DECISÃO MAIS IMPORTANTE DO EDITOR WHITELABEL
 *
 * O caminho fácil seria dar um editor rich-text ao cliente e guardar HTML.
 * Isso cria XSS armazenado com escopo total: o admin de uma igreja cola um
 * `<script>` (por malícia, ou porque copiou de um site infectado) e ele
 * executa para todo visitante daquele domínio — com acesso aos cookies do
 * site. E "sanitizar HTML" é uma corrida armamentista que ninguém ganha em
 * definitivo.
 *
 * Em vez disso: o cliente escolhe BLOCOS PRONTOS e preenche CAMPOS. O
 * conteúdo é dado estruturado, o React escapa tudo na renderização, e não
 * existe caminho por onde marcação do usuário vire marcação da página.
 *
 * O custo é menos liberdade de formatação. Para um site de igreja, é uma
 * troca óbvia.
 */

const tema = z.enum(["claro", "escuro", "creme"]).default("claro");

const blocoHero = z.object({
  tipo: z.literal("hero"),
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200),
  subtitulo: textoLongo(400).optional(),
  imagemId: z.string().max(30).optional(),
  ctaTexto: textoLimpo(60).optional(),
  ctaLink: textoLimpo(200).optional(),
});

const blocoTexto = z.object({
  tipo: z.literal("texto"),
  tema,
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200).optional(),
  // Texto puro com quebras de linha. NÃO é HTML, NÃO é markdown com HTML
  // embutido: a renderização quebra por \n\n em parágrafos.
  corpo: textoLongo(6000),
});

const blocoCitacao = z.object({
  tipo: z.literal("citacao"),
  tema,
  texto: textoLongo(600),
  autor: textoLimpo(160).optional(),
});

const blocoCards = z.object({
  tipo: z.literal("cards"),
  tema,
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200).optional(),
  colunas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  itens: z
    .array(
      z.object({
        titulo: textoLimpo(120),
        texto: textoLongo(600).optional(),
        link: textoLimpo(200).optional(),
        linkTexto: textoLimpo(60).optional(),
        imagemId: z.string().max(30).optional(),
      }),
    )
    // Teto: sem ele, um array de 50.000 itens trava a renderização.
    .max(12),
});

const blocoLista = z.object({
  tipo: z.literal("lista"),
  tema,
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200).optional(),
  itens: z
    .array(
      z.object({
        titulo: textoLimpo(120),
        texto: textoLongo(600).optional(),
      }),
    )
    .max(20),
});

const blocoImagem = z.object({
  tipo: z.literal("imagem"),
  tema,
  imagemId: z.string().max(30),
  legenda: textoLimpo(200).optional(),
  proporcao: z.enum(["16/9", "4/3", "1/1", "3/4"]).default("16/9"),
});

const blocoVideo = z.object({
  tipo: z.literal("video"),
  tema,
  titulo: textoLimpo(200).optional(),
  // Só o ID. Nunca uma URL livre — ver comentário em comum.ts.
  youtubeVideoId,
});

const blocoFormulario = z.object({
  tipo: z.literal("formulario"),
  tema,
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200).optional(),
  descricao: textoLongo(600).optional(),
  // Allowlist: o cliente escolhe entre os formulários que existem, não
  // inventa um endpoint.
  formulario: z.enum(["visitante", "contato", "pedido-oracao", "batismo", "quero-celula"]),
});

const blocoCta = z.object({
  tipo: z.literal("cta"),
  tema,
  titulo: textoLimpo(200),
  texto: textoLongo(600).optional(),
  botaoTexto: textoLimpo(60),
  botaoLink: textoLimpo(200),
  corFundo: corHex.optional(),
});

const blocoAgenda = z.object({
  tipo: z.literal("agenda"),
  tema,
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200).optional(),
});

const blocoCampi = z.object({
  tipo: z.literal("campi"),
  tema,
  eyebrow: textoLimpo(80).optional(),
  titulo: textoLimpo(200).optional(),
});

const blocoAoVivo = z.object({
  tipo: z.literal("aoVivo"),
  tema,
  titulo: textoLimpo(200).optional(),
  descricao: textoLongo(600).optional(),
});

/**
 * União discriminada por `tipo`.
 *
 * O Zod só aceita um objeto se ele casar exatamente com um dos membros.
 * Um bloco com `tipo: "scriptMalicioso"` não passa, e um bloco válido com
 * campos extras tem os extras removidos.
 */
export const schemaBloco = z.discriminatedUnion("tipo", [
  blocoHero,
  blocoTexto,
  blocoCitacao,
  blocoCards,
  blocoLista,
  blocoImagem,
  blocoVideo,
  blocoFormulario,
  blocoCta,
  blocoAgenda,
  blocoCampi,
  blocoAoVivo,
]);

export type Bloco = z.infer<typeof schemaBloco>;

/** Máximo de blocos por página. Protege o tempo de renderização. */
export const schemaBlocos = z.array(schemaBloco).max(40);

export const schemaPagina = z.object({
  titulo: textoLimpo(160),
  seoTitulo: textoLimpo(200).optional(),
  seoDescricao: textoLimpo(300).optional(),
  blocos: schemaBlocos,
  publicada: z.coerce.boolean().default(false),
  mostrarMenu: z.coerce.boolean().default(true),
  ordemMenu: z.coerce.number().int().min(0).max(999).optional(),
});

/**
 * Revalida os blocos NA LEITURA, antes de renderizar.
 *
 * Isso é defesa em profundidade contra dado que entrou no banco por fora do
 * fluxo validado — seed antigo, importação, correção manual em SQL, ou uma
 * versão do código anterior a esta validação. Um bloco inválido é descartado
 * silenciosamente em vez de derrubar a página inteira: o site da igreja
 * continua no ar, apenas sem aquela seção.
 */
export function blocosSeguros(valor: unknown): Bloco[] {
  if (!Array.isArray(valor)) return [];

  const validos: Bloco[] = [];
  for (const bruto of valor.slice(0, 40)) {
    const resultado = schemaBloco.safeParse(bruto);
    if (resultado.success) validos.push(resultado.data);
  }
  return validos;
}

/** Rótulos para o editor no painel. */
export const ROTULOS_BLOCO: Record<Bloco["tipo"], string> = {
  hero: "Destaque principal",
  texto: "Texto",
  citacao: "Citação / versículo",
  cards: "Cartões",
  lista: "Lista numerada",
  imagem: "Imagem",
  video: "Vídeo do YouTube",
  formulario: "Formulário",
  cta: "Chamada para ação",
  agenda: "Agenda de encontros",
  campi: "Endereços",
  aoVivo: "Transmissão ao vivo",
};
