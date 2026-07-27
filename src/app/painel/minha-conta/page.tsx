import type { Papel } from "@prisma/client";

import { auditar } from "@/lib/audit";
import { exigirAcessoTenant } from "@/lib/auth/rbac";
import { encerrarSessao, revogarTodasSessoes } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { FormularioTrocarSenha } from "@/components/auth/FormularioTrocarSenha";
import {
  BotaoSairDeTudo,
  type ResultadoRevogacao,
} from "@/components/auth/BotaoSairDeTudo";

/**
 * Minha conta.
 *
 * Reúne o que é da PESSOA, e não da igreja: os dados da conta, a troca de senha
 * e a lista de sessões abertas.
 *
 * POR QUE A LISTA DE SESSÕES É UM CONTROLE DE SEGURANÇA, E NÃO UMA CURIOSIDADE
 * É o único lugar em que alguém consegue perceber, sozinho, que a conta foi
 * invadida. Um acesso indevido não deixa rastro visível em lugar nenhum da
 * interface — mas aparece aqui como "Chrome · Windows, ativo há 3 minutos"
 * numa conta que só é usada no celular. Sem esta tela, a descoberta só
 * aconteceria quando o estrago já estivesse feito.
 *
 * O QUE A LISTA NÃO MOSTRA
 * O IP (guardamos apenas o HMAC dele, por LGPD — e um hash na tela não ajudaria
 * ninguém) e, obviamente, o token. O que aparece é o suficiente para reconhecer
 * o que é seu: dispositivo, quando começou e quando foi usado pela última vez.
 *
 * Modelos globais (`User`, `Sessao`) são lidos por `prisma` direto, como manda
 * a regra de escopo: eles não têm tenantId e não pertencem a uma igreja. Os
 * dados de igreja desta tela — a auditoria — vão por `ctx.db`.
 */

export const dynamic = "force-dynamic";
export const metadata = { title: "Minha conta" };

const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administração",
  PASTOR: "Pastor",
  SECRETARIA: "Secretaria",
  LIDER_CELULA: "Líder de célula",
  MEMBRO: "Membro",
};

/** Teto de sessões exibidas. Uma conta com mais que isto tem outro problema. */
const MAX_SESSOES = 20;

// -----------------------------------------------------------------------------
// Ação
// -----------------------------------------------------------------------------

/**
 * Encerra TODAS as sessões, inclusive a atual.
 *
 * A sessão de quem clicou cai junto de propósito: quem usa este botão está
 * reagindo a uma suspeita, e no cenário de suspeita não existe "dispositivo
 * confiável" — o que está na frente da pessoa pode ser justamente o que ela
 * quer preservar por engano.
 */
async function sairDeTodosOsDispositivos(): Promise<ResultadoRevogacao> {
  "use server";

  try {
    // Autorização refeita do zero: a ação é um endpoint HTTP, e o que foi
    // verificado na renderização não vale como permissão para esta chamada.
    const ctx = await exigirAcessoTenant();

    const limite = await verificarLimite(
      REGRAS.escritaPainel,
      ctx.sessao.userId,
      ctx.tenant.id,
    );
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas operações seguidas. Aguarde um instante." };
    }

    const revogadas = await revogarTodasSessoes(ctx.sessao.userId);

    // Auditar ANTES de limpar o cookie: depois de `encerrarSessao` o contexto
    // ainda existe em memória, mas registrar primeiro evita depender disso.
    await auditar(ctx, {
      acao: "sessoes.revogarTodas",
      alvoTipo: "User",
      alvoId: ctx.sessao.userId,
      detalhes: { quantidade: revogadas, origem: "minha-conta" },
    });

    // Revogar no banco resolve o acesso; limpar o cookie evita que o navegador
    // continue mandando um token morto a cada requisição.
    await encerrarSessao();

    return { ok: true, mensagem: `${revogadas} sessão(ões) encerrada(s).` };
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : "";
    if (nome === "NaoAutenticadoError" || nome === "NaoAutorizadoError") {
      return { ok: false, mensagem: "Sessão expirada. Entre novamente." };
    }
    const ref = logger.erro("Falha ao revogar sessões", erro, { acao: "sairDeTodosOsDispositivos" });
    return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
  }
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default async function PaginaMinhaConta() {
  const ctx = await exigirAcessoTenant();

  const [usuario, sessoes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: ctx.sessao.userId },
      // `select` explícito: `senhaHash` jamais deve sair do banco para uma tela.
      select: {
        nome: true,
        email: true,
        telefone: true,
        emailVerificadoEm: true,
        senhaAtualizadaEm: true,
        ultimoLoginEm: true,
        criadoEm: true,
      },
    }),
    prisma.sessao.findMany({
      where: {
        userId: ctx.sessao.userId,
        revogadaEm: null,
        expiraEm: { gt: new Date() },
      },
      select: {
        id: true,
        userAgent: true,
        criadaEm: true,
        ultimoUsoEm: true,
        expiraEm: true,
        impersonadoPor: true,
      },
      orderBy: { ultimoUsoEm: "desc" },
      take: MAX_SESSOES,
    }),
  ]);

  return (
    <>
      <div className="painel__topo">
        <div>
          <h1 className="painel__titulo">Minha conta</h1>
          <p className="painel__sub">
            Seus dados de acesso e os dispositivos conectados a esta conta.
          </p>
        </div>
      </div>

      {/* ---- Dados da conta ---- */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Dados da conta</h2>
        <p className="secao-painel__desc">
          Nome e e-mail são alterados pelo responsável da igreja, em Usuários.
        </p>

        <dl style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Dado rotulo="Nome" valor={usuario?.nome ?? ctx.sessao.nome} />
          <Dado rotulo="E-mail" valor={usuario?.email ?? ctx.sessao.email} />
          <Dado rotulo="Telefone" valor={usuario?.telefone ?? "—"} />
          <Dado rotulo="Papel nesta igreja" valor={ROTULO_PAPEL[ctx.papel]} />
          <Dado rotulo="Igreja ativa" valor={ctx.tenant.nome} />
          <Dado
            rotulo="Senha atualizada em"
            valor={usuario ? formatarDataHora(usuario.senhaAtualizadaEm) : "—"}
          />
          <Dado
            rotulo="Último login"
            valor={usuario?.ultimoLoginEm ? formatarDataHora(usuario.ultimoLoginEm) : "—"}
          />
          <Dado
            rotulo="Conta criada em"
            valor={usuario ? formatarDataHora(usuario.criadoEm) : "—"}
          />
        </dl>
      </section>

      {/* ---- Troca de senha ---- */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Trocar senha</h2>
        <p className="secao-painel__desc">
          Use uma senha que você não use em nenhum outro lugar. Se você guarda
          senhas no navegador, deixe que ele gere e salve esta.
        </p>

        <div style={{ maxWidth: 460 }}>
          <FormularioTrocarSenha />
        </div>
      </section>

      {/* ---- Sessões ---- */}
      <section className="secao-painel">
        <h2 className="secao-painel__titulo">Dispositivos conectados</h2>
        <p className="secao-painel__desc">
          Se você não reconhece algum destes acessos, troque a senha e encerre
          todas as sessões agora.
        </p>

        {sessoes.length === 0 ? (
          <div className="vazio">Nenhuma outra sessão ativa.</div>
        ) : (
          <div className="tabela-wrap">
            <table className="tabela">
              <thead>
                <tr>
                  <th scope="col">Dispositivo</th>
                  <th scope="col">Último uso</th>
                  <th scope="col">Início</th>
                  <th scope="col">Expira</th>
                </tr>
              </thead>
              <tbody>
                {sessoes.map((s) => {
                  const atual = s.id === ctx.sessao.sessaoId;
                  return (
                    <tr key={s.id}>
                      <td>
                        {/*
                          O user agent nunca é renderizado cru: exibimos um
                          rótulo derivado dele. O React já escaparia o texto,
                          mas um UA de 250 caracteres forjado por um cliente
                          automatizado só serviria para poluir a tabela.
                        */}
                        {descreverDispositivo(s.userAgent)}
                        {atual && (
                          <span className="etiqueta etiqueta--novo" style={{ marginLeft: ".5rem" }}>
                            Este dispositivo
                          </span>
                        )}
                        {s.impersonadoPor && (
                          <span className="etiqueta etiqueta--urgente" style={{ marginLeft: ".5rem" }}>
                            Sessão de suporte
                          </span>
                        )}
                      </td>
                      <td>{formatarDataHora(s.ultimoUsoEm)}</td>
                      <td>{formatarDataHora(s.criadaEm)}</td>
                      <td>{formatarDataHora(s.expiraEm)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "1.4rem" }}>
          <BotaoSairDeTudo acao={sairDeTodosOsDispositivos} sessoesAtivas={sessoes.length} />
        </div>
      </section>
    </>
  );
}

// -----------------------------------------------------------------------------
// Apresentação
// -----------------------------------------------------------------------------

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="cartao__rotulo">{rotulo}</dt>
      <dd style={{ marginTop: ".3rem", fontSize: ".95rem" }}>{valor}</dd>
    </div>
  );
}

const FORMATO_DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function formatarDataHora(data: Date): string {
  return FORMATO_DATA.format(data);
}

/**
 * Traduz o user agent para algo que a pessoa reconheça.
 *
 * A detecção é grosseira de propósito — não precisa ser precisa, precisa ser
 * suficiente para alguém dizer "este é o meu celular" ou "este não é meu". A
 * ordem dos testes importa: o Edge se anuncia como Chrome, e o Chrome se
 * anuncia como Safari.
 */
function descreverDispositivo(userAgent: string | null): string {
  if (!userAgent) return "Dispositivo não identificado";

  const ua = userAgent.toLowerCase();

  const sistema = ua.includes("android")
    ? "Android"
    : /iphone|ipad|ipod/.test(ua)
      ? "iPhone/iPad"
      : ua.includes("windows")
        ? "Windows"
        : ua.includes("mac os")
          ? "macOS"
          : ua.includes("linux")
            ? "Linux"
            : "sistema desconhecido";

  const navegador = ua.includes("edg/")
    ? "Edge"
    : /opr\/|opera/.test(ua)
      ? "Opera"
      : ua.includes("firefox")
        ? "Firefox"
        : ua.includes("chrome")
          ? "Chrome"
          : ua.includes("safari")
            ? "Safari"
            : "Navegador desconhecido";

  return `${navegador} · ${sistema}`;
}
