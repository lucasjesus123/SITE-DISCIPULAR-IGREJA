-- =============================================================================
-- TEMA PADRÃO = INSTITUCIONAL (grafite + verde floresta + menta, Archivo/Inter)
-- =============================================================================
-- O visual aprovado do site passa a ser o PADRÃO do SaaS: toda igreja nova
-- nasce nele e as igrejas que nunca personalizaram cor migram para ele. Igrejas
-- que escolheram a própria identidade no painel NÃO são tocadas.

-- 1) Novos defaults de coluna (valem para SiteConfig criado sem cores — ex.: a
--    action criarIgreja da plataforma).
ALTER TABLE "site_configs" ALTER COLUMN "corAcento"      SET DEFAULT '#34472F';
ALTER TABLE "site_configs" ALTER COLUMN "corAcentoClara" SET DEFAULT '#8FBF7A';
ALTER TABLE "site_configs" ALTER COLUMN "corTinta"       SET DEFAULT '#14161A';
ALTER TABLE "site_configs" ALTER COLUMN "corPapel"       SET DEFAULT '#EEF0F2';
ALTER TABLE "site_configs" ALTER COLUMN "fonteTitulo"    SET DEFAULT 'Archivo';
ALTER TABLE "site_configs" ALTER COLUMN "fonteTexto"     SET DEFAULT 'Inter';

-- 2) Backfill das igrejas ainda em um PADRÃO ANTIGO conhecido (nunca
--    personalizado): #0E0E10 (P&B Moderno) ou #C2A15C (dourado editorial).
--    O casamento por corAcento nesses dois valores é o sinal de "não
--    personalizado" — quem trocou a cor tem outra e passa longe.
--
--    site_configs está sob FORCE ROW LEVEL SECURITY; esta migração roda como
--    DONO das tabelas (discipular_migrator, via DIRECT_DATABASE_URL). Com FORCE
--    ligado, até o dono é filtrado pelas políticas e um UPDATE cross-tenant sem
--    `app.tenant_id` alcançaria zero linhas. Suspendemos FORCE apenas aqui,
--    dentro da mesma transação da migração, e religamos logo em seguida — é o
--    caminho documentado para backfill em 20260101000000_rls, item (a).
ALTER TABLE "site_configs" NO FORCE ROW LEVEL SECURITY;

UPDATE "site_configs"
SET "corAcento"      = '#34472F',
    "corAcentoClara" = '#8FBF7A',
    "corTinta"       = '#14161A',
    "corPapel"       = '#EEF0F2',
    "fonteTitulo"    = 'Archivo',
    "fonteTexto"     = 'Inter'
WHERE "corAcento" IN ('#0E0E10', '#C2A15C');

ALTER TABLE "site_configs" FORCE ROW LEVEL SECURITY;
