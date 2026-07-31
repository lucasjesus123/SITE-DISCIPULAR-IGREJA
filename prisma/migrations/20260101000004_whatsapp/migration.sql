-- =============================================================================
-- WhatsApp (uazapi) — 1 instância/número por igreja
-- =============================================================================
-- Segue o mesmo padrão de isolamento das demais tabelas de igreja: RLS ligada
-- (ENABLE + FORCE), política `isolamento_tenant` por `app.tenant_id` e a
-- política de transição `transicao_pre_rls` (ver 20260101000000_rls). O GRANT
-- de DML para `discipular_app` é herdado via ALTER DEFAULT PRIVILEGES daquela
-- migração — tabelas novas criadas pelo migrator já nascem acessíveis ao app.

CREATE TABLE "whatsapp_instances" (
    "tenantId" TEXT NOT NULL,
    "uazInstanceId" TEXT NOT NULL,
    "uazToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'desconectado',
    "numero" VARCHAR(20),
    "perfilNome" VARCHAR(120),
    "conectadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("tenantId")
);

ALTER TABLE "whatsapp_instances"
    ADD CONSTRAINT "whatsapp_instances_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- --- RLS ----------------------------------------------------------------------
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS isolamento_tenant ON public.whatsapp_instances;
CREATE POLICY isolamento_tenant ON public.whatsapp_instances
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS transicao_pre_rls ON public.whatsapp_instances;
CREATE POLICY transicao_pre_rls ON public.whatsapp_instances
  FOR ALL
  USING      (coalesce(current_setting('app.rls_estrito', true), 'off') <> 'on')
  WITH CHECK (coalesce(current_setting('app.rls_estrito', true), 'off') <> 'on');
