/**
 * =============================================================================
 * SEED DE DEMONSTRAÇÃO — Discipular SaaS
 * =============================================================================
 *
 * O QUE ESTE ARQUIVO FAZ
 *   1. Cria (ou confirma) o super admin da plataforma.
 *   2. Popula o tenant de demonstração "Discipular Igreja" (slug: discipular)
 *      com site, campi, agenda, cursos, células, pessoas, submissões, oração,
 *      batismos e mensagens.
 *   3. Cria um segundo tenant mínimo, "Igreja Videira" (slug: videira), cuja
 *      única razão de existir é permitir TESTAR o isolamento multi-tenant.
 *
 * IDEMPOTÊNCIA
 * Rodar duas vezes não pode duplicar nada. Em vez de `upsert`, usamos
 * `findFirst` por chave natural + `create`/`update` (ver `garantir()` abaixo).
 * O motivo é técnico e está documentado lá: `upsert` com chave única composta
 * quebra dentro do cliente escopado por tenant.
 *
 * SEGURANÇA — as três regras que este seed respeita
 *   a) Nenhuma senha fixa no código. A senha do super admin vem de
 *      SEED_ADMIN_SENHA; na ausência dela, geramos uma aleatória forte e a
 *      imprimimos UMA ÚNICA VEZ.
 *   b) Todo dado de igreja passa por `tenantDb(tenantId)`. O `prisma` cru só
 *      toca modelos globais (Tenant, TenantDomain, User, Membership).
 *   c) O seed se recusa a rodar em produção sem consentimento explícito:
 *      dado de demonstração numa base real é como contas de teste acabam
 *      virando porta de entrada.
 *
 * Todos os nomes, e-mails, telefones e chaves PIX abaixo são FICTÍCIOS.
 * Nenhum dado real de pessoa ou de igreja entra aqui.
 */

import { randomBytes } from "node:crypto";
import type {
  EstadoCivil,
  Genero,
  OrigemCadastro,
  Papel,
  StatusBatismo,
  StatusOracao,
  StatusPessoa,
  StatusSubmissao,
  TipoAgenda,
  TipoSubmissao,
  VisibilidadeOracao,
} from "@prisma/client";

// -----------------------------------------------------------------------------
// Carregamento do ambiente
// -----------------------------------------------------------------------------

/**
 * `src/lib/env.ts` valida as variáveis de ambiente NO MOMENTO DO IMPORT e
 * derruba o processo se faltar alguma. Como `import` é avaliado antes de
 * qualquer instrução do módulo, precisamos carregar o `.env` primeiro e só
 * então importar dinamicamente o que depende dele — senão `npm run db:seed`
 * (que roda `tsx` direto, sem a mágica de .env do Prisma CLI) falharia antes
 * de chegar na primeira linha útil.
 */
function carregarDotEnv(): void {
  try {
    process.loadEnvFile();
  } catch {
    // Sem arquivo .env: assumimos que as variáveis já vieram do ambiente
    // (Docker, systemd, CI). Se não vieram, `env.ts` reclama com mensagem clara.
  }
}

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

/**
 * Senha aleatória de ~144 bits. Revalidamos com a própria política do sistema
 * (`validarForca`) e sorteamos de novo no caso improvável de o resultado cair
 * numa regra proibida — assim o seed nunca falha por azar estatístico.
 */
function gerarSenhaForte(validarForca: (s: string) => void): string {
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const candidata = randomBytes(18).toString("base64url");
    try {
      validarForca(candidata);
      return candidata;
    } catch {
      continue;
    }
  }
  throw new Error("Não foi possível gerar uma senha que satisfaça a política.");
}

/** Telefone claramente fictício, derivado do índice. DDD 51 + 9 dígitos. */
function telefoneFicticio(indice: number): string {
  return `5199900${String(indice).padStart(4, "0")}`;
}

/** Data relativa a agora, para a demonstração parecer viva. */
function diasAtras(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

function diasAFrente(dias: number): Date {
  return new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
}

const contagem = { criados: 0, atualizados: 0 };

/**
 * Superfície mínima de um delegate do Prisma. Tipar assim (em vez de importar
 * os tipos gerados de cada modelo) mantém `garantir()` genérico; o preço é que
 * o conteúdo de `dados` não é checado em tempo de compilação — um campo com
 * nome errado falha ao rodar o seed, que é justamente quando alguém está
 * olhando.
 */
interface DelegateIdempotente {
  findFirst(args: {
    where: Record<string, unknown>;
    select: { id: true };
  }): Promise<{ id: string } | null>;
  create(args: {
    data: Record<string, unknown>;
    select: { id: true };
  }): Promise<{ id: string }>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
    select: { id: true };
  }): Promise<{ id: string }>;
}

/**
 * Cria ou atualiza um registro identificado por uma CHAVE NATURAL.
 *
 * Por que não `upsert`: o cliente escopado por tenant precisa provar que o
 * alvo do upsert pertence ao tenant, e faz isso com um `count()` reaproveitando
 * o mesmo `where`. Um `where` de chave única COMPOSTA (`{ tenantId_slug: {...} }`)
 * é válido em `upsert` mas inválido em `count`, então o upsert estoura antes de
 * chegar ao banco. `findFirst` + `update({ where: { id } })` não tem esse
 * problema e continua 100% escopado ao tenant.
 *
 * @param chave  Campos que identificam o registro. Também entram no `create`.
 * @param dados  Campos reaplicados a cada execução (o seed é a fonte da verdade).
 * @param apenasNaCriacao  Campos gravados só na primeira vez — datas de criação
 *                         e afins, que não devem "andar" a cada `npm run db:seed`.
 */
async function garantir(
  delegate: unknown,
  chave: Record<string, unknown>,
  dados: Record<string, unknown>,
  apenasNaCriacao: Record<string, unknown> = {},
): Promise<string> {
  const d = delegate as DelegateIdempotente;

  const existente = await d.findFirst({ where: chave, select: { id: true } });
  if (existente) {
    contagem.atualizados += 1;
    const atualizado = await d.update({
      where: { id: existente.id },
      data: dados,
      select: { id: true },
    });
    return atualizado.id;
  }

  contagem.criados += 1;
  const criado = await d.create({
    data: { ...chave, ...dados, ...apenasNaCriacao },
    select: { id: true },
  });
  return criado.id;
}

// -----------------------------------------------------------------------------
// Credenciais geradas nesta execução (impressas no resumo final)
// -----------------------------------------------------------------------------

interface Credencial {
  rotulo: string;
  email: string;
  /** null = a conta já existia; não sabemos (nem devemos saber) a senha atual. */
  senha: string | null;
  observacao?: string;
}

const credenciais: Credencial[] = [];

/**
 * Referência ao `$disconnect` do Prisma, publicada assim que o cliente é
 * importado. Sem fechar o pool, o processo do seed fica pendurado ao falhar —
 * o que em CI vira um job travado até o timeout em vez de um erro imediato.
 */
let desconectarBanco: (() => Promise<void>) | null = null;

// =============================================================================
// CONTEÚDO DE DEMONSTRAÇÃO
// =============================================================================

/**
 * Tema "Preto & Branco Moderno" — a identidade final da Discipular Igreja.
 * Base branca, texto quase-preto, tipografia Archivo. O acento é neutro
 * (quase-preto em seções claras; o globals.css inverte para branco nas seções
 * escuras). O único toque de cor cromática do site é o vermelho do "Ao Vivo",
 * definido no CSS — não é cor de tema.
 */
const TEMA_PB = {
  corAcento: "#0E0E10",
  corAcentoClara: "#000000",
  corTinta: "#0A0A0B",
  corPapel: "#FFFFFF",
  fonteTitulo: "Archivo",
  fonteTexto: "Archivo",
} as const;

/** Os seis pilares — repetidos no site e na página "quem somos". */
const PILARES: { titulo: string; texto: string }[] = [
  {
    titulo: "Adoração",
    texto:
      "Antes de qualquer atividade, existe um encontro. Cultuamos a Deus com reverência e alegria, porque adoração não é a abertura do culto: é a razão dele.",
  },
  {
    titulo: "Palavra",
    texto:
      "Ensinamos a Bíblia inteira, com cuidado e sem atalhos. Fé que não se apoia no texto vira opinião, e opinião não sustenta ninguém numa terça-feira difícil.",
  },
  {
    titulo: "Comunhão",
    texto:
      "Ninguém amadurece sozinho. A vida cristã acontece em mesas, salas e casas — onde as pessoas sabem o seu nome e percebem quando você falta.",
  },
  {
    titulo: "Discipulado",
    texto:
      "Caminhar com alguém, de perto, até que essa pessoa possa caminhar com outra. É lento, é pessoal, e é a única coisa que Jesus mandou multiplicar.",
  },
  {
    titulo: "Missão",
    texto:
      "A igreja não existe para si mesma. Servimos Lajeado e Vera Cruz com trabalho concreto, e anunciamos Jesus sem constrangimento nem truque.",
  },
  {
    titulo: "Avivamento",
    texto:
      "Dependemos do Espírito Santo. Nenhuma estrutura, por melhor que seja, produz vida — e por isso oramos pedindo o que não conseguimos organizar.",
  },
];

/**
 * Páginas do site da igreja de demonstração.
 *
 * O conteúdo é declarado como DADO, não como HTML: cada item de `blocos` é um
 * bloco da união discriminada de src/lib/validation/blocos.ts. Antes de gravar,
 * tudo passa por `schemaBlocos.parse()` — ver `main()`.
 */
const PAGINAS_DISCIPULAR: {
  slug: string;
  titulo: string;
  seoTitulo: string;
  seoDescricao: string;
  ordemMenu: number;
  sistema?: boolean;
  blocos: unknown[];
}[] = [
  {
    slug: "home",
    titulo: "Início",
    seoTitulo: "Discipular Igreja — Uma casa de discípulos",
    seoDescricao:
      "Igreja cristã em Lajeado e Vera Cruz/RS. Culto aos domingos às 18h30, células nos lares e escola de teologia.",
    ordemMenu: 0,
    sistema: true,
    blocos: [
      {
        tipo: "hero",
        eyebrow: "Lajeado e Vera Cruz · RS",
        titulo: "Uma casa de discípulos",
        subtitulo:
          "Existimos para formar pessoas que seguem Jesus de perto e ensinam outras a fazer o mesmo. Sem espetáculo, sem atalho: uma casa, uma mesa, uma vida por vez.",
        ctaTexto: "Quero visitar",
        ctaLink: "/visita",
      },
      {
        tipo: "citacao",
        tema: "escuro",
        texto:
          "Portanto, vão e façam discípulos de todas as nações, batizando-os em nome do Pai, do Filho e do Espírito Santo.",
        autor: "Mateus 28.19",
      },
      {
        tipo: "texto",
        tema: "creme",
        eyebrow: "Quem somos",
        titulo: "Igreja não é o que acontece no domingo",
        corpo:
          "Somos uma igreja cristã no Vale do Taquari. Nos reunimos aos domingos para celebrar, mas passamos a semana onde a vida realmente acontece: nas casas, nas células, nas conversas que ninguém aplaude.\n\nAcreditamos que o crescimento de uma igreja se mede menos pelo tamanho da sala e mais pelo número de pessoas capazes de discipular outra. É um alvo mais lento e muito mais difícil de falsificar.\n\nSe você está começando agora, não precisa saber nada para entrar. Precisa apenas de vontade de caminhar.",
      },
      {
        tipo: "cards",
        tema: "claro",
        eyebrow: "Os seis pilares",
        titulo: "O que sustenta esta casa",
        colunas: 3,
        itens: PILARES,
      },
      {
        tipo: "agenda",
        tema: "escuro",
        eyebrow: "Durante a semana",
        titulo: "Nossos encontros",
      },
      {
        tipo: "aoVivo",
        tema: "claro",
        titulo: "Culto ao vivo",
        descricao:
          "Aos domingos, às 18h30, transmitimos a celebração. Se você não puder vir, adore com a gente de onde estiver.",
      },
      {
        tipo: "campi",
        tema: "creme",
        eyebrow: "Onde estamos",
        titulo: "Duas cidades, uma casa",
      },
      {
        tipo: "cta",
        tema: "escuro",
        titulo: "Dê o primeiro passo",
        texto:
          "Avise que você vem. Alguém da equipe vai receber você na entrada, e você não precisa se apresentar para ninguém no palco.",
        botaoTexto: "Quero visitar",
        botaoLink: "/visita",
      },
    ],
  },
  {
    slug: "quem-somos",
    titulo: "Quem somos",
    seoTitulo: "Quem somos — Discipular Igreja",
    seoDescricao:
      "Nossa história, o que cremos e os seis pilares que sustentam a Discipular Igreja em Lajeado e Vera Cruz.",
    ordemMenu: 1,
    blocos: [
      {
        tipo: "hero",
        eyebrow: "Quem somos",
        titulo: "Discípulos que fazem discípulos",
        subtitulo:
          "Uma igreja simples, com convicções antigas e disposição para o trabalho lento de formar gente.",
      },
      {
        tipo: "texto",
        tema: "claro",
        titulo: "Como chegamos até aqui",
        corpo:
          "Começamos com poucas famílias reunidas numa sala emprestada, convencidas de uma coisa: a igreja de Jesus cresce quando pessoas comuns assumem a responsabilidade de ensinar outras pessoas comuns.\n\nCom o tempo vieram as células nos bairros, a escola de teologia e o campus em Vera Cruz. Nada disso mudou o alvo. Continuamos medindo o mesmo indicador: quantas pessoas estão caminhando com alguém, e quantas já começaram a caminhar com uma terceira.\n\nNão somos uma igreja de eventos. Somos uma casa — e casa tem porta aberta, mesa posta e trabalho a fazer.",
      },
      {
        tipo: "lista",
        tema: "creme",
        eyebrow: "No que cremos",
        titulo: "Convicções que não negociamos",
        itens: [
          {
            titulo: "A Escritura",
            texto:
              "A Bíblia é a Palavra de Deus, suficiente e final para a fé e a prática. Ensinamos o texto, e não em torno dele.",
          },
          {
            titulo: "O Deus trino",
            texto: "Um só Deus, eternamente Pai, Filho e Espírito Santo.",
          },
          {
            titulo: "A graça",
            texto:
              "Ninguém é salvo pelo que faz. Somos salvos pela obra de Cristo, recebida pela fé — e é isso que produz obediência, não o contrário.",
          },
          {
            titulo: "A igreja",
            texto:
              "O corpo de Cristo, visível e local, com membros que se conhecem, se corrigem e se sustentam.",
          },
          {
            titulo: "A missão",
            texto:
              "Anunciar Jesus a todas as pessoas e formar discípulos até que ele volte.",
          },
        ],
      },
      {
        tipo: "cards",
        tema: "claro",
        eyebrow: "Os seis pilares",
        titulo: "O que orienta cada decisão",
        colunas: 2,
        itens: PILARES,
      },
      {
        tipo: "citacao",
        tema: "escuro",
        texto:
          "E o que você me ouviu dizer na presença de muitas testemunhas, confie a homens fiéis que sejam capazes de ensinar a outros.",
        autor: "2 Timóteo 2.2",
      },
      {
        tipo: "cta",
        tema: "creme",
        titulo: "Venha nos conhecer",
        texto: "Culto de Celebração aos domingos, às 18h30, na Sede Lajeado e no Campus Vera Cruz.",
        botaoTexto: "Quero visitar",
        botaoLink: "/visita",
      },
    ],
  },
  {
    slug: "pastores",
    titulo: "Pastores",
    seoTitulo: "Equipe pastoral — Discipular Igreja",
    seoDescricao: "Conheça a equipe pastoral da Discipular Igreja em Lajeado e Vera Cruz.",
    ordemMenu: 2,
    blocos: [
      {
        tipo: "hero",
        eyebrow: "Equipe pastoral",
        titulo: "Quem caminha à frente",
        subtitulo:
          "Pastorear é ir junto. Nossa equipe está disponível para conversar, aconselhar e orar com você.",
      },
      {
        tipo: "texto",
        tema: "claro",
        corpo:
          "Nenhum pastor desta casa trabalha sozinho, e nenhum deles decide sozinho. As decisões passam pelo conselho, as contas são auditadas e o púlpito é compartilhado.\n\nSe você precisa conversar, não é necessário esperar o fim do culto: escreva e marcamos um horário.",
      },
      {
        tipo: "cards",
        tema: "creme",
        eyebrow: "Nossa equipe",
        titulo: "Pastores e pastoras",
        colunas: 3,
        itens: [
          {
            titulo: "Pr. Paulo Bittencourt",
            texto:
              "Pastor sênior. Ensina na Teologia Discipular e coordena o discipulado da Sede Lajeado. Casado com Ana, dois filhos.",
          },
          {
            titulo: "Pra. Ana Ribeiro",
            texto:
              "Responsável pelo cuidado pastoral e pela formação de líderes de célula. Escreve o material da Trilha Discipular.",
          },
          {
            titulo: "Pr. Daniel Kessler",
            texto:
              "Pastor do Campus Vera Cruz. Acompanha as células do vale e o trabalho social junto às escolas do bairro.",
          },
        ],
      },
      {
        tipo: "formulario",
        tema: "claro",
        eyebrow: "Fale com a equipe",
        titulo: "Precisa conversar?",
        descricao:
          "Escreva com tranquilidade. As mensagens são lidas apenas pela equipe pastoral e respondidas em até dois dias.",
        formulario: "contato",
      },
    ],
  },
  {
    slug: "celulas",
    titulo: "Células",
    seoTitulo: "Células nos lares — Discipular Igreja",
    seoDescricao:
      "Encontre uma célula perto de você em Lajeado ou Vera Cruz. De terça a quinta, às 20h, nas casas.",
    ordemMenu: 3,
    blocos: [
      {
        tipo: "hero",
        eyebrow: "Células",
        titulo: "A igreja cabe numa sala de estar",
        subtitulo:
          "De terça a quinta, às 20h, abrimos as casas em Lajeado e Vera Cruz. É onde as pessoas param de ser rosto e viram nome.",
        ctaTexto: "Quero participar",
        ctaLink: "/celulas#participar",
      },
      {
        tipo: "texto",
        tema: "claro",
        titulo: "Como funciona",
        corpo:
          "Uma célula tem entre dez e dezoito pessoas e dura cerca de uma hora e meia. Começa com café, segue com uma conversa a partir da Bíblia e termina em oração — sem microfone, sem palco e sem ninguém obrigado a falar.\n\nCada célula tem um líder e um líder em formação. Essa dupla não é detalhe organizacional: é o mecanismo pelo qual a próxima célula nasce.",
      },
      {
        tipo: "cards",
        tema: "creme",
        eyebrow: "O que esperar",
        titulo: "Três coisas que acontecem toda semana",
        colunas: 3,
        itens: [
          {
            titulo: "Uma conversa de verdade",
            texto:
              "O estudo é curto e a conversa é longa. Perguntar é bem-vindo, discordar também.",
          },
          {
            titulo: "Alguém orando por você",
            texto:
              "Terminamos orando uns pelos outros, com o pedido dito em voz alta ou guardado em silêncio.",
          },
          {
            titulo: "Um passo prático",
            texto:
              "Toda semana sai um compromisso pequeno e concreto. Discipulado sem prática vira assunto.",
          },
        ],
      },
      {
        tipo: "formulario",
        tema: "escuro",
        eyebrow: "Participar",
        titulo: "Encontre a célula mais perto de você",
        descricao:
          "Diga seu bairro e o melhor dia da semana. Um líder entra em contato para combinar a primeira visita — e você pode ir só para conhecer.",
        formulario: "quero-celula",
      },
    ],
  },
  {
    slug: "escola",
    titulo: "Escola",
    seoTitulo: "Escola Discipular — Teologia e Trilha",
    seoDescricao:
      "Teologia Discipular às segundas e Trilha Discipular às sextas, às 20h, em Lajeado. R$ 49,90 por mês.",
    ordemMenu: 4,
    blocos: [
      {
        tipo: "hero",
        eyebrow: "Escola Discipular",
        titulo: "Fé que aguenta pergunta",
        subtitulo:
          "Dois caminhos de formação: um para quem está começando, outro para quem vai ensinar. Ambos às 20h, na Sede Lajeado.",
      },
      {
        tipo: "texto",
        tema: "claro",
        corpo:
          "A Escola Discipular existe porque convicção rasa não sobrevive à primeira crise. Estudamos a Bíblia com método, lemos os que vieram antes de nós e aprendemos a discordar sem desprezar.\n\nAs turmas são pequenas de propósito. Há leitura entre os encontros, trabalho por módulo e presença mínima — não porque gostamos de burocracia, mas porque formação sem compromisso não forma.",
      },
      {
        tipo: "cards",
        tema: "creme",
        eyebrow: "Cursos abertos",
        titulo: "Escolha o seu caminho",
        colunas: 2,
        itens: [
          {
            titulo: "Teologia Discipular — segundas, 20h",
            texto:
              "Dois anos de Bíblia, história da igreja e teologia sistemática, com foco no ministério prático. R$ 49,90 por mês. Vagas limitadas.",
            link: "/escola/teologia-discipular",
            linkTexto: "Ver o programa",
          },
          {
            titulo: "Trilha Discipular — sextas, 20h",
            texto:
              "Doze encontros com o essencial da fé cristã, do batismo à primeira pessoa discipulada. R$ 49,90 por mês. Turmas novas a cada trimestre.",
            link: "/escola/trilha-discipular",
            linkTexto: "Ver o programa",
          },
        ],
      },
      {
        tipo: "lista",
        tema: "claro",
        eyebrow: "Antes de se inscrever",
        titulo: "O que você precisa saber",
        itens: [
          {
            titulo: "Não é preciso ser membro",
            texto: "As duas turmas são abertas a quem frequenta a igreja e a quem está apenas conhecendo.",
          },
          {
            titulo: "A mensalidade cobre o material",
            texto:
              "R$ 49,90 por mês, com apostila impressa incluída. Ninguém fica de fora por dificuldade financeira: converse com a secretaria.",
          },
          {
            titulo: "As aulas são presenciais",
            texto: "Na Sede Lajeado, com no máximo duas faltas por módulo.",
          },
        ],
      },
      {
        tipo: "cta",
        tema: "escuro",
        titulo: "Inscrições abertas",
        texto: "As turmas começam em março e agosto. Garanta sua vaga com a secretaria.",
        botaoTexto: "Quero me inscrever",
        botaoLink: "/contato",
      },
    ],
  },
  {
    slug: "contribua",
    titulo: "Contribua",
    seoTitulo: "Contribua — Discipular Igreja",
    seoDescricao:
      "Como contribuir com a Discipular Igreja: PIX, transferência e prestação de contas.",
    ordemMenu: 5,
    blocos: [
      {
        tipo: "hero",
        eyebrow: "Generosidade",
        titulo: "Contribuir é resposta",
        subtitulo:
          "Ninguém aqui é pressionado a dar. Quem dá, dá porque recebeu primeiro — e porque quer ver este trabalho continuar.",
      },
      {
        tipo: "texto",
        tema: "claro",
        titulo: "Para onde vai cada real",
        corpo:
          "As contribuições sustentam o funcionamento das duas casas, o material das células, as bolsas da Escola Discipular e o trabalho social nos bairros onde estamos.\n\nAs contas são revisadas por um conselho que não inclui quem prega, e o relatório é apresentado à membresia duas vezes por ano. Transparência não é gentileza: é o mínimo de quem administra o que é dos outros.",
      },
      {
        tipo: "lista",
        tema: "creme",
        eyebrow: "Como contribuir",
        titulo: "Três caminhos",
        itens: [
          {
            titulo: "PIX",
            texto:
              "Chave: pix@discipular.exemplo.com.br (dado fictício de demonstração). Titular: Associação Discipular Igreja.",
          },
          {
            titulo: "Presencialmente",
            texto: "Nas urnas do culto de celebração, aos domingos, nos dois campi.",
          },
          {
            titulo: "Contribuição recorrente",
            texto:
              "Fale com a secretaria para programar um valor mensal. É o que dá previsibilidade ao planejamento do ano.",
          },
        ],
      },
      {
        tipo: "citacao",
        tema: "escuro",
        texto:
          "Cada um dê conforme determinou em seu coração, não com pesar ou por obrigação, pois Deus ama quem dá com alegria.",
        autor: "2 Coríntios 9.7",
      },
      {
        tipo: "cta",
        tema: "claro",
        titulo: "Dúvidas sobre a prestação de contas?",
        texto: "Escreva para a secretaria. Respondemos com o relatório mais recente em mãos.",
        botaoTexto: "Falar com a secretaria",
        botaoLink: "/contato",
      },
    ],
  },
];

interface PessoaDemo {
  nome: string;
  status: StatusPessoa;
  genero: Genero;
  estadoCivil?: EstadoCivil;
  celula?: string;
  campus: string;
  bairro: string;
  cidade: string;
  batizado?: boolean;
  origem?: OrigemCadastro;
  igrejaAnterior?: string;
  /** Fictício. Existe para demonstrar o filtro de `pessoas.lerSensivel`. */
  observacoesPastorais?: string;
}

const SEDE = "Sede Lajeado";
const VERA_CRUZ = "Campus Vera Cruz";

const PESSOAS: PessoaDemo[] = [
  { nome: "Alice Bergmann", status: "MEMBRO", genero: "FEMININO", estadoCivil: "CASADO", celula: "Célula Betânia", campus: SEDE, bairro: "Centro", cidade: "Lajeado", batizado: true },
  { nome: "Bruno Kunzler", status: "MEMBRO", genero: "MASCULINO", estadoCivil: "CASADO", celula: "Célula Emaús", campus: SEDE, bairro: "Florestal", cidade: "Lajeado", batizado: true },
  { nome: "Carla Meurer", status: "CONGREGANTE", genero: "FEMININO", celula: "Célula Betânia", campus: SEDE, bairro: "Centro", cidade: "Lajeado" },
  { nome: "Diego Ohlweiler", status: "VISITANTE", genero: "MASCULINO", campus: SEDE, bairro: "Moinhos", cidade: "Lajeado", origem: "SITE" },
  { nome: "Elisa Grings", status: "EM_ACOMPANHAMENTO", genero: "FEMININO", celula: "Célula Cafarnaum", campus: SEDE, bairro: "São Cristóvão", cidade: "Lajeado", observacoesPastorais: "Dado fictício de demonstração: em acompanhamento após perda familiar. Visita agendada com a equipe de cuidado." },
  { nome: "Fábio Radaelli", status: "MEMBRO", genero: "MASCULINO", estadoCivil: "CASADO", celula: "Célula Antioquia", campus: SEDE, bairro: "Moinhos", cidade: "Lajeado", batizado: true },
  { nome: "Gabriela Wolff", status: "MEMBRO", genero: "FEMININO", celula: "Célula Emaús", campus: SEDE, bairro: "Florestal", cidade: "Lajeado", batizado: true },
  { nome: "Henrique Bassani", status: "CONGREGANTE", genero: "MASCULINO", celula: "Célula Cafarnaum", campus: SEDE, bairro: "São Cristóvão", cidade: "Lajeado" },
  { nome: "Isadora Pletsch", status: "VISITANTE", genero: "FEMININO", campus: SEDE, bairro: "Conventos", cidade: "Lajeado", origem: "SITE" },
  { nome: "João Vitor Spohr", status: "MEMBRO", genero: "MASCULINO", estadoCivil: "SOLTEIRO", celula: "Célula Betânia", campus: SEDE, bairro: "Centro", cidade: "Lajeado", batizado: true },
  { nome: "Karine Dallmann", status: "EM_ACOMPANHAMENTO", genero: "FEMININO", campus: SEDE, bairro: "Conventos", cidade: "Lajeado", origem: "CELULA" },
  { nome: "Leandro Fiegenbaum", status: "MEMBRO", genero: "MASCULINO", celula: "Célula Antioquia", campus: SEDE, bairro: "Moinhos", cidade: "Lajeado", batizado: true },
  { nome: "Manuela Beck", status: "INATIVO", genero: "FEMININO", campus: SEDE, bairro: "Centro", cidade: "Lajeado" },
  { nome: "Nícolas Guerra", status: "MEMBRO", genero: "MASCULINO", celula: "Célula Emaús", campus: SEDE, bairro: "Florestal", cidade: "Lajeado", batizado: true },
  { nome: "Olívia Sanchez", status: "CONGREGANTE", genero: "FEMININO", celula: "Célula Cafarnaum", campus: SEDE, bairro: "São Cristóvão", cidade: "Lajeado" },
  { nome: "Pedro Henrique Lorenzi", status: "VISITANTE", genero: "MASCULINO", campus: SEDE, bairro: "Centro", cidade: "Lajeado", origem: "SITE" },
  { nome: "Queila Marques", status: "MEMBRO", genero: "FEMININO", estadoCivil: "UNIAO_ESTAVEL", celula: "Célula Antioquia", campus: SEDE, bairro: "Moinhos", cidade: "Lajeado", batizado: true },
  { nome: "Rafael Tonet", status: "TRANSFERIDO", genero: "MASCULINO", campus: SEDE, bairro: "Centro", cidade: "Lajeado", batizado: true, igrejaAnterior: "Comunidade Fictícia de Estrela" },
  { nome: "Sabrina Kroth", status: "MEMBRO", genero: "FEMININO", celula: "Célula Filadélfia", campus: VERA_CRUZ, bairro: "Centro", cidade: "Vera Cruz", batizado: true },
  { nome: "Thiago Bohn", status: "CONGREGANTE", genero: "MASCULINO", celula: "Célula Filadélfia", campus: VERA_CRUZ, bairro: "Centro", cidade: "Vera Cruz" },
  { nome: "Úrsula Wagner", status: "EM_ACOMPANHAMENTO", genero: "FEMININO", celula: "Célula Éfeso", campus: VERA_CRUZ, bairro: "Linha Andréas", cidade: "Vera Cruz", observacoesPastorais: "Dado fictício de demonstração: pediu acompanhamento sobre finanças da família." },
  { nome: "Vinícius Klein", status: "MEMBRO", genero: "MASCULINO", estadoCivil: "CASADO", celula: "Célula Éfeso", campus: VERA_CRUZ, bairro: "Linha Andréas", cidade: "Vera Cruz", batizado: true },
  { nome: "Yasmin Ferrão", status: "VISITANTE", genero: "FEMININO", campus: VERA_CRUZ, bairro: "Centro", cidade: "Vera Cruz", origem: "SITE" },
  { nome: "Zeca Andrade", status: "MEMBRO", genero: "MASCULINO", celula: "Célula Filadélfia", campus: VERA_CRUZ, bairro: "Centro", cidade: "Vera Cruz", batizado: true },
  { nome: "Bianca Rohde", status: "INATIVO", genero: "FEMININO", campus: VERA_CRUZ, bairro: "Linha Andréas", cidade: "Vera Cruz" },
];

interface SubmissaoDemo {
  tipo: TipoSubmissao;
  status: StatusSubmissao;
  nome: string;
  email?: string;
  telefone?: string;
  paginaOrigem: string;
  scoreSpam?: number;
  notaInterna?: string;
  diasAtras: number;
  dados: Record<string, unknown>;
}

const SUBMISSOES: SubmissaoDemo[] = [
  {
    tipo: "VISITANTE",
    status: "NOVO",
    nome: "Bianca Trevisan",
    email: "bianca.trevisan@exemplo.com.br",
    telefone: telefoneFicticio(101),
    paginaOrigem: "/visita",
    diasAtras: 1,
    dados: {
      comoConheceu: "AMIGO",
      primeiraVisita: true,
      faixaEtaria: "ADULTO",
      querContato: true,
      querVisitaPastoral: false,
      mensagem: "Uma colega de trabalho me convidou para o culto de domingo. Gostaria de conhecer antes de levar meus filhos.",
      consentimentoLgpd: true,
    },
  },
  {
    tipo: "NOVO_MEMBRO",
    status: "EM_ANALISE",
    nome: "Rodrigo Sartori",
    email: "rodrigo.sartori@exemplo.com.br",
    telefone: telefoneFicticio(102),
    paginaOrigem: "/quero-ser-membro",
    diasAtras: 4,
    notaInterna: "Aguardando conversa com a equipe pastoral antes de efetivar o cadastro.",
    dados: {
      genero: "MASCULINO",
      estadoCivil: "CASADO",
      cidade: "Lajeado",
      bairro: "Florestal",
      uf: "RS",
      jaEConvertido: true,
      jaEBatizado: true,
      igrejaAnterior: "Igreja Fictícia de Encantado",
      motivoTransferencia: "Mudamos de cidade por causa do trabalho e queremos servir aqui.",
      participaCelula: true,
      areasInteresse: ["LOUVOR", "MIDIA"],
      consentimentoLgpd: true,
    },
  },
  {
    tipo: "BATISMO",
    status: "NOVO",
    nome: "Camila Fontoura",
    email: "camila.fontoura@exemplo.com.br",
    telefone: telefoneFicticio(103),
    paginaOrigem: "/batismo",
    diasAtras: 2,
    dados: {
      aceitouJesus: true,
      testemunho: "Comecei a frequentar a célula do bairro em março e entreguei minha vida a Jesus em junho. Quero declarar isso publicamente.",
      jaFoiBatizado: false,
      participaCelula: true,
      menorIdade: false,
      consentimentoLgpd: true,
    },
  },
  {
    tipo: "PEDIDO_ORACAO",
    status: "CONCLUIDO",
    nome: "Helena Duarte",
    email: "helena.duarte@exemplo.com.br",
    paginaOrigem: "/oracao",
    diasAtras: 12,
    notaInterna: "Encaminhado ao grupo de intercessão. Retorno feito por telefone.",
    dados: {
      anonimo: false,
      categoria: "SAUDE",
      titulo: "Exames da minha filha",
      pedido: "Minha filha faz exames na próxima semana e estamos ansiosos. Peço oração por paz e por um bom resultado.",
      urgente: false,
      visibilidade: "PRIVADO",
      querContatoPastoral: true,
      consentimentoLgpd: true,
    },
  },
  {
    tipo: "CONTATO",
    status: "NOVO",
    nome: "Eduardo Lang",
    email: "eduardo.lang@exemplo.com.br",
    telefone: telefoneFicticio(104),
    paginaOrigem: "/contato",
    diasAtras: 0,
    dados: {
      assunto: "Uso do espaço para ensaio de coral",
      mensagem: "Sou regente de um coral comunitário e gostaria de saber se há possibilidade de usar o auditório às quartas à tarde.",
      consentimentoLgpd: true,
    },
  },
  {
    tipo: "INSCRICAO_CURSO",
    status: "EM_ANALISE",
    nome: "Priscila Amaral",
    email: "priscila.amaral@exemplo.com.br",
    telefone: telefoneFicticio(105),
    paginaOrigem: "/escola",
    diasAtras: 6,
    dados: {
      curso: "Teologia Discipular",
      jaEMembro: true,
      observacoes: "Posso pagar a mensalidade no início de cada mês.",
      consentimentoLgpd: true,
    },
  },
  {
    tipo: "QUERO_CELULA",
    status: "NOVO",
    nome: "Tiago Bencke",
    telefone: telefoneFicticio(106),
    paginaOrigem: "/celulas",
    diasAtras: 3,
    dados: {
      bairro: "Conventos",
      cidade: "Lajeado",
      diaPreferido: 3,
      observacoes: "Trabalho até as 19h, prefiro células que comecem às 20h.",
      consentimentoLgpd: true,
    },
  },
  {
    /**
     * Submissão de spam já classificada. Existe para que a triagem possa ser
     * testada com o caso real: score alto, status SPAM, e nenhum e-mail de
     * notificação disparado.
     */
    tipo: "CONTATO",
    status: "SPAM",
    nome: "Best Crypto Invest Now",
    email: "no-reply@exemplo-spam.invalid",
    paginaOrigem: "/contato",
    scoreSpam: 175,
    diasAtras: 5,
    notaInterna: "Honeypot preenchido e três links no corpo. Classificado automaticamente.",
    dados: {
      assunto: "URGENT business proposal",
      mensagem: "Double your investment today https://exemplo-spam.invalid https://exemplo-spam.invalid https://exemplo-spam.invalid",
      consentimentoLgpd: true,
    },
  },
];

interface OracaoDemo {
  titulo: string;
  categoria: string;
  pedido: string;
  visibilidade: VisibilidadeOracao;
  status: StatusOracao;
  urgente?: boolean;
  anonimo?: boolean;
  /** Nome de uma pessoa já cadastrada, para vincular o pedido. */
  pessoa?: string;
  contadorOracoes?: number;
  respostaTestemunho?: string;
  diasAtras: number;
}

const PEDIDOS_ORACAO: OracaoDemo[] = [
  {
    titulo: "Cirurgia da minha mãe",
    categoria: "SAUDE",
    pedido: "Minha mãe opera na quinta-feira. Peço oração pela equipe médica e pela recuperação dela.",
    visibilidade: "PRIVADO",
    status: "ORANDO",
    urgente: true,
    pessoa: "Alice Bergmann",
    diasAtras: 2,
  },
  {
    /** Anônimo: sem pessoa vinculada e sem nome do solicitante. */
    titulo: "Restauração do meu casamento",
    categoria: "FAMILIA",
    pedido: "Estamos passando por um momento muito difícil em casa. Prefiro não me identificar, mas preciso muito de oração.",
    visibilidade: "PRIVADO",
    status: "RECEBIDO",
    anonimo: true,
    diasAtras: 5,
  },
  {
    titulo: "Gratidão pelo novo emprego",
    categoria: "GRATIDAO",
    pedido: "Depois de sete meses procurando, fui chamado. Quero agradecer com a igreja.",
    visibilidade: "MURAL_MEMBROS",
    status: "RESPONDIDO",
    pessoa: "Bruno Kunzler",
    contadorOracoes: 41,
    respostaTestemunho: "Começou no dia 1º. Ele contou o testemunho na célula e a casa inteira agradeceu junto.",
    diasAtras: 21,
  },
  {
    titulo: "Provisão para a família",
    categoria: "FINANCEIRO",
    pedido: "As contas apertaram depois de um imprevisto com o carro. Peço sabedoria para organizar o orçamento.",
    visibilidade: "PRIVADO",
    status: "RECEBIDO",
    pessoa: "Úrsula Wagner",
    diasAtras: 8,
  },
  {
    titulo: "Pela nossa cidade",
    categoria: "ESPIRITUAL",
    pedido: "Que Lajeado e Vera Cruz conheçam Jesus. Oramos pelas escolas, pelas famílias e pelas autoridades.",
    visibilidade: "PUBLICO",
    status: "ORANDO",
    pessoa: "Fábio Radaelli",
    contadorOracoes: 128,
    diasAtras: 30,
  },
  {
    titulo: "Luto pela partida do meu pai",
    categoria: "LUTO",
    pedido: "Meu pai faleceu no domingo. Peço consolo para a minha mãe e forças para os próximos dias.",
    visibilidade: "MURAL_MEMBROS",
    status: "RECEBIDO",
    pessoa: "Elisa Grings",
    contadorOracoes: 63,
    diasAtras: 4,
  },
];

interface MensagemDemo {
  titulo: string;
  slug: string;
  serie: string;
  preletor: string;
  descricao: string;
  destaque?: boolean;
  diasAtras: number;
  duracaoSegundos: number;
}

const MENSAGENS: MensagemDemo[] = [
  {
    titulo: "Uma casa de discípulos",
    slug: "uma-casa-de-discipulos",
    serie: "Fundamentos",
    preletor: "Pr. Paulo Bittencourt",
    descricao: "A Grande Comissão não pede eventos maiores; pede pessoas que ensinam pessoas. O que muda numa igreja quando ela leva Mateus 28.19 a sério.",
    destaque: true,
    diasAtras: 6,
    duracaoSegundos: 2_640,
  },
  {
    titulo: "Adoração antes da agenda",
    slug: "adoracao-antes-da-agenda",
    serie: "Os seis pilares",
    preletor: "Pra. Ana Ribeiro",
    descricao: "Primeiro pilar. Por que a adoração não é a abertura do culto, e como isso reorganiza a semana de quem serve.",
    diasAtras: 13,
    duracaoSegundos: 2_280,
  },
  {
    titulo: "A Palavra que permanece",
    slug: "a-palavra-que-permanece",
    serie: "Os seis pilares",
    preletor: "Pr. Daniel Kessler",
    descricao: "Segundo pilar. Ler a Bíblia inteira, inclusive as partes que não cabem numa frase de efeito.",
    diasAtras: 20,
    duracaoSegundos: 2_520,
  },
  {
    titulo: "Comunhão não é evento",
    slug: "comunhao-nao-e-evento",
    serie: "Os seis pilares",
    preletor: "Pr. Paulo Bittencourt",
    descricao: "Terceiro pilar. A diferença entre frequentar a mesma sala e pertencer à mesma casa.",
    diasAtras: 27,
    duracaoSegundos: 2_400,
  },
];

// =============================================================================
// EXECUÇÃO
// =============================================================================

async function main(): Promise<void> {
  carregarDotEnv();

  /**
   * Trava de produção. Este seed cria contas de demonstração com papéis
   * privilegiados; numa base real elas seriam exatamente o tipo de porta
   * esquecida que ninguém audita. Quem realmente precisar (ex.: bootstrap do
   * primeiro super admin) declara a intenção de forma explícita.
   */
  if (process.env.NODE_ENV === "production" && process.env.SEED_PERMITIR_PRODUCAO !== "sim") {
    throw new Error(
      "Este seed cria dados de DEMONSTRAÇÃO e contas privilegiadas. " +
        "Ele não roda com NODE_ENV=production. Se você tem certeza, defina " +
        "SEED_PERMITIR_PRODUCAO=sim.",
    );
  }

  // Imports dinâmicos: só depois do `.env` carregado (ver `carregarDotEnv`).
  const { prisma } = await import("@/lib/db/prisma");
  desconectarBanco = () => prisma.$disconnect();

  const { tenantDb } = await import("@/lib/db/tenant-client");
  const { hashSenha, validarForca } = await import("@/lib/auth/password");
  const { schemaBlocos } = await import("@/lib/validation/blocos");

  const ehProducao = process.env.NODE_ENV === "production";

  /**
   * Valida os blocos com o MESMO schema usado pelo editor do painel.
   *
   * Um seed é uma porta de entrada de dados que não passa pelas Server Actions.
   * Se ele gravasse um bloco fora do formato, a página do site simplesmente
   * deixaria de renderizar aquela seção (`blocosSeguros` descarta inválidos) e
   * o motivo ficaria invisível. Validando aqui, o erro aparece no seed.
   */
  const blocos = (valor: unknown[]): unknown => schemaBlocos.parse(valor);

  // ---------------------------------------------------------------------------
  // 1. Super admin da plataforma
  // ---------------------------------------------------------------------------

  const emailAdmin = (process.env.SEED_ADMIN_EMAIL ?? "super@discipular.exemplo.com.br")
    .trim()
    .toLowerCase();
  const senhaAdminEnv = process.env.SEED_ADMIN_SENHA?.trim();

  /**
   * Cria o usuário se não existir; se existir, NUNCA rotaciona a senha por
   * conta própria. Rotacionar a cada `npm run db:seed` invalidaria o acesso de
   * quem já configurou o ambiente e faria o segredo aparecer no terminal (e no
   * histórico de scroll, e no log do CI) repetidas vezes.
   *
   * A exceção é intencional: se `SEED_ADMIN_SENHA` foi informada, ela é a fonte
   * da verdade e o seed a reaplica — mas não a imprime, porque o operador já a
   * tem em mãos.
   */
  async function garantirUsuario(dados: {
    email: string;
    nome: string;
    telefone?: string;
    plataformaAdmin?: boolean;
    senhaExplicita?: string;
    rotulo: string;
  }): Promise<string> {
    const existente = await prisma.user.findUnique({
      where: { email: dados.email },
      select: { id: true },
    });

    if (existente) {
      await prisma.user.update({
        where: { id: existente.id },
        data: {
          nome: dados.nome,
          telefone: dados.telefone ?? null,
          plataformaAdmin: dados.plataformaAdmin ?? false,
          ativo: true,
          // Zera qualquer bloqueio por força bruta acumulado em testes.
          tentativasFalhas: 0,
          bloqueadoAte: null,
          ...(dados.senhaExplicita
            ? {
                senhaHash: await hashSenha(dados.senhaExplicita),
                senhaAtualizadaEm: new Date(),
              }
            : {}),
        },
      });
      contagem.atualizados += 1;
      credenciais.push({
        rotulo: dados.rotulo,
        email: dados.email,
        senha: null,
        observacao: dados.senhaExplicita
          ? "senha reaplicada a partir de SEED_ADMIN_SENHA (não exibida)"
          : "conta já existia — senha preservada",
      });
      return existente.id;
    }

    const senha = dados.senhaExplicita ?? gerarSenhaForte(validarForca);
    const criado = await prisma.user.create({
      data: {
        email: dados.email,
        nome: dados.nome,
        telefone: dados.telefone ?? null,
        senhaHash: await hashSenha(senha),
        plataformaAdmin: dados.plataformaAdmin ?? false,
        emailVerificadoEm: new Date(),
        ativo: true,
      },
      select: { id: true },
    });
    contagem.criados += 1;
    credenciais.push({
      rotulo: dados.rotulo,
      email: dados.email,
      // Senha vinda do ambiente não é reimpressa: já é conhecida de quem rodou.
      senha: dados.senhaExplicita ? null : senha,
      observacao: dados.senhaExplicita ? "senha definida via SEED_ADMIN_SENHA" : undefined,
    });
    return criado.id;
  }

  const idSuperAdmin = await garantirUsuario({
    email: emailAdmin,
    nome: "Super Admin da Plataforma",
    plataformaAdmin: true,
    senhaExplicita: senhaAdminEnv && senhaAdminEnv.length > 0 ? senhaAdminEnv : undefined,
    rotulo: "SUPER ADMIN (plataforma)",
  });

  // ---------------------------------------------------------------------------
  // 2. Tenant de demonstração — Discipular Igreja
  // ---------------------------------------------------------------------------

  const discipular = await prisma.tenant.upsert({
    where: { slug: "discipular" },
    update: {
      nome: "Discipular Igreja",
      status: "ATIVO",
      plano: "MULTISEDE",
      limiteUsuarios: 25,
      limitePessoas: 5_000,
      limiteStorageMb: 2_048,
      excluidoEm: null,
    },
    create: {
      slug: "discipular",
      nome: "Discipular Igreja",
      razaoSocial: "Associação Discipular Igreja (dados fictícios)",
      status: "ATIVO",
      plano: "MULTISEDE",
      limiteUsuarios: 25,
      limitePessoas: 5_000,
      limiteStorageMb: 2_048,
    },
    select: { id: true },
  });
  const tenantDiscipular = discipular.id;
  const db = tenantDb(tenantDiscipular);

  /**
   * Domínio local. `*.localhost` já resolve pelo caminho de subdomínio da
   * plataforma, mas registrar o host torna o `hostCanonico` (usado em links
   * absolutos e no manifest do PWA) apontar para o endereço de desenvolvimento.
   * Em produção isso seria errado — daí a guarda.
   */
  if (!ehProducao) {
    await prisma.tenantDomain.upsert({
      where: { hostname: "discipular.localhost" },
      update: { tenantId: tenantDiscipular, principal: true, status: "VERIFICADO" },
      create: {
        tenantId: tenantDiscipular,
        hostname: "discipular.localhost",
        principal: true,
        status: "VERIFICADO",
        tokenVerificacao: randomBytes(24).toString("hex"),
        verificadoEm: new Date(),
      },
    });
  }

  /**
   * PRODUÇÃO — o domínio RAIZ é, ao mesmo tempo:
   *   • o site público desta primeira igreja (discipularigreja.com.br/)
   *   • o painel dela                        (.../painel)
   *   • o app dos membros                    (.../app)
   *   • a central do super admin             (.../plataforma)
   *
   * Para isso registramos o apex como domínio VERIFICADO e principal desta
   * igreja. `resolverTenantPorHost` passa a devolver esta igreja quando alguém
   * acessa o domínio raiz; a área /plataforma continua funcionando porque tem
   * rota própria e `ehHostDaPlataforma()` reconhece o domínio raiz.
   *
   * As DEMAIS igrejas que você cadastrar depois ganham subdomínios
   * (igreja.discipularigreja.com.br) — é por isso que o DNS precisa do curinga.
   */
  const rootDomain = (process.env.ROOT_DOMAIN ?? "").toLowerCase().trim();
  if (ehProducao && rootDomain && !rootDomain.includes("localhost")) {
    await prisma.tenantDomain.upsert({
      where: { hostname: rootDomain },
      update: {
        tenantId: tenantDiscipular,
        principal: true,
        status: "VERIFICADO",
        verificadoEm: new Date(),
      },
      create: {
        tenantId: tenantDiscipular,
        hostname: rootDomain,
        principal: true,
        status: "VERIFICADO",
        tokenVerificacao: randomBytes(24).toString("hex"),
        verificadoEm: new Date(),
      },
    });

    /**
     * O super admin também ADMINISTRA esta primeira igreja. Sem este vínculo,
     * ao logar no domínio raiz (que agora resolve para a igreja) ele seria
     * barrado por "sem vínculo com o tenant". Com o papel ADMIN, ele entra no
     * painel da igreja e, sendo plataformaAdmin, acessa /plataforma pelo menu.
     */
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenantDiscipular, userId: idSuperAdmin } },
      update: { papel: "ADMIN", ativo: true },
      create: {
        tenantId: tenantDiscipular,
        userId: idSuperAdmin,
        papel: "ADMIN",
        ativo: true,
      },
    });
  }

  // --- SiteConfig -------------------------------------------------------------

  await garantir(
    db.siteConfig,
    // SiteConfig é 1:1 com o tenant; dentro do cliente escopado, `{}` já
    // significa "o registro desta igreja".
    {},
    {
      nomeExibicao: "Discipular Igreja",
      tagline: "Uma Casa de Discípulos",
      descricaoSeo:
        "Igreja cristã em Lajeado e Vera Cruz, no Rio Grande do Sul. Cultos, células nos lares, Escola Discipular e discipulado pessoal. Uma Casa de Discípulos.",

      ...TEMA_PB,

      heroEyebrow: "Seja bem-vindo",
      heroTitulo: "Discipular Igreja",
      heroSubtitulo: "Uma Casa de Discípulos!",
      heroCtaTexto: "Conheça mais",
      heroCtaLink: "/quem-somos",

      // Conteúdo público real, já divulgado em discipularigreja.com.br.
      emailContato: "contato@discipularigreja.com.br",
      telefoneContato: "5551992668095",
      whatsapp: "5551992668095",

      instagram: "https://www.instagram.com/discipularigreja/",
      youtube: "https://www.youtube.com/@DiscipularIgreja",
      spotify: null,
      facebook: null,

      // Chave PIX real da igreja (CNPJ), divulgada publicamente no site para
      // ofertas. É informação pública de doação, não segredo.
      pixChave: "54746859000173",
      pixTitular: "Discipular Igreja",
      pixDescricao:
        "Queremos muito avançar na proclamação do Evangelho e, para isso, a sua generosidade é fundamental. Estamos, juntos, construindo uma história com e para Jesus. Use a chave PIX (CNPJ) no app do seu banco.",

      pwaNome: "Discipular Igreja",
      pwaNomeCurto: "Discipular",
      pwaCorTema: "#0A0A0B",

      modulos: {
        site: true,
        aoVivo: true,
        mensagens: true,
        celulas: true,
        escola: true,
        oracao: true,
        batismo: true,
        contribua: true,
        app: true,
      },
    },
  );

  // --- Campi ------------------------------------------------------------------

  const campi = new Map<string, string>();

  campi.set(
    SEDE,
    await garantir(
      db.campus,
      { nome: SEDE },
      {
        descricao: "Auditório principal, secretaria e Escola Discipular.",
        cep: "95900000",
        logradouro: "RSC-453",
        numero: "1186",
        complemento: "pv 04",
        bairro: "Floresta",
        cidade: "Lajeado",
        uf: "RS",
        telefone: telefoneFicticio(1),
        principal: true,
        ordem: 0,
        ativo: true,
      },
    ),
  );

  campi.set(
    VERA_CRUZ,
    await garantir(
      db.campus,
      { nome: VERA_CRUZ },
      {
        descricao: "Campus com culto de celebração aos domingos e células no vale.",
        cep: "96880000",
        logradouro: "R. Jacob Schneider",
        numero: "111",
        bairro: "Centro",
        cidade: "Vera Cruz",
        uf: "RS",
        telefone: telefoneFicticio(3),
        principal: false,
        ordem: 1,
        ativo: true,
      },
    ),
  );

  // --- Agenda -----------------------------------------------------------------

  const agenda: {
    titulo: string;
    tipo: TipoAgenda;
    diaSemana: number | null;
    horario: string | null;
    descricao: string;
    campus?: string;
    destaque?: boolean;
    ordem: number;
  }[] = [
    {
      titulo: "Culto de Celebração",
      tipo: "CULTO",
      diaSemana: 0,
      horario: "18:30",
      descricao: "Nosso encontro da semana inteira. Adoração, Palavra e ceia no primeiro domingo do mês.",
      campus: SEDE,
      destaque: true,
      ordem: 0,
    },
    {
      titulo: "Teologia Discipular",
      tipo: "ESCOLA",
      diaSemana: 1,
      horario: "20:00",
      descricao: "Formação bíblica e teológica para quem quer ensinar com responsabilidade.",
      campus: SEDE,
      ordem: 1,
    },
    {
      titulo: "Trilha Discipular",
      tipo: "ESCOLA",
      diaSemana: 5,
      horario: "20:00",
      descricao: "Os primeiros passos da vida cristã, em turmas pequenas e com acompanhamento pessoal.",
      campus: SEDE,
      ordem: 2,
    },
    {
      titulo: "Células nos lares",
      tipo: "CELULA",
      // Sem dia fixo: as células acontecem de terça a quinta, cada uma no seu
      // bairro. O site mostra o mapa; a agenda mostra a janela da semana.
      diaSemana: null,
      horario: "20:00",
      descricao: "De terça a quinta, às 20h, nas casas de Lajeado e Vera Cruz. Encontre a mais perto de você.",
      ordem: 3,
    },
  ];

  for (const item of agenda) {
    await garantir(
      db.agendaItem,
      { titulo: item.titulo },
      {
        tipo: item.tipo,
        descricao: item.descricao,
        diaSemana: item.diaSemana,
        horario: item.horario,
        recorrente: true,
        destaque: item.destaque ?? false,
        ordem: item.ordem,
        ativo: true,
        publicoSite: true,
        campusId: item.campus ? campi.get(item.campus) : null,
      },
    );
  }

  // --- Cursos -----------------------------------------------------------------

  const cursos: {
    nome: string;
    slug: string;
    resumo: string;
    descricao: string;
    diaSemana: number;
    vagas: number;
    ordem: number;
  }[] = [
    {
      nome: "Teologia Discipular",
      slug: "teologia-discipular",
      resumo: "Dois anos de formação bíblica e teológica para quem ensina — ou quer ensinar — na igreja.",
      descricao:
        "Um curso para quem já não se satisfaz com respostas prontas. Percorremos a Bíblia inteira, a história da igreja e a teologia sistemática com rigor e devoção, sempre com o alvo do ministério prático.\n\nAs aulas acontecem às segundas-feiras, às 20h, na Sede Lajeado. Turmas pequenas, leitura obrigatória e um trabalho por módulo.",
      diaSemana: 1,
      vagas: 60,
      ordem: 0,
    },
    {
      nome: "Trilha Discipular",
      slug: "trilha-discipular",
      resumo: "Os primeiros passos de quem decidiu seguir Jesus — do batismo à primeira pessoa discipulada.",
      descricao:
        "A Trilha é o caminho de entrada da nossa casa. Em doze encontros percorremos o essencial: quem é Jesus, o que é o evangelho, o que significa pertencer a uma igreja e como começar a discipular alguém.\n\nÀs sextas-feiras, às 20h, na Sede Lajeado. Quem termina a Trilha é convidado a caminhar com um discipulador por seis meses.",
      diaSemana: 5,
      vagas: 40,
      ordem: 1,
    },
  ];

  for (const curso of cursos) {
    await garantir(
      db.curso,
      { slug: curso.slug },
      {
        nome: curso.nome,
        resumo: curso.resumo,
        descricao: curso.descricao,
        diaSemana: curso.diaSemana,
        horario: "20:00",
        // Sempre em centavos: 4990 = R$ 49,90. Nunca float para dinheiro.
        precoCentavos: 4_990,
        periodicidade: "MENSAL",
        vagas: curso.vagas,
        inscricoesAbertas: true,
        ativo: true,
        ordem: curso.ordem,
      },
    );
  }

  // --- Células ----------------------------------------------------------------

  const celulasDemo: {
    nome: string;
    diaSemana: number;
    horario: string;
    lider: string;
    bairro: string;
    cidade: string;
    campus: string;
    capacidade: number;
    descricao: string;
  }[] = [
    { nome: "Célula Betânia", diaSemana: 2, horario: "20:00", lider: "Marcos Vieira", bairro: "Centro", cidade: "Lajeado", campus: SEDE, capacidade: 16, descricao: "Casais e solteiros, com espaço para as crianças na sala ao lado." },
    { nome: "Célula Emaús", diaSemana: 3, horario: "20:00", lider: "Gabriela Wolff", bairro: "Florestal", cidade: "Lajeado", campus: SEDE, capacidade: 14, descricao: "Grupo de jovens adultos, com jantar simples antes do estudo." },
    { nome: "Célula Cafarnaum", diaSemana: 4, horario: "20:00", lider: "Henrique Bassani", bairro: "São Cristóvão", cidade: "Lajeado", campus: SEDE, capacidade: 18, descricao: "Aberta a visitantes; metade da casa começou aqui." },
    { nome: "Célula Antioquia", diaSemana: 2, horario: "20:00", lider: "Fábio Radaelli", bairro: "Moinhos", cidade: "Lajeado", campus: SEDE, capacidade: 15, descricao: "Foco em missão local e apoio ao trabalho social do bairro." },
    { nome: "Célula Filadélfia", diaSemana: 3, horario: "19:30", lider: "Sabrina Kroth", bairro: "Centro", cidade: "Vera Cruz", campus: VERA_CRUZ, capacidade: 16, descricao: "A primeira célula do campus de Vera Cruz." },
    { nome: "Célula Éfeso", diaSemana: 4, horario: "20:00", lider: "Vinícius Klein", bairro: "Linha Andréas", cidade: "Vera Cruz", campus: VERA_CRUZ, capacidade: 12, descricao: "Encontro no interior, com carona combinada pelo grupo." },
  ];

  const celulas = new Map<string, string>();
  for (let i = 0; i < celulasDemo.length; i += 1) {
    const c = celulasDemo[i]!;
    celulas.set(
      c.nome,
      await garantir(
        db.celula,
        { nome: c.nome },
        {
          descricao: c.descricao,
          diaSemana: c.diaSemana,
          horario: c.horario,
          liderNome: c.lider,
          liderTelefone: telefoneFicticio(200 + i),
          bairro: c.bairro,
          cidade: c.cidade,
          campusId: campi.get(c.campus),
          capacidade: c.capacidade,
          // Latitude/longitude ficam nulas de propósito: o endereço de uma
          // célula é a casa de um membro e não vai para campo público.
          latitude: null,
          longitude: null,
          ativa: true,
        },
      ),
    );
  }

  // --- Ao vivo ----------------------------------------------------------------

  await garantir(
    db.liveConfig,
    {},
    {
      // Modo AGENDA: sem chave da API do YouTube configurada, a detecção
      // automática não funcionaria e o indicador ficaria mentindo. A janela
      // diz a verdade sem depender de integração externa.
      modo: "AGENDA",
      forcarAoVivo: false,
      janelas: [{ diaSemana: 0, inicio: "18:00", fim: "21:00" }],
      fusoHorario: "America/Sao_Paulo",
      mensagemAoVivo: "Estamos ao vivo — entre e adore com a gente.",
      exibirNoSite: true,
      exibirNoApp: true,
      youtubeChannelId: null,
      youtubeVideoIdManual: null,
    },
  );

  // --- Páginas do site --------------------------------------------------------

  for (const pagina of PAGINAS_DISCIPULAR) {
    await garantir(
      db.sitePagina,
      { slug: pagina.slug },
      {
        titulo: pagina.titulo,
        seoTitulo: pagina.seoTitulo,
        seoDescricao: pagina.seoDescricao,
        blocos: blocos(pagina.blocos),
        publicada: true,
        mostrarMenu: true,
        ordemMenu: pagina.ordemMenu,
        sistema: pagina.sistema ?? false,
      },
    );
  }

  // --- Usuários do tenant e vínculos -----------------------------------------

  /**
   * O líder de célula recebe `celulaId` no Membership. Sem isso,
   * `filtroDeEscopo()` devolve `{ celulaId: "__sem-celula__" }` e ele não vê
   * ninguém — falha fechada, correta, mas péssima para demonstrar o produto.
   */
  const usuariosTenant: {
    email: string;
    nome: string;
    papel: Papel;
    celula?: string;
    rotulo: string;
  }[] = [
    { email: "ana.ribeiro@exemplo.com.br", nome: "Ana Ribeiro", papel: "ADMIN", rotulo: "ADMIN · Discipular" },
    { email: "paulo.bittencourt@exemplo.com.br", nome: "Paulo Bittencourt", papel: "PASTOR", rotulo: "PASTOR · Discipular" },
    { email: "marta.kunz@exemplo.com.br", nome: "Marta Kunz", papel: "SECRETARIA", rotulo: "SECRETARIA · Discipular" },
    { email: "marcos.vieira@exemplo.com.br", nome: "Marcos Vieira", papel: "LIDER_CELULA", celula: "Célula Betânia", rotulo: "LÍDER DE CÉLULA · Discipular" },
  ];

  for (let i = 0; i < usuariosTenant.length; i += 1) {
    const u = usuariosTenant[i]!;
    const userId = await garantirUsuario({
      email: u.email,
      nome: u.nome,
      telefone: telefoneFicticio(300 + i),
      rotulo: u.rotulo,
    });

    // Membership é global (sem tenantId no cliente escopado) e tem chave única
    // composta própria — aqui o `upsert` direto é seguro e legível.
    await prisma.membership.upsert({
      where: { tenantId_userId: { tenantId: tenantDiscipular, userId } },
      update: {
        papel: u.papel,
        ativo: true,
        celulaId: u.celula ? (celulas.get(u.celula) ?? null) : null,
      },
      create: {
        tenantId: tenantDiscipular,
        userId,
        papel: u.papel,
        ativo: true,
        celulaId: u.celula ? (celulas.get(u.celula) ?? null) : null,
      },
    });
  }

  // --- Pessoas ----------------------------------------------------------------

  const pessoas = new Map<string, string>();

  for (let i = 0; i < PESSOAS.length; i += 1) {
    const p = PESSOAS[i]!;
    const emailPessoa = `${p.nome
      .toLowerCase()
      .normalize("NFD")
      // Remove os acentos separados pelo NFD; "Úrsula" -> "ursula".
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z]+/g, ".")}@exemplo.com.br`;

    pessoas.set(
      p.nome,
      await garantir(
        db.pessoa,
        // E-mail é a chave natural: garante idempotência sem depender de nome
        // repetido, que numa base real acontece com frequência.
        { email: emailPessoa },
        {
          nome: p.nome,
          telefone: telefoneFicticio(400 + i),
          genero: p.genero,
          estadoCivil: p.estadoCivil ?? "NAO_INFORMADO",
          status: p.status,
          origem: p.origem ?? "PAINEL",
          bairro: p.bairro,
          cidade: p.cidade,
          uf: "RS",
          celulaId: p.celula ? (celulas.get(p.celula) ?? null) : null,
          campusId: campi.get(p.campus) ?? null,
          batizado: p.batizado ?? false,
          igrejaAnterior: p.igrejaAnterior ?? null,
          observacoesPastorais: p.observacoesPastorais ?? null,
          consentimentoLgpd: true,
          consentimentoOrigem: "seed-demonstracao",
          excluidoEm: null,
        },
        {
          consentimentoEm: diasAtras(120 - i * 3),
          criadoEm: diasAtras(120 - i * 3),
        },
      ),
    );
  }

  // --- Caixa de entrada -------------------------------------------------------

  for (const s of SUBMISSOES) {
    await garantir(
      db.submissao,
      // Tipo + nome identificam a submissão de demonstração sem ambiguidade.
      { tipo: s.tipo, nome: s.nome },
      {
        status: s.status,
        email: s.email ?? null,
        telefone: s.telefone ?? null,
        dados: s.dados,
        origem: "SITE",
        paginaOrigem: s.paginaOrigem,
        scoreSpam: s.scoreSpam ?? 0,
        notaInterna: s.notaInterna ?? null,
        consentimentoLgpd: true,
        processadoEm: s.status === "CONCLUIDO" ? diasAtras(s.diasAtras - 1) : null,
      },
      { criadoEm: diasAtras(s.diasAtras) },
    );
  }

  // --- Pedidos de oração ------------------------------------------------------

  for (const o of PEDIDOS_ORACAO) {
    const pessoaId = o.pessoa ? (pessoas.get(o.pessoa) ?? null) : null;

    await garantir(
      db.pedidoOracao,
      { titulo: o.titulo },
      {
        // Pedido anônimo não guarda vínculo nem nome: o anonimato só vale se
        // for real no banco, e não apenas escondido na interface.
        pessoaId: o.anonimo ? null : pessoaId,
        nomeSolicitante: o.anonimo ? null : (o.pessoa ?? null),
        anonimo: o.anonimo ?? false,
        categoria: o.categoria,
        pedido: o.pedido,
        urgente: o.urgente ?? false,
        visibilidade: o.visibilidade,
        status: o.status,
        contadorOracoes: o.contadorOracoes ?? 0,
        respostaTestemunho: o.respostaTestemunho ?? null,
        respondidoEm: o.status === "RESPONDIDO" ? diasAtras(Math.max(0, o.diasAtras - 7)) : null,
        origem: "SITE",
      },
      { criadoEm: diasAtras(o.diasAtras) },
    );
  }

  // --- Solicitações de batismo ------------------------------------------------

  const batismos: {
    nome: string;
    status: StatusBatismo;
    pessoa?: string;
    campus: string;
    respostas: Record<string, unknown>;
    turmaPreparatoria?: string;
    dataBatismo?: Date;
    menorIdade?: boolean;
    responsavelNome?: string;
    diasAtras: number;
  }[] = [
    {
      nome: "Lucas Pfeiffer",
      status: "SOLICITADO",
      campus: SEDE,
      diasAtras: 3,
      respostas: {
        aceitouJesus: true,
        testemunho:
          "Conheci a igreja pela célula do Centro. Depois de meses acompanhando, decidi entregar minha vida a Jesus e quero ser batizado.",
        jaFoiBatizado: false,
        participaCelula: true,
      },
    },
    {
      nome: "Juliana Scherer",
      status: "EM_PREPARO",
      campus: SEDE,
      turmaPreparatoria: "Turma de Batismo — Março",
      diasAtras: 25,
      respostas: {
        aceitouJesus: true,
        testemunho:
          "Cresci indo à igreja, mas só entendi o evangelho de verdade no ano passado. Estou fazendo a Trilha e quero selar essa decisão.",
        jaFoiBatizado: false,
        participaCelula: true,
      },
    },
    {
      /**
       * Menor de idade com autorização registrada. Serve para exercitar a
       * regra que bloqueia a aprovação sem consentimento do responsável.
       */
      nome: "Vitor Hennemann",
      status: "AGENDADO",
      campus: VERA_CRUZ,
      menorIdade: true,
      responsavelNome: "Cláudia Hennemann",
      dataBatismo: diasAFrente(21),
      diasAtras: 40,
      respostas: {
        aceitouJesus: true,
        testemunho:
          "Participo do grupo de adolescentes há dois anos e decidi seguir Jesus no acampamento. Meus pais concordam e vão estar comigo.",
        jaFoiBatizado: false,
        participaCelula: true,
      },
    },
  ];

  for (let i = 0; i < batismos.length; i += 1) {
    const b = batismos[i]!;
    await garantir(
      db.solicitacaoBatismo,
      { nome: b.nome },
      {
        email: `${b.nome.toLowerCase().replace(/\s+/g, ".")}@exemplo.com.br`,
        telefone: telefoneFicticio(500 + i),
        status: b.status,
        respostas: b.respostas,
        menorIdade: b.menorIdade ?? false,
        responsavelNome: b.responsavelNome ?? null,
        responsavelTelefone: b.menorIdade ? telefoneFicticio(550 + i) : null,
        autorizacaoResponsavel: b.menorIdade ?? false,
        turmaPreparatoria: b.turmaPreparatoria ?? null,
        dataBatismo: b.dataBatismo ?? null,
        campusId: campi.get(b.campus) ?? null,
        pessoaId: b.pessoa ? (pessoas.get(b.pessoa) ?? null) : null,
      },
      { criadoEm: diasAtras(b.diasAtras) },
    );
  }

  // --- Mensagens --------------------------------------------------------------

  for (const m of MENSAGENS) {
    await garantir(
      db.mensagem,
      { slug: m.slug },
      {
        titulo: m.titulo,
        descricao: m.descricao,
        preletor: m.preletor,
        serie: m.serie,
        // Deliberadamente sem `youtubeVideoId`: qualquer sequência de 11
        // caracteres válidos tem grande chance de apontar para um vídeo real
        // de terceiro. Um seed não incorpora conteúdo de quem não autorizou.
        youtubeVideoId: null,
        duracaoSegundos: m.duracaoSegundos,
        data: diasAtras(m.diasAtras),
        publicado: true,
        destaque: m.destaque ?? false,
      },
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Segundo tenant — existe para TESTAR o isolamento multi-tenant
  // ---------------------------------------------------------------------------

  /**
   * POR QUE ESTE TENANT EXISTE
   *
   * Com um único tenant no banco, uma query que esqueceu o `tenantId` devolve
   * exatamente o mesmo resultado de uma query correta. O bug fica invisível em
   * desenvolvimento e só aparece no dia em que a segunda igreja entra — em
   * produção, com dado real.
   *
   * "Igreja Videira" é o controle do experimento. Os registros abaixo têm nomes
   * autoexplicativos: se qualquer um deles aparecer no painel de
   * discipular.localhost, o isolamento quebrou e o problema é grave.
   *
   * Roteiro de verificação:
   *   1. Entrar em videira.localhost:3000/painel com o admin da Videira.
   *   2. Confirmar que nenhuma pessoa, célula ou pedido da Discipular aparece.
   *   3. Estando logado na Videira, abrir discipular.localhost:3000/painel —
   *      `exigirAcessoTenant()` deve recusar (sessão de um tenant, host de outro).
   */
  const videira = await prisma.tenant.upsert({
    where: { slug: "videira" },
    update: { nome: "Igreja Videira", status: "ATIVO", plano: "ESSENCIAL", excluidoEm: null },
    create: {
      slug: "videira",
      nome: "Igreja Videira",
      status: "ATIVO",
      plano: "ESSENCIAL",
    },
    select: { id: true },
  });
  const tenantVideira = videira.id;
  const dbVideira = tenantDb(tenantVideira);

  if (!ehProducao) {
    await prisma.tenantDomain.upsert({
      where: { hostname: "videira.localhost" },
      update: { tenantId: tenantVideira, principal: true, status: "VERIFICADO" },
      create: {
        tenantId: tenantVideira,
        hostname: "videira.localhost",
        principal: true,
        status: "VERIFICADO",
        tokenVerificacao: randomBytes(24).toString("hex"),
        verificadoEm: new Date(),
      },
    });
  }

  await garantir(
    dbVideira.siteConfig,
    {},
    {
      nomeExibicao: "Igreja Videira",
      tagline: "Permanecei em mim",
      descricaoSeo: "Tenant de controle para verificação de isolamento multi-tenant.",
      // Paleta diferente de propósito: se o site da Videira aparecer com o
      // dourado da Discipular, o vazamento é visível a olho nu.
      corAcento: "#2F7D62",
      corAcentoClara: "#7FB79F",
      corTinta: "#101512",
      corPapel: "#F6F7F4",
      fonteTitulo: "Fraunces",
      fonteTexto: "Instrument Sans",
      heroTitulo: "Igreja Videira",
      heroSubtitulo: "Igreja fictícia usada apenas para testar o isolamento entre tenants.",
      modulos: { site: true, oracao: true },
    },
  );

  const campusVideira = await garantir(
    dbVideira.campus,
    { nome: "Sede Videira" },
    {
      descricao: "Endereço fictício de controle.",
      cidade: "Santa Cruz do Sul",
      uf: "RS",
      principal: true,
      ordem: 0,
      ativo: true,
    },
  );

  await garantir(
    dbVideira.pessoa,
    { email: "isolamento.videira@exemplo.com.br" },
    {
      nome: "ISOLAMENTO — Pessoa exclusiva da Igreja Videira",
      telefone: telefoneFicticio(900),
      status: "MEMBRO",
      origem: "PAINEL",
      cidade: "Santa Cruz do Sul",
      uf: "RS",
      campusId: campusVideira,
      consentimentoLgpd: true,
      consentimentoOrigem: "seed-demonstracao",
      excluidoEm: null,
    },
  );

  await garantir(
    dbVideira.pedidoOracao,
    { titulo: "ISOLAMENTO — Pedido exclusivo da Igreja Videira" },
    {
      anonimo: false,
      nomeSolicitante: "Controle de isolamento",
      categoria: "GERAL",
      pedido:
        "Este pedido pertence exclusivamente ao tenant 'videira'. Se ele aparecer no painel da Discipular, o isolamento multi-tenant está quebrado.",
      visibilidade: "PRIVADO",
      status: "RECEBIDO",
      origem: "PAINEL",
    },
  );

  const adminVideira = await garantirUsuario({
    email: "admin.videira@exemplo.com.br",
    nome: "Admin da Igreja Videira",
    telefone: telefoneFicticio(901),
    rotulo: "ADMIN · Videira (teste de isolamento)",
  });

  await prisma.membership.upsert({
    where: { tenantId_userId: { tenantId: tenantVideira, userId: adminVideira } },
    update: { papel: "ADMIN", ativo: true },
    create: { tenantId: tenantVideira, userId: adminVideira, papel: "ADMIN", ativo: true },
  });

  // ---------------------------------------------------------------------------
  // 4. Resumo
  // ---------------------------------------------------------------------------

  imprimirResumo();
}

function imprimirResumo(): void {
  const linha = (texto = ""): void => {
    console.log(texto);
  };

  linha();
  linha("=".repeat(78));
  linha("  SEED CONCLUÍDO — Discipular SaaS");
  linha("=".repeat(78));
  linha();
  linha(`  Registros criados: ${contagem.criados}   ·   atualizados: ${contagem.atualizados}`);
  linha();
  linha("  ENDEREÇOS LOCAIS");
  linha("  ------------------------------------------------------------------------");
  linha("  Plataforma (super admin)   http://localhost:3000/plataforma");
  linha("  Discipular Igreja — site   http://discipular.localhost:3000");
  linha("  Discipular Igreja — painel http://discipular.localhost:3000/painel");
  linha("  Igreja Videira  — site     http://videira.localhost:3000");
  linha("  Igreja Videira  — painel   http://videira.localhost:3000/painel");
  linha("  Login                      http://<subdominio>.localhost:3000/login");
  linha();
  linha("  Os subdomínios *.localhost resolvem sozinhos em navegadores modernos;");
  linha("  não é preciso mexer no /etc/hosts.");
  linha();
  linha("  CREDENCIAIS");
  linha("  ------------------------------------------------------------------------");

  for (const c of credenciais) {
    linha(`  ${c.rotulo}`);
    linha(`    e-mail: ${c.email}`);
    if (c.senha) {
      linha(`    senha:  ${c.senha}`);
    } else {
      linha(`    senha:  (não exibida) ${c.observacao ?? ""}`.trimEnd());
    }
    linha();
  }

  const geradas = credenciais.filter((c) => c.senha !== null).length;
  if (geradas > 0) {
    linha("  " + "!".repeat(74));
    linha(`  !  ${geradas} senha(s) aleatória(s) foram exibidas ACIMA e SÓ AGORA.`);
    linha("  !  Elas não ficam gravadas em lugar nenhum: o banco guarda apenas o");
    linha("  !  hash scrypt. Copie-as agora e TROQUE-AS no primeiro acesso.");
    linha("  !  Para fixar a senha do super admin, defina SEED_ADMIN_SENHA no .env");
    linha("  !  antes de rodar o seed (ela não será impressa).");
    linha("  " + "!".repeat(74));
    linha();
  }

  linha("  TESTE DE ISOLAMENTO MULTI-TENANT");
  linha("  ------------------------------------------------------------------------");
  linha("  A Igreja Videira contém dois registros com o prefixo 'ISOLAMENTO —'.");
  linha("  Nenhum deles pode aparecer no painel da Discipular. Se aparecer, há");
  linha("  vazamento entre tenants — trate como incidente, não como bug de tela.");
  linha();
  linha("=".repeat(78));
  linha();
}

main()
  .catch((erro: unknown) => {
    // Aqui o stack completo é desejável: o seed é ferramenta de desenvolvimento
    // e quem o roda precisa saber exatamente qual escrita falhou. É o oposto da
    // regra que vale nas rotas HTTP, onde o erro do Prisma nunca vaza.
    console.error("\nFalha no seed:", erro instanceof Error ? erro.message : erro);
    if (erro instanceof Error && erro.stack) console.error(erro.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (desconectarBanco) await desconectarBanco();
  });
