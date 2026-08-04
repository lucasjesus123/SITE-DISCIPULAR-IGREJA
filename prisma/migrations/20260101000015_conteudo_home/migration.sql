-- Conteúdo editável da home (ministérios e depoimentos) por igreja.
ALTER TABLE "site_configs" ADD COLUMN "ministeriosJson" TEXT;
ALTER TABLE "site_configs" ADD COLUMN "depoimentosJson" TEXT;
