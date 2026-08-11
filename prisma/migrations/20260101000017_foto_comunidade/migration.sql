-- Foto da comunidade: usada no card "Você foi feito para fazer parte" na home.
-- Coluna nullable numa tabela que já está sob RLS — nada de política a mexer.
ALTER TABLE "site_configs" ADD COLUMN IF NOT EXISTS "fotoComunidadeId" TEXT;
