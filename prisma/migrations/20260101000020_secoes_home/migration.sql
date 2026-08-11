-- Seções "Acesse o app", "Próximos passos" e faixas (Células/Oração/Newsletter),
-- editáveis por igreja. Coluna nullable numa tabela já sob RLS — sem política a mexer.
ALTER TABLE "site_configs" ADD COLUMN IF NOT EXISTS "secoesHomeJson" TEXT;
