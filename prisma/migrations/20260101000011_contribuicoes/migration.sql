-- =============================================================================
-- CONTRIBUIÇÕES (Contribuir do app · PIX ASAAS) — tenant-scoped + RLS.
-- =============================================================================
CREATE TYPE "TipoContribuicao" AS ENUM ('DIZIMO', 'OFERTA', 'MISSOES');
CREATE TYPE "StatusContribuicao" AS ENUM ('PENDENTE', 'CONFIRMADA', 'CANCELADA', 'EXPIRADA');

CREATE TABLE "contribuicoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membroUserId" TEXT,
    "campusId" TEXT,
    "nome" VARCHAR(160),
    "tipo" "TipoContribuicao" NOT NULL,
    "valorCentavos" BIGINT NOT NULL,
    "status" "StatusContribuicao" NOT NULL DEFAULT 'PENDENTE',
    "asaasPaymentId" VARCHAR(60),
    "pixCopiaECola" TEXT,
    "lancamentoId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmadaEm" TIMESTAMP(3),
    CONSTRAINT "contribuicoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contribuicoes_tenantId_asaasPaymentId_key" ON "contribuicoes"("tenantId", "asaasPaymentId");
CREATE INDEX "contribuicoes_tenantId_status_criadoEm_idx" ON "contribuicoes"("tenantId", "status", "criadoEm");
CREATE INDEX "contribuicoes_tenantId_membroUserId_idx" ON "contribuicoes"("tenantId", "membroUserId");
ALTER TABLE "contribuicoes" ADD CONSTRAINT "contribuicoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribuicoes" ADD CONSTRAINT "contribuicoes_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['contribuicoes'] LOOP
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
