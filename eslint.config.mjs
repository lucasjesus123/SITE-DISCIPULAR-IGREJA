import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Configuração do ESLint (flat config, ESLint 9).
 *
 * A regra mais importante deste arquivo NÃO é de estilo — é de SEGURANÇA.
 * Ver `no-restricted-imports` abaixo.
 */
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // A restrição de import do Prisma (controle de segurança) NÃO fica aqui,
      // no bloco global: as rotas de API (src/app/api/**) e o super admin
      // (src/app/plataforma/**) legitimamente usam o cliente global para
      // modelos de plataforma (Tenant, User, Sessao). A restrição vale só para
      // as rotas de UI de igreja — ver o bloco `files: [...]` abaixo.

      // Navegação interna com <a> em vez de <Link>: é uma dica de performance
      // (recarga total vs. transição SPA), não um bug. Em páginas de auth uma
      // recarga completa é até desejável. Fica como aviso — não bloqueia build.
      "@next/next/no-html-link-for-pages": "warn",

      // console.log vaza para o log de produção; use o logger estruturado
      // (src/lib/logger.ts), que remove campos sensíveis. error/warn liberados.
      "no-console": ["warn", { allow: ["error", "warn"] }],

      // `any` desliga a checagem de tipo — e foi o tipo esquecido que já
      // deixou passar bug de escopo de tenant em outros sistemas.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  {
    // As páginas e componentes de UI ficam sob a regra de import acima.
    files: ["src/app/painel/**", "src/app/app/**", "src/app/(site)/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db/prisma",
              importNames: ["prisma"],
              message:
                "Rota de UI não acessa o Prisma cru. Use ctx.db / tenantDb — o dado é escopado por igreja.",
            },
          ],
        },
      ],
    },
  },

  {
    ignores: [".next/**", "node_modules/**", "public/**", "prisma/migrations/**"],
  },
];

export default eslintConfig;
