-- Bloco "Novo por aqui" + versículo do topo, editáveis por igreja no painel.
-- Coluna nullable numa tabela que já está sob RLS — nada de política a mexer.
ALTER TABLE "site_configs" ADD COLUMN IF NOT EXISTS "boasVindasJson" TEXT;
