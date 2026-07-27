import { NextResponse } from "next/server";
import { z } from "zod";
import { solicitarReset } from "@/lib/auth/recuperacao";
import { contextoDeRequest } from "@/lib/http/contexto";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { exigirCsrf } from "@/lib/security/csrf";
import { resolverTenantPorHost } from "@/lib/tenant/resolve";
import { email as emailSchema } from "@/lib/validation/comum";

/**
 * Solicitação de recuperação de senha.
 *
 * A ROTA INTEIRA É CONSTRUÍDA PARA NÃO RESPONDER "ESSE E-MAIL EXISTE?"
 *
 *  - Uma única resposta possível no caminho normal: 200 com a mesma mensagem.
 *    Não existe 404 aqui, nem status diferente para conta inativa.
 *  - Nem o Zod pode vazar a diferença: um e-mail malformado devolve 400, mas
 *    isso é uma afirmação sobre o TEXTO enviado, não sobre a existência da
 *    conta. Um endereço bem formado e inexistente devolve 200 igual.
 *  - `solicitarReset` retorna `void`, então não há valor para o handler
 *    ramificar por engano.
 *
 * DOIS RATE LIMITS, COMO NO LOGIN
 *  - por IP: impede varrer uma lista de e-mails a partir de uma máquina;
 *  - por conta: impede usar o sistema para bombardear a caixa de entrada de
 *    uma pessoa específica (o clássico "mail bombing" para enterrar um aviso
 *    de fraude no meio de centenas de mensagens).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  email: emailSchema,
});

/** Resposta única, seja qual for o desfecho. */
const MENSAGEM_NEUTRA =
  "Se houver uma conta com esse e-mail, enviamos um link para redefinir a senha. Confira também a caixa de spam.";

export async function POST(request: Request) {
  const ctx = contextoDeRequest(request);

  try {
    await exigirCsrf(request);

    const limiteIp = await verificarLimite(REGRAS.recuperarSenha, `ip:${ctx.ipHash}`);
    if (!limiteIp.permitido) {
      return respostaLimiteExcedido(limiteIp.tentarEmSegundos);
    }

    const dados = schema.parse(await lerCorpo(request));

    const limiteConta = await verificarLimite(REGRAS.recuperarSenha, `conta:${dados.email}`);
    if (!limiteConta.permitido) {
      return respostaLimiteExcedido(limiteConta.tentarEmSegundos);
    }

    // O tenant vem do HOSTNAME, como em todo o resto do sistema. Aqui ele serve
    // só para personalizar o e-mail e etiquetar a auditoria; o vínculo do
    // usuário com a igreja não é verificado, porque a recuperação é da CONTA
    // (global) e não do acesso a uma igreja específica.
    const tenant = await resolverTenantPorHost(ctx.host);

    await solicitarReset(dados.email, {
      host: ctx.host,
      nomeIgreja: tenant?.nome,
      tenantId: tenant?.id ?? null,
    });

    return NextResponse.json(
      { ok: true, mensagem: MENSAGEM_NEUTRA },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "auth/recuperar" });
  }
}

async function lerCorpo(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const texto = await request.text();
    // Teto de tamanho antes de qualquer parse: um corpo de megabytes não deve
    // nem chegar ao JSON.parse.
    if (texto.length > 4096) throw new Error("corpo grande demais");
    return JSON.parse(texto);
  }
  const form = await request.formData();
  return Object.fromEntries(
    [...form.entries()].filter(([k, v]) => typeof v === "string" && k !== "__proto__"),
  );
}
