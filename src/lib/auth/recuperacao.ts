import { prisma } from "@/lib/db/prisma";
import { gerarToken, hashToken } from "@/lib/crypto";
import {
  SenhaFracaError,
  hashSenha,
  validarForca,
  verificacaoFalsa,
  verificarSenha,
} from "@/lib/auth/password";
import { criarSessao, revogarTodasSessoes } from "@/lib/auth/session";
import { auditarAutenticacao } from "@/lib/audit";
import {
  enviarEmail,
  modeloRecuperacaoSenha,
  modeloSenhaAlterada,
} from "@/lib/email/enviar";
import { env, isProd } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  ehHostDaPlataforma,
  normalizarHost,
  resolverTenantPorHost,
} from "@/lib/tenant/resolve";

/**
 * =============================================================================
 * RECUPERAÇÃO E TROCA DE SENHA
 * =============================================================================
 *
 * Três fluxos vivem aqui porque compartilham a mesma consequência: quando a
 * senha muda, TODAS as sessões daquele usuário morrem. Espalhar isso por três
 * arquivos é como se cria a versão em que um dos caminhos esquece de revogar.
 *
 * AS DUAS DECISÕES QUE DEFINEM ESTE MÓDULO
 *
 * 1. `solicitarReset` responde exatamente igual exista ou não a conta.
 *    Um formulário de "esqueci minha senha" que diz "e-mail não encontrado" é
 *    um oráculo de enumeração: com uma lista de e-mails, qualquer pessoa
 *    descobre quem tem conta na plataforma — e, num sistema de igrejas, saber
 *    QUEM frequenta QUAL igreja já é informação sensível (convicção religiosa é
 *    dado sensível na LGPD). Por isso o retorno é `void`: não existe caminho em
 *    que a diferença vaze para quem chama, nem por engano.
 *
 * 2. `concluirReset` revoga todas as sessões. Ver o comentário na função — é o
 *    ponto central do fluxo inteiro.
 */

/** Validade do link. Curta de propósito: ver `criarTokenDeReset`. */
export const VALIDADE_RESET_MINUTOS = 30;

/**
 * Formato de um token gerado por `gerarToken(32)`: 32 bytes em base64url = 43
 * caracteres. Validar o formato ANTES de calcular o HMAC e ir ao banco evita
 * que lixo de scanner vire trabalho de CPU e consulta.
 */
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{40,50}$/;

export function tokenTemFormatoValido(token: string): boolean {
  return FORMATO_TOKEN.test(token);
}

// -----------------------------------------------------------------------------
// 1. Solicitação
// -----------------------------------------------------------------------------

export interface ContextoSolicitacao {
  /**
   * Host de origem do pedido. Vem SEMPRE do header que o middleware reescreve
   * (`contextoDeRequest`), nunca do corpo — ver `montarLinkReset`.
   */
  host: string;
  /** Nome da igreja do host, para o texto do e-mail. */
  nomeIgreja?: string;
  /** Igreja do host, quando houver. Só para a auditoria. */
  tenantId?: string | null;
}

/**
 * Inicia a recuperação de senha.
 *
 * SEMPRE termina em silêncio e sem erro, exista o e-mail ou não. Quem chama
 * responde a mesma mensagem neutra nos dois casos.
 */
export async function solicitarReset(email: string, ctx: ContextoSolicitacao): Promise<void> {
  const usuario = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, nome: true, ativo: true },
  });

  /**
   * Conta inexistente ou desativada: gastamos um tempo de CPU comparável ao do
   * caminho feliz antes de sair.
   *
   * Sem isso, o caminho "existe" (gerar token + duas escritas no banco) levaria
   * dezenas de milissegundos a mais que o caminho "não existe" (uma leitura), e
   * a diferença de latência responderia exatamente a pergunta que a mensagem
   * neutra se recusa a responder.
   */
  if (!usuario || !usuario.ativo) {
    await verificacaoFalsa();
    await auditarAutenticacao({
      acao: "senha.reset.solicitado",
      email,
      tenantId: ctx.tenantId,
      motivo: usuario ? "conta_inativa" : "usuario_inexistente",
    });
    return;
  }

  const token = await criarTokenDeReset(usuario.id);
  const link = await montarLinkReset(ctx.host, token);

  const modelo = modeloRecuperacaoSenha({
    nomeIgreja: ctx.nomeIgreja ?? "Discipular",
    link,
    minutosValidade: VALIDADE_RESET_MINUTOS,
  });

  /**
   * Envio sem `await`, de propósito, por dois motivos:
   *
   *  - Tempo de resposta. Uma conexão SMTP leva de centenas de milissegundos a
   *    vários segundos. Esperá-la faria o caminho "conta existe" ser
   *    visivelmente mais lento que o caminho "conta não existe" — reintroduzindo
   *    a enumeração por outro lado, depois de tanto trabalho para eliminá-la.
   *  - Disponibilidade. Um servidor de e-mail fora do ar não pode transformar
   *    "esqueci minha senha" em erro 500.
   *
   * O resultado é tratado dentro de `enviarEmail`, que registra a pendência no
   * log da aplicação — sem o link, sem o token.
   */
  void enviarEmail({
    para: usuario.email,
    assunto: modelo.assunto,
    texto: modelo.texto,
    html: modelo.html,
  }).then((resultado) => {
    if (!resultado.enviado) {
      /**
       * O e-mail não saiu, mas o token EXISTE e é válido. Registramos o userId
       * para que o suporte consiga agir (o admin da igreja pode redefinir a
       * senha por outro caminho). O token em si jamais é impresso: quem lê o
       * log entraria na conta com ele.
       */
      logger.aviso("Link de recuperação gerado, mas o e-mail não pôde ser enviado.", {
        userId: usuario.id,
        motivo: resultado.motivo,
      });
    }
  }).catch(() => {
    /* `enviarEmail` não lança; o catch garante que uma promessa solta nunca
       vire "unhandled rejection" e derrube o processo. */
  });

  await auditarAutenticacao({
    acao: "senha.reset.solicitado",
    email: usuario.email,
    userId: usuario.id,
    tenantId: ctx.tenantId,
    motivo: "token_emitido",
  });
}

/**
 * Gera o token, guarda apenas o HMAC e invalida os anteriores.
 *
 * POR QUE SÓ O HMAC VAI PARA O BANCO
 * Mesma lógica das sessões: um dump do banco (backup vazado, SQL injection em
 * outro sistema da mesma máquina, notebook do administrador) não pode conter
 * credencial utilizável. Sem a SESSION_SECRET, o hash não volta a ser link.
 *
 * POR QUE APAGAR OS TOKENS ANTERIORES
 * Cada link válido é uma cópia independente da chave da conta, viva por 30
 * minutos, morando numa caixa de e-mail que pode ser a parte mais fraca da
 * corrente. Se a pessoa clicou cinco vezes em "esqueci minha senha", queremos
 * exatamente um link vivo — o último. Isso também dá um caminho de defesa a
 * quem recebe um pedido que não fez: solicitar um novo queima o anterior.
 *
 * POR QUE 30 MINUTOS
 * Tempo de sobra para abrir o e-mail no celular, e curto o bastante para que um
 * link esquecido numa caixa de entrada compartilhada (secretaria da igreja,
 * conta de família) não seja uma porta aberta no dia seguinte.
 */
async function criarTokenDeReset(userId: string): Promise<string> {
  const token = gerarToken(32);
  const expiraEm = new Date(Date.now() + VALIDADE_RESET_MINUTOS * 60 * 1000);

  await prisma.$transaction([
    prisma.tokenSenha.deleteMany({ where: { userId } }),
    prisma.tokenSenha.create({
      data: { tokenHash: hashToken(token), userId, expiraEm },
    }),
  ]);

  return token;
}

/**
 * Monta a URL do link de recuperação.
 *
 * ESTA FUNÇÃO EXISTE POR CAUSA DE UMA VULNERABILIDADE CLÁSSICA
 * Se o link for montado com o Host da requisição sem checagem, um atacante
 * dispara "esqueci minha senha" para a vítima com `Host: servidor-dele.com`. O
 * e-mail legítimo, vindo do nosso domínio, chega à vítima com um link que
 * aponta para o servidor do atacante — e quando ela clica, entrega o token.
 *
 * A defesa aqui tem duas camadas: o middleware já entrega um host reescrito
 * (que o cliente não forja) e, ainda assim, só aceitamos esse host se ele
 * RESOLVER para uma igreja conhecida ou for o domínio da plataforma. Qualquer
 * outra coisa cai para APP_URL, que é configuração nossa.
 */
async function montarLinkReset(host: string, token: string): Promise<string> {
  const hostNormalizado = normalizarHost(host);

  let base = env.APP_URL.replace(/\/+$/, "");

  if (hostNormalizado) {
    const conhecido =
      ehHostDaPlataforma(hostNormalizado) ||
      (await resolverTenantPorHost(hostNormalizado)) !== null;

    if (conhecido) {
      base = `${isProd ? "https" : "http"}://${hostNormalizado}`;
    }
  }

  return `${base}/redefinir-senha?token=${encodeURIComponent(token)}`;
}

// -----------------------------------------------------------------------------
// 2. Conclusão pelo link
// -----------------------------------------------------------------------------

export type FalhaReset = "token_invalido" | "senha_fraca";

export type ResultadoReset =
  | { ok: true }
  | { ok: false; motivo: FalhaReset; mensagem: string };

/** Mensagem única para todo problema com o token: expirado, já usado,
 *  inexistente ou de conta desativada. Diferenciá-los diria a um atacante que
 *  colhe tokens qual deles ainda vale a pena tentar. */
const TOKEN_INVALIDO =
  "Este link não é mais válido. Peça um novo e use o link mais recente que receber.";

/**
 * Conclui a redefinição.
 *
 * =============================================================================
 * A REVOGAÇÃO DE TODAS AS SESSÕES É O PONTO CENTRAL DESTE FLUXO
 * =============================================================================
 *
 * Quase todo mundo que redefine a senha está fazendo isso por um de dois
 * motivos: esqueceu, ou desconfia que alguém entrou. O segundo caso é o que
 * define o desenho.
 *
 * Se o invasor já está dentro, ele tem um cookie de sessão válido por até 8
 * horas. Trocar a senha sem derrubar sessões não o expulsa de nada: ele
 * continua lendo a caixa de entrada, os pedidos de oração e a ficha dos
 * membros, e ainda pode simplesmente trocar a senha de volta. A vítima teria
 * feito a coisa certa e não teria acontecido nada.
 *
 * Por isso `revogarTodasSessoes` é a razão de o fluxo existir, e não um passo
 * de limpeza no fim. Ele age em duas frentes:
 *
 *   - marca `revogadaEm` em toda sessão aberta (efeito imediato, inclusive nas
 *     abas que já estão renderizadas);
 *   - `senhaAtualizadaEm` avança, e `sessaoAtual()` recusa qualquer sessão
 *     criada antes desse instante. É a rede de segurança: mesmo que uma linha
 *     escape da revogação, ela não passa na validação.
 *
 * E por isso NÃO criamos sessão nova aqui: quem redefiniu volta ao login e
 * prova que sabe a senha nova. Autenticar automaticamente a partir de um link
 * recebido por e-mail transformaria o token num atalho permanente para dentro.
 */
export async function concluirReset(
  token: string,
  novaSenha: string,
): Promise<ResultadoReset> {
  if (!tokenTemFormatoValido(token)) {
    return { ok: false, motivo: "token_invalido", mensagem: TOKEN_INVALIDO };
  }

  const registro = await prisma.tokenSenha.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      expiraEm: true,
      usadoEm: true,
      user: { select: { id: true, email: true, nome: true, ativo: true } },
    },
  });

  const agora = new Date();

  if (!registro || registro.usadoEm || registro.expiraEm <= agora || !registro.user.ativo) {
    await auditarAutenticacao({
      acao: "senha.reset.concluido",
      email: registro?.user.email,
      userId: registro?.userId,
      motivo: "token_invalido",
    });
    return { ok: false, motivo: "token_invalido", mensagem: TOKEN_INVALIDO };
  }

  /**
   * Política de senha ANTES do scrypt. `hashSenha` também validaria, mas
   * derivar o hash custa ~100ms de CPU: recusar uma senha curta sem pagar esse
   * preço evita que o formulário de redefinição vire um jeito barato de
   * consumir CPU do servidor.
   */
  try {
    validarForca(novaSenha);
  } catch (erro) {
    if (erro instanceof SenhaFracaError) {
      return { ok: false, motivo: "senha_fraca", mensagem: erro.motivo };
    }
    throw erro;
  }

  const senhaHash = await hashSenha(novaSenha);

  /**
   * Uso único garantido pelo BANCO, não pela leitura acima.
   *
   * Entre o `findUnique` e este ponto cabem outras requisições. Se dois cliques
   * simultâneos passassem os dois pela checagem, os dois redefiniriam a senha —
   * e o segundo venceria, o que numa disputa entre a vítima e um atacante com o
   * mesmo link é exatamente o resultado errado. A condição `usadoEm: null`
   * dentro do UPDATE faz o Postgres decidir: exatamente uma das requisições vê
   * `count === 1`.
   */
  const consumo = await prisma.tokenSenha.updateMany({
    where: { id: registro.id, usadoEm: null },
    data: { usadoEm: agora },
  });

  if (consumo.count !== 1) {
    return { ok: false, motivo: "token_invalido", mensagem: TOKEN_INVALIDO };
  }

  await prisma.user.update({
    where: { id: registro.userId },
    data: {
      senhaHash,
      senhaAtualizadaEm: agora,
      // Quem provou o controle do e-mail e escolheu uma senha nova não deve
      // continuar preso ao bloqueio por tentativas falhas.
      tentativasFalhas: 0,
      bloqueadoAte: null,
    },
  });

  const sessoesRevogadas = await revogarTodasSessoes(registro.userId);

  await auditarAutenticacao({
    acao: "senha.reset.concluido",
    email: registro.user.email,
    userId: registro.userId,
    motivo: `sessoes_revogadas:${sessoesRevogadas}`,
  });

  void avisarSenhaAlterada(registro.user.email, "recuperacao", agora);

  return { ok: true };
}

// -----------------------------------------------------------------------------
// 3. Troca pelo próprio usuário, já autenticado
// -----------------------------------------------------------------------------

export type FalhaTroca = "senha_atual_incorreta" | "senha_fraca" | "senha_repetida";

export type ResultadoTroca =
  | { ok: true }
  | { ok: false; motivo: FalhaTroca; mensagem: string };

/**
 * Troca a senha de quem já está logado.
 *
 * EXIGIR A SENHA ATUAL NÃO É BUROCRACIA
 * Sem isso, bastaria um minuto com a máquina destravada — ou um XSS que
 * dispare a requisição — para trocar a senha e tomar a conta. A senha atual é
 * a prova de que quem está pedindo é o dono, e não alguém que apenas herdou
 * uma sessão aberta.
 *
 * A SESSÃO ATUAL É ROTACIONADA, NÃO PRESERVADA
 * As outras sessões caem (é o objetivo: "trocar a senha me expulsa dos outros
 * lugares"). A atual não pode simplesmente sobreviver: `sessaoAtual()` recusa
 * sessões criadas antes de `senhaAtualizadaEm`, então o cookie antigo morreria
 * no próximo clique. Emitimos um cookie novo — o usuário continua trabalhando
 * sem reentrar, e de quebra o token de sessão é rotacionado junto com a
 * credencial, que é a prática correta ao mudar qualquer dado de autenticação.
 */
export async function alterarSenhaPropria(params: {
  userId: string;
  /** Igreja ativa da sessão atual, para recriá-la no mesmo contexto. */
  tenantId: string | null;
  senhaAtual: string;
  novaSenha: string;
}): Promise<ResultadoTroca> {
  const usuario = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, email: true, senhaHash: true, ativo: true },
  });

  if (!usuario || !usuario.ativo) {
    return {
      ok: false,
      motivo: "senha_atual_incorreta",
      mensagem: "Não foi possível alterar a senha. Entre novamente e tente de novo.",
    };
  }

  const confere = await verificarSenha(params.senhaAtual, usuario.senhaHash);
  if (!confere) {
    await auditarAutenticacao({
      acao: "senha.alterada",
      email: usuario.email,
      userId: usuario.id,
      motivo: "senha_atual_incorreta",
    });
    return {
      ok: false,
      motivo: "senha_atual_incorreta",
      mensagem: "A senha atual não confere.",
    };
  }

  try {
    validarForca(params.novaSenha);
  } catch (erro) {
    if (erro instanceof SenhaFracaError) {
      return { ok: false, motivo: "senha_fraca", mensagem: erro.motivo };
    }
    throw erro;
  }

  // Repetir a senha atual esvazia o sentido da troca — sobretudo quando ela é
  // feita porque a senha pode ter vazado. Aqui a comparação é barata: já temos
  // as duas em mãos.
  if (params.senhaAtual === params.novaSenha) {
    return {
      ok: false,
      motivo: "senha_repetida",
      mensagem: "A nova senha precisa ser diferente da atual.",
    };
  }

  const agora = new Date();
  const senhaHash = await hashSenha(params.novaSenha);

  await prisma.user.update({
    where: { id: usuario.id },
    data: { senhaHash, senhaAtualizadaEm: agora, tentativasFalhas: 0, bloqueadoAte: null },
  });

  const sessoesRevogadas = await revogarTodasSessoes(usuario.id);

  // Cookie novo para o dispositivo atual. Feito DEPOIS da revogação para que a
  // sessão recém-criada não seja apanhada por ela.
  await criarSessao({ userId: usuario.id, tenantId: params.tenantId });

  await auditarAutenticacao({
    acao: "senha.alterada",
    email: usuario.email,
    userId: usuario.id,
    tenantId: params.tenantId,
    motivo: `sessoes_revogadas:${sessoesRevogadas}`,
  });

  void avisarSenhaAlterada(usuario.email, "painel", agora);

  return { ok: true };
}

// -----------------------------------------------------------------------------
// Auxiliar
// -----------------------------------------------------------------------------

/** Aviso pós-alteração. Sem `await` pelos mesmos motivos do envio do link:
 *  o e-mail é um alarme, não um passo do fluxo. */
async function avisarSenhaAlterada(
  email: string,
  origem: "recuperacao" | "painel",
  quando: Date,
): Promise<void> {
  const modelo = modeloSenhaAlterada({ nomeIgreja: "Discipular", quando, origem });
  await enviarEmail({
    para: email,
    assunto: modelo.assunto,
    texto: modelo.texto,
    html: modelo.html,
  }).catch(() => {
    /* `enviarEmail` já não lança; o catch é apenas a garantia de que uma
       promessa solta nunca derrube o processo. */
  });
}
