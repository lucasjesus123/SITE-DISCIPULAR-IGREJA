-- =============================================================================
-- FINANCEIRO — partidas dobradas, valores em centavos (BIGINT)
-- =============================================================================
-- 5 tabelas tenant-scoped (congregação = campi). Todas com RLS no mesmo padrão
-- das demais (ver 20260101000000_rls): ENABLE + FORCE + isolamento_tenant +
-- transicao_pre_rls. O GRANT de DML para discipular_app é herdado via
-- ALTER DEFAULT PRIVILEGES daquela migração.

-- --- Tipos --------------------------------------------------------------------
CREATE TYPE "NaturezaConta"   AS ENUM ('ATIVO', 'PASSIVO', 'PATRIMONIO', 'RECEITA', 'DESPESA');
CREATE TYPE "TipoContaFisica" AS ENUM ('DINHEIRO', 'BANCO', 'PIX');
CREATE TYPE "PapelFinanceiro" AS ENUM ('ADMIN_MATRIZ', 'TESOUREIRO', 'LANCADOR', 'VISUALIZADOR');
CREATE TYPE "EscopoFinanceiro" AS ENUM ('MATRIZ', 'CONGREGACAO');

-- --- contas_contabeis ---------------------------------------------------------
CREATE TABLE "contas_contabeis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "codigo" VARCHAR(20) NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "natureza" "NaturezaConta" NOT NULL,
    "tipoFisico" "TipoContaFisica",
    "saldoInicialCentavos" BIGINT NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contas_contabeis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contas_contabeis_tenantId_codigo_key" ON "contas_contabeis"("tenantId", "codigo");
CREATE INDEX "contas_contabeis_tenantId_natureza_ativo_idx" ON "contas_contabeis"("tenantId", "natureza", "ativo");
CREATE INDEX "contas_contabeis_tenantId_campusId_idx" ON "contas_contabeis"("tenantId", "campusId");
ALTER TABLE "contas_contabeis" ADD CONSTRAINT "contas_contabeis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contas_contabeis" ADD CONSTRAINT "contas_contabeis_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- lancamentos_financeiros --------------------------------------------------
CREATE TABLE "lancamentos_financeiros" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "dataCompetencia" DATE NOT NULL,
    "dataCaixa" DATE NOT NULL,
    "historico" VARCHAR(300) NOT NULL,
    "valorCentavos" BIGINT NOT NULL,
    "membroId" TEXT,
    "anexoId" TEXT,
    "contribuicaoAnonima" BOOLEAN NOT NULL DEFAULT false,
    "chaveIdempotencia" VARCHAR(80) NOT NULL,
    "estornado" BOOLEAN NOT NULL DEFAULT false,
    "estornoDeId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "ip" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lancamentos_financeiros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "lancamentos_financeiros_tenantId_chaveIdempotencia_key" ON "lancamentos_financeiros"("tenantId", "chaveIdempotencia");
CREATE INDEX "lancamentos_financeiros_tenantId_campusId_dataCompetencia_idx" ON "lancamentos_financeiros"("tenantId", "campusId", "dataCompetencia");
CREATE INDEX "lancamentos_financeiros_tenantId_campusId_dataCaixa_idx" ON "lancamentos_financeiros"("tenantId", "campusId", "dataCaixa");
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lancamentos_financeiros" ADD CONSTRAINT "lancamentos_financeiros_estornoDeId_fkey" FOREIGN KEY ("estornoDeId") REFERENCES "lancamentos_financeiros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- --- partidas_financeiras -----------------------------------------------------
CREATE TABLE "partidas_financeiras" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "debitoCentavos" BIGINT NOT NULL DEFAULT 0,
    "creditoCentavos" BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT "partidas_financeiras_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partidas_financeiras_tenantId_contaId_idx" ON "partidas_financeiras"("tenantId", "contaId");
CREATE INDEX "partidas_financeiras_tenantId_lancamentoId_idx" ON "partidas_financeiras"("tenantId", "lancamentoId");
ALTER TABLE "partidas_financeiras" ADD CONSTRAINT "partidas_financeiras_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partidas_financeiras" ADD CONSTRAINT "partidas_financeiras_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamentos_financeiros"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "partidas_financeiras" ADD CONSTRAINT "partidas_financeiras_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_contabeis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- --- fechamentos_financeiros --------------------------------------------------
CREATE TABLE "fechamentos_financeiros" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "competencia" VARCHAR(7) NOT NULL,
    "saldoFinalCentavos" BIGINT NOT NULL,
    "travado" BOOLEAN NOT NULL DEFAULT true,
    "fechadoPorId" TEXT NOT NULL,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fechamentos_financeiros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "fechamentos_financeiros_tenantId_campusId_competencia_key" ON "fechamentos_financeiros"("tenantId", "campusId", "competencia");
ALTER TABLE "fechamentos_financeiros" ADD CONSTRAINT "fechamentos_financeiros_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fechamentos_financeiros" ADD CONSTRAINT "fechamentos_financeiros_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --- acessos_financeiros ------------------------------------------------------
CREATE TABLE "acessos_financeiros" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "escopo" "EscopoFinanceiro" NOT NULL,
    "campusId" TEXT,
    "papel" "PapelFinanceiro" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acessos_financeiros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "acessos_financeiros_tenantId_userId_campusId_key" ON "acessos_financeiros"("tenantId", "userId", "campusId");
CREATE INDEX "acessos_financeiros_tenantId_userId_idx" ON "acessos_financeiros"("tenantId", "userId");
ALTER TABLE "acessos_financeiros" ADD CONSTRAINT "acessos_financeiros_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "acessos_financeiros" ADD CONSTRAINT "acessos_financeiros_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =============================================================================
-- RLS — mesmo padrão das demais tabelas de igreja
-- =============================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contas_contabeis','lancamentos_financeiros','partidas_financeiras',
    'fechamentos_financeiros','acessos_financeiros'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS isolamento_tenant ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY isolamento_tenant ON public.%I FOR ALL '
      || 'USING ("tenantId" = current_setting(''app.tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);

    EXECUTE format('DROP POLICY IF EXISTS transicao_pre_rls ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY transicao_pre_rls ON public.%I FOR ALL '
      || 'USING (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'') '
      || 'WITH CHECK (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'')', t);
  END LOOP;
END $$;
