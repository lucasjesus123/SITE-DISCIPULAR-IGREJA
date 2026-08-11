-- Vídeo do topo (hero) que toca embutido no site. Coluna nullable numa tabela
-- já sob RLS — sem política a mexer.
ALTER TABLE "site_configs" ADD COLUMN IF NOT EXISTS "heroVideoId" VARCHAR(20);
