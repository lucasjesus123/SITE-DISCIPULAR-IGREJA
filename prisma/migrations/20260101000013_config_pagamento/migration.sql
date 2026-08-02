-- Configuração de pagamento (gateway ASAAS) por igreja. Tenant-scoped + RLS.
CREATE TABLE "config_pagamento" (
    "tenantId" TEXT NOT NULL,
    "provedor" TEXT NOT NULL DEFAULT 'ASAAS',
    "ambiente" TEXT NOT NULL DEFAULT 'producao',
    "apiKeyCriptografada" TEXT,
    "webhookToken" VARCHAR(120),
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "config_pagamento_pkey" PRIMARY KEY ("tenantId")
);
ALTER TABLE "config_pagamento" ADD CONSTRAINT "config_pagamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['config_pagamento'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS isolamento_tenant ON public.%I', t);
    EXECUTE format('CREATE POLICY isolamento_tenant ON public.%I FOR ALL USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('DROP POLICY IF EXISTS transicao_pre_rls ON public.%I', t);
    EXECUTE format('CREATE POLICY transicao_pre_rls ON public.%I FOR ALL USING (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'') WITH CHECK (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'')', t);
  END LOOP;
END $$;
