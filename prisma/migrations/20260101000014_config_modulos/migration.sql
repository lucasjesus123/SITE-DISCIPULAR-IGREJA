-- Módulos ("gavetas") habilitados por igreja. Tenant-scoped + RLS.
CREATE TABLE "config_modulos" (
    "tenantId" TEXT NOT NULL,
    "gestao" BOOLEAN NOT NULL DEFAULT true,
    "site" BOOLEAN NOT NULL DEFAULT true,
    "app" BOOLEAN NOT NULL DEFAULT true,
    "louvor" BOOLEAN NOT NULL DEFAULT true,
    "kids" BOOLEAN NOT NULL DEFAULT true,
    "financeiro" BOOLEAN NOT NULL DEFAULT true,
    "inscricoes" BOOLEAN NOT NULL DEFAULT true,
    "celulas" BOOLEAN NOT NULL DEFAULT true,
    "escola" BOOLEAN NOT NULL DEFAULT true,
    "comunicacao" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_modulos_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "config_modulos" ADD CONSTRAINT "config_modulos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['config_modulos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS isolamento_tenant ON public.%I', t);
    EXECUTE format('CREATE POLICY isolamento_tenant ON public.%I FOR ALL USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('DROP POLICY IF EXISTS transicao_pre_rls ON public.%I', t);
    EXECUTE format('CREATE POLICY transicao_pre_rls ON public.%I FOR ALL USING (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'') WITH CHECK (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'')', t);
  END LOOP;
END $$;
