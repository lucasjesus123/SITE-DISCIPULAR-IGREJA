import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { verificarSenha, verificacaoFalsa, hashSenha, precisaRehash } from "@/lib/auth/password";
import { criarSessao } from "@/lib/auth/session";
import { contextoDeRequest } from "@/lib/http/contexto";
import { respostaLimiteExcedido, tratarErro } from "@/lib/http/erros";
import { REGRAS, limparLimite, verificarLimite } from "@/lib/security/rate-limit";
import { exigirCsrf } from "@/lib/security/csrf";
import { resolverTenantPorHost, ehHostDaPlataforma } from "@/lib/tenant/resolve";
import { auditarAutenticacao } from "@/lib/audit";
import { email as emailSchema } from "@/lib/validation/comum";

/**
 * Login.
 *
 * O endpoint mais atacado de qualquer sistema. As defesas, e o porquê de cada
 * uma:
 *
 *  - Rate limit DUPLO (por IP e por conta). Só por IP, um atacante com botnet
 *    testa uma senha por IP contra a mesma conta. Só por conta, ele enumera
 *    milhares de contas com uma senha comum ("password spraying") a partir de
 *    um IP. Precisa dos dois.
 *
 *  - Bloqueio progressivo da conta, persistido no banco.
 *
 *  - Resposta IDÊNTICA para "e-mail não existe" e "senha errada", tanto no
 *    texto quanto no TEMPO de resposta. Diferenciar qualquer um dos dois
 *    entrega a lista de quem tem conta.
 *
 *  - Tenant vem do HOSTNAME. Não existe campo "igreja" neste formulário.
 *
 *  - Rehash transparente quando o custo do scrypt aumentar.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schemaLogin = z.object({
  email: emailSchema,
  // Aqui NÃO aplicamos política de força: a senha já existe. Validar força no
  // login só revelaria a política para quem está sondando.
  senha: z.string().min(1).max(256),
  lembrar: z.coerce.boolean().optional().default(false),
});

/** Mensagem única para toda falha de credencial. */
const FALHA = "E-mail ou senha incorretos.";

export async function POST(request: Request) {
  const ctx = contextoDeRequest(request);

  try {
    await exigirCsrf(request);

    // ---- Rate limit por IP, antes de qualquer trabalho.
    const limiteIp = await verificarLimite(REGRAS.login, `ip:${ctx.ipHash}`);
    if (!limiteIp.permitido) {
      return respostaLimiteExcedido(limiteIp.tentarEmSegundos);
    }

    const corpo = await lerCorpo(request);
    const dados = schemaLogin.parse(corpo);

    // ---- Rate limit por conta.
    const limiteConta = await verificarLimite(REGRAS.login, `conta:${dados.email}`);
    if (!limiteConta.permitido) {
      return respostaLimiteExcedido(limiteConta.tentarEmSegundos);
    }

    const usuario = await prisma.user.findUnique({
      where: { email: dados.email },
      select: {
        id: true,
        email: true,
        nome: true,
        senhaHash: true,
        ativo: true,
        plataformaAdmin: true,
        tentativasFalhas: true,
        bloqueadoAte: true,
      },
    });

    // ---- Usuário inexistente.
    // Gastamos o MESMO tempo de CPU de uma verificação real antes de
    // responder. Sem isso, a diferença de latência (2ms x 100ms) entrega
    // quais e-mails existem na plataforma.
    if (!usuario) {
      await verificacaoFalsa();
      await auditarAutenticacao({
        acao: "login.falha",
        email: dados.email,
        motivo: "usuario_inexistente",
      });
      return NextResponse.json({ erro: FALHA }, { status: 401 });
    }

    // ---- Conta bloqueada por tentativas.
    if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
      await verificacaoFalsa();
      const segundos = Math.ceil((usuario.bloqueadoAte.getTime() - Date.now()) / 1000);
      await auditarAutenticacao({
        acao: "login.falha",
        email: dados.email,
        userId: usuario.id,
        motivo: "conta_bloqueada",
      });
      return respostaLimiteExcedido(segundos);
    }

    // ---- Conta desativada.
    // Resposta idêntica à de credencial errada: dizer "sua conta foi
    // desativada" confirma que a conta existe.
    if (!usuario.ativo) {
      await verificacaoFalsa();
      await auditarAutenticacao({
        acao: "login.falha",
        email: dados.email,
        userId: usuario.id,
        motivo: "conta_inativa",
      });
      return NextResponse.json({ erro: FALHA }, { status: 401 });
    }

    // ---- Verificação da senha.
    const senhaCorreta = await verificarSenha(dados.senha, usuario.senhaHash);

    if (!senhaCorreta) {
      const tentativas = usuario.tentativasFalhas + 1;
      // Bloqueio a partir da 5ª falha, crescendo: 1min, 2, 4, 8... até 1h.
      const bloqueadoAte =
        tentativas >= 5
          ? new Date(Date.now() + Math.min(2 ** (tentativas - 5) * 60_000, 3_600_000))
          : null;

      await prisma.user.update({
        where: { id: usuario.id },
        data: { tentativasFalhas: tentativas, bloqueadoAte },
      });

      await auditarAutenticacao({
        acao: "login.falha",
        email: dados.email,
        userId: usuario.id,
        motivo: "senha_incorreta",
      });

      return NextResponse.json({ erro: FALHA }, { status: 401 });
    }

    // -------------------------------------------------------------------------
    // Autenticado. Falta decidir em QUAL igreja a sessão entra.
    // -------------------------------------------------------------------------
    const tenant = await resolverTenantPorHost(ctx.host);
    const naPlataforma = ehHostDaPlataforma(ctx.host);

    let tenantAtivoId: string | null = null;
    let destino = "/painel";

    if (tenant) {
      // Login pelo domínio de uma igreja: exige vínculo COM ESSA igreja.
      const membership = await prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId: tenant.id, userId: usuario.id } },
        select: { ativo: true, papel: true },
      });

      if (!membership?.ativo) {
        /**
         * O usuário existe e a senha está certa, mas ele não pertence a esta
         * igreja. Devolvemos a MESMA mensagem de credencial inválida.
         *
         * Parece exagero, mas não é: uma resposta distinta permitiria a um
         * pastor da Igreja A descobrir quem tem conta na Igreja B, só testando
         * e-mails no domínio dela.
         */
        await auditarAutenticacao({
          acao: "login.falha",
          email: dados.email,
          userId: usuario.id,
          tenantId: tenant.id,
          motivo: "sem_vinculo_com_tenant",
        });
        return NextResponse.json({ erro: FALHA }, { status: 401 });
      }

      if (tenant.status === "SUSPENSO" || tenant.status === "CANCELADO") {
        return NextResponse.json(
          { erro: "O acesso desta igreja está temporariamente suspenso." },
          { status: 403 },
        );
      }

      tenantAtivoId = tenant.id;
      destino = membership.papel === "MEMBRO" ? "/app" : "/painel";
    } else if (naPlataforma) {
      if (usuario.plataformaAdmin) {
        destino = "/plataforma";
      } else {
        // Usuário comum logando no domínio raiz: mandamos para a tela de
        // escolha de igreja.
        const primeira = await prisma.membership.findFirst({
          where: { userId: usuario.id, ativo: true },
          select: { tenantId: true },
          orderBy: { criadoEm: "asc" },
        });
        tenantAtivoId = primeira?.tenantId ?? null;
        destino = tenantAtivoId ? "/painel" : "/escolher-igreja";
      }
    } else {
      return NextResponse.json({ erro: FALHA }, { status: 401 });
    }

    // ---- Limpa contadores e cria a sessão.
    await prisma.user.update({
      where: { id: usuario.id },
      data: { tentativasFalhas: 0, bloqueadoAte: null, ultimoLoginEm: new Date() },
    });

    await Promise.all([
      limparLimite(REGRAS.login, `ip:${ctx.ipHash}`),
      limparLimite(REGRAS.login, `conta:${dados.email}`),
    ]);

    // Rehash transparente: fortalece a base conforme as pessoas entram.
    if (precisaRehash(usuario.senhaHash)) {
      const novoHash = await hashSenha(dados.senha);
      await prisma.user
        .update({ where: { id: usuario.id }, data: { senhaHash: novoHash } })
        .catch(() => {});
    }

    await criarSessao({ userId: usuario.id, tenantId: tenantAtivoId });

    await auditarAutenticacao({
      acao: "login.sucesso",
      email: usuario.email,
      userId: usuario.id,
      tenantId: tenantAtivoId,
    });

    return NextResponse.json(
      { ok: true, destino },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (erro) {
    return tratarErro(erro, { rota: "auth/login" });
  }
}

async function lerCorpo(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const texto = await request.text();
    if (texto.length > 8192) throw new Error("corpo grande demais");
    return JSON.parse(texto);
  }
  const form = await request.formData();
  return Object.fromEntries(
    [...form.entries()].filter(([k, v]) => typeof v === "string" && k !== "__proto__"),
  );
}
