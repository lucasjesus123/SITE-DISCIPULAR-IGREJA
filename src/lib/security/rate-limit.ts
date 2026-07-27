import { prisma } from "@/lib/db/prisma";
import { hashIp } from "@/lib/crypto";

/**
 * Rate limiting persistido em Postgres.
 *
 * POR QUE NO BANCO E NÃO EM MEMÓRIA
 * Em produção o app roda com vários processos Node atrás do Nginx. Um contador
 * em memória seria por processo: com 4 processos, um limite de "5 tentativas"
 * viraria 20 na prática. Pior, um restart zeraria o bloqueio, e reiniciar o
 * app é justamente o que um atacante consegue provocar.
 *
 * O custo é uma escrita por requisição limitada. Para o alvo deste sistema
 * (90 usuários simultâneos), é irrelevante — e só rotas sensíveis passam por
 * aqui, não o site inteiro.
 *
 * Se o volume crescer muito, o ponto de troca é este módulo: a interface
 * `verificarLimite` continua igual com Redis por trás.
 */

export interface RegraLimite {
  /** Nome do escopo, ex. "login", "oracao", "submissao". */
  escopo: string;
  /** Quantas requisições são permitidas dentro da janela. */
  maximo: number;
  /** Duração da janela, em segundos. */
  janelaSegundos: number;
  /**
   * Quanto tempo bloquear depois de estourar o limite, em segundos.
   * Sem isto, o atacante simplesmente esperaria a janela virar e continuaria
   * no mesmo ritmo. O bloqueio torna o ataque lento o bastante para não valer.
   */
  bloqueioSegundos: number;
}

/**
 * Regras por rota. Números escolhidos para não atrapalhar uso legítimo:
 * ninguém preenche 5 pedidos de oração por minuto de boa-fé.
 */
export const REGRAS = {
  /** Login: o alvo mais valioso. Agressivo de propósito. */
  login: { escopo: "login", maximo: 5, janelaSegundos: 300, bloqueioSegundos: 900 },

  /** Recuperação de senha: evita usar o sistema como cadeia de spam. */
  recuperarSenha: { escopo: "recuperar", maximo: 3, janelaSegundos: 900, bloqueioSegundos: 1800 },

  /** Formulários públicos do site e do app. */
  submissaoPublica: { escopo: "submissao", maximo: 5, janelaSegundos: 600, bloqueioSegundos: 1800 },

  /** Pedido de oração: um pouco mais folgado, é o formulário mais usado. */
  pedidoOracao: { escopo: "oracao", maximo: 8, janelaSegundos: 600, bloqueioSegundos: 1200 },

  /** Upload: caro em I/O e disco. */
  upload: { escopo: "upload", maximo: 20, janelaSegundos: 300, bloqueioSegundos: 600 },

  /** Escritas autenticadas no painel: teto anti-abuso, não anti-uso. */
  escritaPainel: { escopo: "painel", maximo: 120, janelaSegundos: 60, bloqueioSegundos: 120 },

  /** Verificação de domínio: consulta DNS externa, cara. */
  verificarDominio: { escopo: "dns", maximo: 10, janelaSegundos: 600, bloqueioSegundos: 900 },
} as const satisfies Record<string, RegraLimite>;

export interface ResultadoLimite {
  permitido: boolean;
  restantes: number;
  /** Segundos até poder tentar de novo. Só preenchido quando bloqueado. */
  tentarEmSegundos: number;
}

/**
 * Consome uma unidade do balde e diz se a requisição pode seguir.
 *
 * @param regra          Uma das entradas de REGRAS.
 * @param identificador  O que está sendo limitado. Para rota pública, o IP
 *                       hasheado. Para rota autenticada, o userId — assim uma
 *                       conta comprometida não é mascarada por troca de IP.
 * @param tenantId       Opcional. Isola o balde por igreja, para que o abuso
 *                       em uma igreja não bloqueie usuários de outra.
 */
export async function verificarLimite(
  regra: RegraLimite,
  identificador: string,
  tenantId?: string,
): Promise<ResultadoLimite> {
  const chave = montarChave(regra.escopo, identificador, tenantId);
  const agora = new Date();

  try {
    // Transação para que duas requisições simultâneas não leiam o mesmo
    // contador e ambas concluam que ainda há espaço.
    return await prisma.$transaction(
      async (tx) => {
        const balde = await tx.rateLimitBucket.findUnique({ where: { chave } });

        // Já bloqueado: nem incrementa. Isso impede que o atacante mantenha o
        // bloqueio vivo indefinidamente batendo na porta.
        if (balde?.bloqueadoAte && balde.bloqueadoAte > agora) {
          return {
            permitido: false,
            restantes: 0,
            tentarEmSegundos: Math.ceil((balde.bloqueadoAte.getTime() - agora.getTime()) / 1000),
          };
        }

        // Sem balde, ou janela expirada: começa uma nova.
        if (!balde || balde.janelaFim <= agora) {
          const janelaFim = new Date(agora.getTime() + regra.janelaSegundos * 1000);
          await tx.rateLimitBucket.upsert({
            where: { chave },
            create: { chave, contador: 1, janelaFim, bloqueadoAte: null },
            update: { contador: 1, janelaFim, bloqueadoAte: null },
          });
          return { permitido: true, restantes: regra.maximo - 1, tentarEmSegundos: 0 };
        }

        const novoContador = balde.contador + 1;

        if (novoContador > regra.maximo) {
          const bloqueadoAte = new Date(agora.getTime() + regra.bloqueioSegundos * 1000);
          await tx.rateLimitBucket.update({
            where: { chave },
            data: { contador: novoContador, bloqueadoAte },
          });
          return {
            permitido: false,
            restantes: 0,
            tentarEmSegundos: regra.bloqueioSegundos,
          };
        }

        await tx.rateLimitBucket.update({
          where: { chave },
          data: { contador: novoContador },
        });
        return {
          permitido: true,
          restantes: regra.maximo - novoContador,
          tentarEmSegundos: 0,
        };
      },
      { timeout: 5_000 },
    );
  } catch {
    // FALHA FECHADA em rotas sensíveis.
    //
    // Se o banco estiver indisponível, não sabemos se o limite foi estourado.
    // Deixar passar transformaria uma queda de banco em janela aberta para
    // força bruta. Recusar degrada a experiência por alguns segundos; deixar
    // passar pode custar uma conta de administrador.
    return { permitido: false, restantes: 0, tentarEmSegundos: 30 };
  }
}

/**
 * Zera o balde. Chamado após um login BEM-SUCEDIDO, para que o usuário que
 * errou a senha duas vezes e acertou na terceira não continue perto do limite.
 */
export async function limparLimite(
  regra: RegraLimite,
  identificador: string,
  tenantId?: string,
): Promise<void> {
  const chave = montarChave(regra.escopo, identificador, tenantId);
  await prisma.rateLimitBucket.deleteMany({ where: { chave } });
}

function montarChave(escopo: string, identificador: string, tenantId?: string): string {
  // O identificador já vem hasheado quando é IP; ainda assim truncamos para
  // caber na coluna e evitar que um valor gigante infle a tabela.
  const id = identificador.slice(0, 64);
  return tenantId ? `${escopo}:${tenantId}:${id}` : `${escopo}:${id}`;
}

/** Atalho para limitar por IP em rota pública. */
export async function limitarPorIp(
  regra: RegraLimite,
  ip: string,
  tenantId?: string,
): Promise<ResultadoLimite> {
  return verificarLimite(regra, hashIp(ip), tenantId);
}

/**
 * Remove baldes vencidos. Chamado pela rotina de manutenção
 * (src/app/api/manutencao/route.ts), não a cada requisição — varrer a tabela
 * no caminho quente seria pior que o problema.
 */
export async function limparBaldesVencidos(): Promise<number> {
  const agora = new Date();
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: {
      janelaFim: { lt: agora },
      OR: [{ bloqueadoAte: null }, { bloqueadoAte: { lt: agora } }],
    },
  });
  return count;
}
