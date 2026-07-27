import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Papel } from "@prisma/client";

import { NaoAutenticadoError, exigirSessao } from "@/lib/auth/rbac";
import { sessaoAtual, trocarTenantAtivo } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { tenantDb } from "@/lib/db/tenant-client";
import { env, isProd } from "@/lib/env";
import { hostAtual } from "@/lib/http/contexto";
import { logger } from "@/lib/logger";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { normalizarHost } from "@/lib/tenant/resolve";
import { id as idSchema } from "@/lib/validation/comum";
import {
  SeletorDeIgreja,
  type IgrejaDisponivel,
  type ResultadoEscolha,
} from "@/components/auth/SeletorDeIgreja";
import "../globals.css";

/**
 * =============================================================================
 * ESCOLHER IGREJA — para quem serve mais de uma
 * =============================================================================
 *
 * `User` é global de propósito (ver prisma/schema.prisma): o mesmo pastor pode
 * cuidar de duas igrejas, e obrigá-lo a ter duas contas faria com que ele
 * repetisse a senha nas duas. O vínculo com cada igreja mora em `Membership`.
 *
 * Esta tela aparece quando alguém entra pelo domínio da plataforma, onde não há
 * igreja no hostname para decidir sozinha qual painel abrir.
 *
 * POR QUE O DESTINO É OUTRO ENDEREÇO — E POR QUE ISSO PEDE UM NOVO LOGIN
 * O cookie de sessão é emitido SEM o atributo `Domain` (e, em produção, com o
 * prefixo `__Host-`, que proíbe esse atributo). Ele é, portanto, host-only:
 * vale exatamente para o endereço em que foi criado e não acompanha o usuário
 * para `igreja.discipular.app`.
 *
 * Isso é intencional. Um cookie emitido para `.discipular.app` seria enviado ao
 * subdomínio de TODAS as igrejas — inclusive uma cujo site tenha sido
 * comprometido —, e a sessão de quem administra várias igrejas é o pior
 * candidato possível para essa exposição. Preferimos o custo de um login a
 * mais.
 *
 * O que esta tela faz, então, é o que dá para fazer com segurança: revalida o
 * vínculo no servidor, aponta a sessão atual para a igreja escolhida (o
 * `trocarTenantAtivo`) e leva a pessoa ao endereço certo, onde o login já a
 * reconhece e a deposita direto no painel daquela igreja.
 */

export const metadata: Metadata = {
  title: "Escolher igreja",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ROTULO_PAPEL: Record<Papel, string> = {
  ADMIN: "Administração",
  PASTOR: "Pastor",
  SECRETARIA: "Secretaria",
  LIDER_CELULA: "Líder de célula",
  MEMBRO: "Membro",
};

// -----------------------------------------------------------------------------
// Ação
// -----------------------------------------------------------------------------

/**
 * Troca a igreja ativa e devolve o destino.
 *
 * O `tenantId` chega do cliente — e aqui isso é legítimo, pela mesma razão que
 * vale na área da plataforma: o alvo é necessariamente um argumento, e quem
 * protege não é a origem do identificador e sim a autorização. `trocarTenantAtivo`
 * consulta o `Membership` no servidor e recusa qualquer igreja em que o usuário
 * não tenha vínculo ativo. Um id adulterado no formulário não abre nada.
 */
async function entrarNaIgreja(tenantIdBruto: string): Promise<ResultadoEscolha> {
  "use server";

  try {
    const sessao = await exigirSessao();

    const limite = await verificarLimite(REGRAS.escritaPainel, `trocar-igreja:${sessao.userId}`);
    if (!limite.permitido) {
      return { ok: false, mensagem: "Muitas trocas seguidas. Aguarde um instante." };
    }

    const tenantId = idSchema.parse(tenantIdBruto);

    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, excluidoEm: null },
      select: {
        id: true,
        slug: true,
        nome: true,
        status: true,
        dominios: {
          where: { principal: true, status: "VERIFICADO" },
          select: { hostname: true },
          take: 1,
        },
      },
    });

    // Mesma mensagem para "não existe" e "existe, mas não é sua": diferenciar
    // transformaria esta ação num verificador de quais igrejas há na plataforma.
    if (!tenant) {
      return { ok: false, mensagem: "Não encontramos essa igreja no seu acesso." };
    }

    if (tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
      return {
        ok: false,
        mensagem: "O acesso a esta igreja está temporariamente suspenso.",
      };
    }

    const trocou = await trocarTenantAtivo(sessao.sessaoId, tenant.id, sessao.userId);
    if (!trocou) {
      return { ok: false, mensagem: "Não encontramos essa igreja no seu acesso." };
    }

    const destino = tenant.dominios[0]?.hostname ?? `${tenant.slug}.${env.ROOT_DOMAIN}`;
    const hostDaRequisicao = normalizarHost(await hostAtual());

    /**
     * Registro no log DA IGREJA: entrar no painel de uma igreja é um acesso a
     * dados dela, e ela é a controladora sob a LGPD. Vai por `tenantDb` mesmo
     * sabendo o id — é o cliente escopado que garante que a linha não caia no
     * log de outra igreja se algo der errado mais acima.
     */
    await tenantDb(tenant.id)
      .auditLog.create({
        data: {
          tenantId: tenant.id,
          atorUserId: sessao.userId,
          atorNome: sessao.nome,
          acao: "sessao.escolherIgreja",
          alvoTipo: "Tenant",
          alvoId: tenant.id,
        },
      })
      .catch((erro: unknown) => {
        logger.erro("Falha ao auditar a troca de igreja", erro, { tenantId: tenant.id });
      });

    return {
      ok: true,
      mensagem: "Abrindo…",
      // Se por acaso já estamos no endereço da igreja, a navegação é interna e
      // a sessão continua valendo — não há troca de host, logo não há cookie a
      // perder.
      url:
        hostDaRequisicao === destino
          ? "/painel"
          : `${isProd ? "https" : "http"}://${destino}/login`,
    };
  } catch (erro) {
    if (erro instanceof NaoAutenticadoError) {
      return { ok: false, mensagem: "Sua sessão expirou. Entre novamente." };
    }
    const ref = logger.erro("Falha ao escolher igreja", erro, { acao: "entrarNaIgreja" });
    return { ok: false, mensagem: `Não foi possível concluir. Referência: ${ref}` };
  }
}

// -----------------------------------------------------------------------------
// Página
// -----------------------------------------------------------------------------

export default async function PaginaEscolherIgreja() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  const vinculos = await prisma.membership.findMany({
    where: {
      userId: sessao.userId,
      ativo: true,
      tenant: { excluidoEm: null },
    },
    select: {
      papel: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          nome: true,
          status: true,
          dominios: {
            where: { principal: true, status: "VERIFICADO" },
            select: { hostname: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
    // Teto: alguém com centenas de vínculos é um caso a investigar, não uma
    // tela para renderizar por inteiro.
    take: 50,
  });

  const igrejas: IgrejaDisponivel[] = vinculos.map((v) => ({
    id: v.tenant.id,
    nome: v.tenant.nome,
    papel: ROTULO_PAPEL[v.papel],
    host: v.tenant.dominios[0]?.hostname ?? `${v.tenant.slug}.${env.ROOT_DOMAIN}`,
    disponivel: v.tenant.status !== "SUSPENSO" && v.tenant.status !== "CANCELADO",
  }));

  return (
    <main
      className="theme-dark"
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "2rem 1.25rem" }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div className="centro" style={{ marginBottom: "2.5rem" }}>
          <p className="eyebrow eyebrow--centered">Acesso</p>
          <h1 className="h3" style={{ marginTop: "1rem" }}>
            Escolha a igreja
          </h1>
          <p className="dim" style={{ marginTop: ".8rem", fontSize: ".9rem" }}>
            Olá, {sessao.nome}. Você tem acesso a mais de uma igreja.
          </p>
        </div>

        {igrejas.length === 0 ? (
          <div className="stack" style={{ "--flow": "1.2rem" } as React.CSSProperties}>
            <div className="alerta alerta--aviso" role="status">
              Sua conta ainda não está vinculada a nenhuma igreja. Fale com o
              responsável pela sua igreja para que ele libere o seu acesso.
            </div>
            <a href="/login" className="btn btn--ghost btn--block">
              Entrar com outra conta
            </a>
          </div>
        ) : (
          <>
            <SeletorDeIgreja igrejas={igrejas} acao={entrarNaIgreja} />

            <p className="dim centro" style={{ marginTop: "1.6rem", fontSize: ".8rem" }}>
              Cada igreja tem o próprio endereço, e o acesso é confirmado nele.
              Pode ser que você precise entrar de novo ao abrir a igreja
              escolhida — é assim que mantemos as sessões separadas entre elas.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
