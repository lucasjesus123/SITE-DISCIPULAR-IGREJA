-- Fotos de comunidade editáveis pelo painel (Quem Somos, Sobre e Células).
-- Colunas nuláveis: adição segura, sem downtime. O papel discipular_app já tem
-- DML em nível de tabela, que cobre colunas novas — nenhum GRANT adicional.
ALTER TABLE "site_configs" ADD COLUMN "fotoComunidadeId" TEXT;
ALTER TABLE "site_configs" ADD COLUMN "fotoSobreId" TEXT;
ALTER TABLE "site_configs" ADD COLUMN "fotoCelulasId" TEXT;
