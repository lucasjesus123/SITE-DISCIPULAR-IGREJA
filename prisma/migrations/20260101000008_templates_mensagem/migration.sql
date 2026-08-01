-- =============================================================================
-- Templates de mensagem (automações editáveis pela secretaria)
-- =============================================================================
CREATE TABLE "mensagens_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chave" VARCHAR(60) NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "corpo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mensagens_templates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mensagens_templates_tenantId_chave_key" ON "mensagens_templates"("tenantId", "chave");
ALTER TABLE "mensagens_templates" ADD CONSTRAINT "mensagens_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public.mensagens_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_templates FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.mensagens_templates;
CREATE POLICY isolamento_tenant ON public.mensagens_templates
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
DROP POLICY IF EXISTS transicao_pre_rls ON public.mensagens_templates;
CREATE POLICY transicao_pre_rls ON public.mensagens_templates
  FOR ALL
  USING      (coalesce(current_setting('app.rls_estrito', true), 'off') <> 'on')
  WITH CHECK (coalesce(current_setting('app.rls_estrito', true), 'off') <> 'on');
