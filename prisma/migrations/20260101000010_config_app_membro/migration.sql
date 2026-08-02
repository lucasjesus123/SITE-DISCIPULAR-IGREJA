-- =============================================================================
-- CONFIGURAÇÃO DO APP DE MEMBROS — toggles por igreja. Tenant-scoped + RLS.
-- =============================================================================
CREATE TABLE "config_app_membro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inicio" BOOLEAN NOT NULL DEFAULT true,
    "palavra" BOOLEAN NOT NULL DEFAULT true,
    "contribuir" BOOLEAN NOT NULL DEFAULT true,
    "agenda" BOOLEAN NOT NULL DEFAULT true,
    "celula" BOOLEAN NOT NULL DEFAULT false,
    "perfil" BOOLEAN NOT NULL DEFAULT true,
    "notificacoes" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_app_membro_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "config_app_membro_tenantId_key" ON "config_app_membro"("tenantId");
ALTER TABLE "config_app_membro" ADD CONSTRAINT "config_app_membro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['config_app_membro'] LOOP
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
