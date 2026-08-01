import "server-only";

import { comTransacaoTenant } from "@/lib/db/tenant-client";
import { env } from "@/lib/env";
import { podeRetirar } from "./acesso";
import { assinarTokenQr, gerarCodigoSeguranca, hashCodigo, verificarCodigo } from "./seguranca";

/**
 * Check-in / check-out do KIDS. Toda a segurança de entrega mora aqui, apoiada
 * no núcleo testado (seguranca.ts, acesso.ts):
 *  - check-in gera o CÓDIGO (só o hash é guardado) e um QR assinado/efêmero;
 *  - check-out EXIGE o código certo E um responsável AUTORIZADO a retirar;
 *  - tudo atômico e auditável (o chamador registra a auditoria).
 */

export class ErroKids extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroKids";
  }
}

const SEGREDO = env.SESSION_SECRET;
const VALIDADE_QR_MS = 20 * 60 * 1000; // 20 min

export async function fazerCheckin(
  tenantId: string,
  dados: { criancaId: string; salaId: string; cultoData: Date; checkinPorUserId: string },
) {
  const codigo = gerarCodigoSeguranca(6);

  return comTransacaoTenant(tenantId, async (tx) => {
    const sessao = await tx.sessaoSalaKids.create({
      data: {
        tenantId,
        criancaId: dados.criancaId,
        salaId: dados.salaId,
        cultoData: dados.cultoData,
        status: "EM_SALA",
        codigoSegurancaHash: hashCodigo(codigo, SEGREDO),
        checkinPor: dados.checkinPorUserId,
      },
      select: { id: true },
    });

    const expiraEm = new Date(Date.now() + VALIDADE_QR_MS);
    await tx.qrTokenKids.create({
      data: { tenantId, sessaoId: sessao.id, expiraEm },
    });

    const tokenQr = assinarTokenQr({ sid: sessao.id, exp: expiraEm.getTime() }, SEGREDO);
    // O código é devolvido UMA vez (para a etiqueta/tela). Depois só existe o hash.
    return { sessaoId: sessao.id, codigo, tokenQr, expiraEm };
  });
}

export async function fazerCheckout(
  tenantId: string,
  dados: { sessaoId: string; codigo: string; retiradoPorUserId: string; checkoutPorUserId: string },
) {
  return comTransacaoTenant(tenantId, async (tx) => {
    const sessao = await tx.sessaoSalaKids.findFirst({
      where: { id: dados.sessaoId },
      select: {
        id: true,
        status: true,
        codigoSegurancaHash: true,
        crianca: { select: { responsaveis: { select: { responsavelUserId: true, autorizadoRetirar: true } } } },
      },
    });
    if (!sessao) throw new ErroKids("Sessão não encontrada.");
    if (sessao.status !== "EM_SALA") throw new ErroKids("Esta criança já foi retirada.");

    // 1) o código de segurança precisa bater
    if (!verificarCodigo(dados.codigo, sessao.codigoSegurancaHash, SEGREDO)) {
      throw new ErroKids("Código de segurança incorreto.");
    }
    // 2) quem retira precisa ser um responsável AUTORIZADO
    if (!podeRetirar(sessao.crianca.responsaveis, dados.retiradoPorUserId)) {
      throw new ErroKids("Esta pessoa não está autorizada a retirar a criança.");
    }

    await tx.sessaoSalaKids.update({
      where: { id: sessao.id },
      data: {
        status: "RETIRADA",
        checkoutEm: new Date(),
        checkoutPor: dados.checkoutPorUserId,
        retiradoPorUserId: dados.retiradoPorUserId,
      },
    });

    return { ok: true };
  });
}
