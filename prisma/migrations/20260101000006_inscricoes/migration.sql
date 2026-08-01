-- =============================================================================
-- INSCRIÇÕES — eventos/cursos com link público e lista de inscritos
-- =============================================================================
CREATE TABLE "inscricoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "descricao" VARCHAR(2000),
    "slug" VARCHAR(80) NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "encerraEm" TIMESTAMP(3),
    "pedirTelefone" BOOLEAN NOT NULL DEFAULT true,
    "pedirEmail" BOOLEAN NOT NULL DEFAULT false,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inscricoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inscricoes_tenantId_slug_key" ON "inscricoes"("tenantId", "slug");
CREATE INDEX "inscricoes_tenantId_ativa_criadoEm_idx" ON "inscricoes"("tenantId", "ativa", "criadoEm");
ALTER TABLE "inscricoes" ADD CONSTRAINT "inscricoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "inscricao_respostas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inscricaoId" TEXT NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "telefone" VARCHAR(20),
    "email" VARCHAR(254),
    "observacao" VARCHAR(500),
    "ip" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inscricao_respostas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inscricao_respostas_tenantId_inscricaoId_criadoEm_idx" ON "inscricao_respostas"("tenantId", "inscricaoId", "criadoEm");
ALTER TABLE "inscricao_respostas" ADD CONSTRAINT "inscricao_respostas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inscricao_respostas" ADD CONSTRAINT "inscricao_respostas_inscricaoId_fkey" FOREIGN KEY ("inscricaoId") REFERENCES "inscricoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (mesmo padrão)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['inscricoes','inscricao_respostas'] LOOP
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
