import "server-only";

import { prisma } from "@/lib/db/prisma";
import { tenantDb } from "@/lib/db/tenant-client";
import { elegiveisBoasVindas, elegiveisConviteRetorno, type PessoaAutomacao } from "./elegibilidade";
import { telefoneWhatsApp } from "@/lib/mensagens/aniversario-disparo";
import { renderizarTemplate, TEMPLATES_PADRAO } from "@/lib/mensagens/template";
import { enviarLote, tokenSeConectado, type AlvoDisparo } from "@/lib/whatsapp/disparo";

export type TipoAutomacao = "boas_vindas" | "convite_retorno";

const CHAVE_TEMPLATE: Record<TipoAutomacao, string> = {
  boas_vindas: "boas_vindas_visitante",
  convite_retorno: "convite_retorno",
};

export interface ResumoAutomacao {
  igrejas: number;
  enviados: number;
  erros: number;
  pulados: number;
}

/**
 * Roda uma automação de relacionamento (boas-vindas OU convite de retorno) para
 * todas as igrejas ativas. Multi-tenant, idempotente (marca cada envio na
 * Pessoa) e resiliente (igreja sem número é pulada; falha de envio não derruba).
 */
export async function rodarAutomacaoRelacionamento(tipo: TipoAutomacao, agoraMs: number): Promise<ResumoAutomacao> {
  const resumo: ResumoAutomacao = { igrejas: 0, enviados: 0, erros: 0, pulados: 0 };

  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["ATIVO", "TRIAL"] }, excluidoEm: null },
    select: { id: true, nome: true },
  });

  for (const t of tenants) {
    resumo.igrejas += 1;
    const token = await tokenSeConectado(t.id);
    if (!token) {
      resumo.pulados += 1;
      continue;
    }

    const db = tenantDb(t.id);
    const pessoas = await db.pessoa.findMany({
      where: { excluidoEm: null },
      select: { id: true, nome: true, telefone: true, status: true, criadoEm: true, boasVindasEm: true, conviteRetornoEm: true },
    });

    const mapped: PessoaAutomacao[] = pessoas.map((p) => ({
      id: p.id,
      nome: p.nome,
      telefone: p.telefone,
      status: p.status,
      criadoEmMs: p.criadoEm.getTime(),
      boasVindasEmMs: p.boasVindasEm?.getTime() ?? null,
      conviteRetornoEmMs: p.conviteRetornoEm?.getTime() ?? null,
    }));

    const elegiveis =
      tipo === "boas_vindas" ? elegiveisBoasVindas(mapped, agoraMs) : elegiveisConviteRetorno(mapped, agoraMs);
    if (elegiveis.length === 0) continue;

    const [config, tpl] = await Promise.all([
      db.siteConfig.findFirst({ select: { nomeExibicao: true } }),
      db.mensagemTemplate.findFirst({ where: { chave: CHAVE_TEMPLATE[tipo], ativo: true }, select: { corpo: true } }),
    ]);
    const corpo = tpl?.corpo ?? TEMPLATES_PADRAO.find((x) => x.chave === CHAVE_TEMPLATE[tipo])!.corpo;
    const igreja = config?.nomeExibicao ?? t.nome;

    const alvos: AlvoDisparo[] = [];
    for (const p of elegiveis) {
      const numero = telefoneWhatsApp(p.telefone);
      if (!numero) continue;
      alvos.push({
        telefoneWhatsApp: numero,
        texto: renderizarTemplate(corpo, { nome: p.nome.trim().split(/\s+/)[0] || p.nome, igreja }),
        ref: p.id,
      });
    }

    const r = await enviarLote(token, alvos, { tenantId: t.id });
    resumo.enviados += r.enviados;
    resumo.erros += r.erros;

    // Marca TODOS os elegíveis (mesmo os de número inválido) para nunca repetir.
    const agora = new Date(agoraMs);
    const ids = elegiveis.map((p) => p.id);
    if (tipo === "boas_vindas") {
      await db.pessoa.updateMany({ where: { id: { in: ids } }, data: { boasVindasEm: agora } });
    } else {
      await db.pessoa.updateMany({ where: { id: { in: ids } }, data: { conviteRetornoEm: agora } });
    }
  }

  return resumo;
}
