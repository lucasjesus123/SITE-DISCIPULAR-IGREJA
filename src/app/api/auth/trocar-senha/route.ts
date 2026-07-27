import { NextResponse } from "next/server";
import { z } from "zod";
import { alterarSenhaPropria } from "@/lib/auth/recuperacao";
import { exigirSessao } from "@/lib/auth/rbac";
import { contextoDeRequest } from "@/lib/http/contexto";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { exigirCsrf } from "@/lib/security/csrf";

/**
 * Troca de senha pelo próprio usuário, já autenticado.
 *
 * `exigirSessao()` e não `exigirAcessoTenant()`: a senha pertence à CONTA, que
 * é global. O mesmo pastor troca a senha estando no painel da Igreja A, da
 * Igreja B ou na área da plataforma — e o super admin, que não tem membership
 * em igreja nenhuma, também precisa conseguir.
 *
 * O RATE LIMIT É O DE LOGIN, DE PROPÓSITO
 * Este endpoint verifica uma credencial (`senhaAtual`). Isso o torna um oráculo
 * de senha para quem se sentar numa máquina destravada: sem teto, dá para
 * testar milhares de palpites da senha atual sem nunca passar pela tela de
 * login, que é onde todo mundo põe a proteção. A chave é o userId, e não o IP,
 * porque aqui já sabemos exatamente de quem é a conta sob ataque.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    senhaAtual: z.string().min(1, "Informe a senha atual.").max(256),
    novaSenha: z.string().min(1).max(256),
    confirmacao: z.string().min(1).max(256),
  })
  .refine((d) => d.novaSenha === d.confirmacao, {
    message: "As senhas não coincidem.",
    path: ["confirmacao"],
  });

export async function POST(request: Request) {
  const ctx = contextoDeRequest(request);

  try {
    await exigirCsrf(request);

    const sessao = await exigirSessao();

    const limite = await verificarLimite(REGRAS.login, `trocar-senha:${sessao.userId}`);
    if (!limite.permitido) {
      return respostaLimiteExcedido(limite.tentarEmSegundos);
    }

    const dados = schema.parse(await lerCorpo(request));

    const resultado = await alterarSenhaPropria({
      userId: sessao.userId,
      // A igreja ativa vem da SESSÃO, nunca do corpo: a sessão nova precisa
      // nascer no mesmo contexto de igreja em que a antiga estava.
      tenantId: sessao.tenantId,
      senhaAtual: dados.senhaAtual,
      novaSenha: dados.novaSenha,
    });

    if (!resultado.ok) {
      const campo = resultado.motivo === "senha_atual_incorreta" ? "senhaAtual" : "novaSenha";
      return NextResponse.json(
        { erro: resultado.mensagem, campos: { [campo]: [resultado.mensagem] } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    /**
     * A resposta já carrega o `Set-Cookie` da sessão rotacionada (emitido por
     * `criarSessao` dentro de `alterarSenhaPropria`). Por isso o usuário
     * continua trabalhando: o cookie antigo foi revogado e o novo chegou na
     * mesma resposta.
     */
    return NextResponse.json(
      {
        ok: true,
        mensagem:
          "Senha alterada. As sessões dos outros dispositivos foram encerradas; esta continua ativa.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "auth/trocar-senha", ip: ctx.ipHash });
  }
}

async function lerCorpo(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const texto = await request.text();
    if (texto.length > 4096) throw new Error("corpo grande demais");
    return JSON.parse(texto);
  }
  const form = await request.formData();
  return Object.fromEntries(
    [...form.entries()].filter(([k, v]) => typeof v === "string" && k !== "__proto__"),
  );
}
