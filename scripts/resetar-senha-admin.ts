/**
 * Reset CIRÚRGICO da senha de um usuário (ex.: o super admin).
 *
 * Mexe SÓ na senha de UM usuário — não roda o seed, não toca em nenhum outro
 * dado nem nas personalizações do painel. Usa o mesmo hash e a mesma política
 * de força do app (src/lib/auth), então o login funciona igual.
 *
 * COMO RODAR na VPS (não precisa reconstruir a imagem — o script é montado):
 *
 *   cd /var/www/saas-discipular
 *   git pull origin claude/saas-church-system-3tayab
 *   docker run --rm --network discipular_dados --env-file .env -e HOME=/root \
 *     -e NOVA_SENHA='EscolhaUmaSenhaForte#2026' \
 *     -v /var/www/saas-discipular/scripts:/app/scripts \
 *     discipular-toolbox:latest \
 *     npx tsx scripts/resetar-senha-admin.ts
 *
 * Opcional: -e ADMIN_EMAIL='outro@email' para trocar de qual usuário. O padrão
 * é o super admin da Discipular.
 */
import { PrismaClient } from "@prisma/client";
import { hashSenha, validarForca } from "@/lib/auth/password";

const email = (process.env.ADMIN_EMAIL ?? "admin@discipularigreja.com.br").trim().toLowerCase();
const senha = process.env.NOVA_SENHA?.trim();

if (!senha) {
  console.error("✗ Defina NOVA_SENHA. Ex.: -e NOVA_SENHA='MinhaSenhaForte#2026'");
  process.exit(1);
}

// Valida com a MESMA política do sistema — se for fraca, aborta explicando.
try {
  validarForca(senha);
} catch (e) {
  console.error("✗ Senha fraca:", (e as Error).message);
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const alvo = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!alvo) {
    console.error(`✗ Nenhum usuário com e-mail "${email}". Confira o e-mail do admin.`);
    process.exit(1);
  }
  await prisma.user.update({
    where: { id: alvo.id },
    data: { senhaHash: await hashSenha(senha), senhaAtualizadaEm: new Date() },
  });
  console.log(`✅ Senha redefinida para ${email}. Já pode entrar no /login.`);
} catch (e) {
  console.error("✗ Falhou:", (e as Error).message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
