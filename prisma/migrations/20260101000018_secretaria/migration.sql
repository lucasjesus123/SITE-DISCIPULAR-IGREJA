-- =============================================================================
-- SECRETARIA — registros de cadastro + disparos agendados de WhatsApp.
-- Duas tabelas novas, ambas sob RLS (isolamento por tenant), no mesmo padrão
-- das demais (ver 20260101000000_rls).
-- =============================================================================

CREATE TYPE "TipoRegistroSecretaria" AS ENUM ('VISITANTE', 'BATISMO', 'APRESENTACAO_CRIANCA', 'INTEGRACAO', 'DECISAO');
CREATE TYPE "StatusDisparo" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'CANCELADO');

CREATE TABLE "registros_secretaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoRegistroSecretaria" NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "contato" VARCHAR(30),
    "dataNascimento" DATE,
    "comoConheceu" VARCHAR(200),
    "endereco" VARCHAR(300),
    "dataInscricao" DATE,
    "dataReferencia" DATE,
    "observacao" TEXT,
    "extra" JSONB,
    "criadoPorId" TEXT,
    "criadoPorNome" VARCHAR(160),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "registros_secretaria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "registros_secretaria_tenantId_tipo_criadoEm_idx" ON "registros_secretaria"("tenantId", "tipo", "criadoEm");
CREATE INDEX "registros_secretaria_tenantId_tipo_dataReferencia_idx" ON "registros_secretaria"("tenantId", "tipo", "dataReferencia");
ALTER TABLE "registros_secretaria" ADD CONSTRAINT "registros_secretaria_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "disparos_agendados" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contato" VARCHAR(30) NOT NULL,
    "nome" VARCHAR(160),
    "mensagem" TEXT NOT NULL,
    "agendadoPara" TIMESTAMP(3) NOT NULL,
    "status" "StatusDisparo" NOT NULL DEFAULT 'PENDENTE',
    "erro" VARCHAR(300),
    "enviadoEm" TIMESTAMP(3),
    "registroId" TEXT,
    "criadoPorId" TEXT,
    "criadoPorNome" VARCHAR(160),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "disparos_agendados_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "disparos_agendados_tenantId_status_agendadoPara_idx" ON "disparos_agendados"("tenantId", "status", "agendadoPara");
CREATE INDEX "disparos_agendados_status_agendadoPara_idx" ON "disparos_agendados"("status", "agendadoPara");
ALTER TABLE "disparos_agendados" ADD CONSTRAINT "disparos_agendados_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS nas duas tabelas novas (mesmo par de políticas isolamento_tenant + transicao_pre_rls).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['registros_secretaria', 'disparos_agendados'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS isolamento_tenant ON public.%I', t);
    EXECUTE format('CREATE POLICY isolamento_tenant ON public.%I FOR ALL USING ("tenantId" = current_setting(''app.tenant_id'', true)) WITH CHECK ("tenantId" = current_setting(''app.tenant_id'', true))', t);
    EXECUTE format('DROP POLICY IF EXISTS transicao_pre_rls ON public.%I', t);
    EXECUTE format('CREATE POLICY transicao_pre_rls ON public.%I FOR ALL USING (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'') WITH CHECK (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'')', t);
  END LOOP;
END $$;
