import { NextResponse } from "next/server";
import { z } from "zod";
import { concluirReset } from "@/lib/auth/recuperacao";
import { contextoDeRequest } from "@/lib/http/contexto";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { REGRAS, verificarLimite } from "@/lib/security/rate-limit";
import { exigirCsrf } from "@/lib/security/csrf";

/**
 * Conclusão da recuperação: o usuário chega com o token e escolhe a senha nova.
 *
 * O TOKEN VIAJA NO CORPO, NÃO NA QUERY STRING
 * A página `/redefinir-senha` recebe o token pela URL (não há alternativa: ele
 * vem de um link de e-mail), mas o ENVIO é um POST com o token no corpo. Query
 * string aparece em log de acesso do Nginx, em histórico de navegador e no
 * header `Referer`; corpo de POST não aparece em nenhum dos três.
 *
 * O rate limit usa a mesma regra da solicitação: sem ele, um token de 43
 * caracteres seria inadivinhável na teoria, mas nada impediria alguém de tentar
 * milhões de vezes e ainda de graça consumir CPU do servidor a cada tentativa.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z
  .object({
    // Formato conferido de novo em `concluirReset`; aqui o limite serve para
    // barrar payload gigante antes de qualquer trabalho.
    token: z.string().trim().min(20).max(200),
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

    const limite = await verificarLimite(REGRAS.recuperarSenha, `redefinir:${ctx.ipHash}`);
    if (!limite.permitido) {
      return respostaLimiteExcedido(limite.tentarEmSegundos);
    }

    const dados = schema.parse(await lerCorpo(request));

    const resultado = await concluirReset(dados.token, dados.novaSenha);

    if (!resultado.ok) {
      // 400 para os dois motivos. O texto já é redigido por `concluirReset` e
      // é o mesmo para token inexistente, expirado ou já usado.
      return NextResponse.json(
        {
          erro: resultado.mensagem,
          ...(resultado.motivo === "senha_fraca"
            ? { campos: { novaSenha: [resultado.mensagem] } }
            : {}),
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    /**
     * Sucesso NÃO cria sessão: o destino é o login. Ver o comentário em
     * `concluirReset` — autenticar direto a partir de um link de e-mail
     * transformaria o token num atalho para dentro da conta.
     */
    return NextResponse.json(
      {
        ok: true,
        destino: "/login",
        mensagem:
          "Senha alterada. Todas as sessões abertas foram encerradas — entre novamente com a nova senha.",
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "auth/redefinir" });
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
