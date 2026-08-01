-- =============================================================================
-- KIDS — Ministério Infantil (dados de menores). Todas tenant-scoped + RLS.
-- =============================================================================
CREATE TYPE "StatusSessaoKids" AS ENUM ('EM_SALA', 'RETIRADA');
CREATE TYPE "TipoEvolucao" AS ENUM ('PRESENCA', 'LICAO', 'MARCO', 'CONQUISTA');

-- salas_kids (criada antes de criancas, que a referencia)
CREATE TABLE "salas_kids" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "faixaEtaria" VARCHAR(40),
    "capacidade" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "salas_kids_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "salas_kids_tenantId_ativa_ordem_idx" ON "salas_kids"("tenantId", "ativa", "ordem");
ALTER TABLE "salas_kids" ADD CONSTRAINT "salas_kids_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "criancas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "apelido" VARCHAR(60),
    "dataNascimento" DATE NOT NULL,
    "fotoId" TEXT,
    "alergias" VARCHAR(500),
    "restricoes" VARCHAR(500),
    "necessidadesEspeciais" VARCHAR(500),
    "observacoes" VARCHAR(1000),
    "salaPadraoId" TEXT,
    "consentimentoLgpd" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoFoto" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "excluidoEm" TIMESTAMP(3),
    CONSTRAINT "criancas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "criancas_tenantId_excluidoEm_nome_idx" ON "criancas"("tenantId", "excluidoEm", "nome");
ALTER TABLE "criancas" ADD CONSTRAINT "criancas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "criancas" ADD CONSTRAINT "criancas_salaPadraoId_fkey" FOREIGN KEY ("salaPadraoId") REFERENCES "salas_kids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "crianca_responsaveis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "criancaId" TEXT NOT NULL,
    "responsavelUserId" TEXT NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "parentesco" VARCHAR(40),
    "whatsapp" VARCHAR(20),
    "autorizadoRetirar" BOOLEAN NOT NULL DEFAULT true,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crianca_responsaveis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "crianca_responsaveis_criancaId_responsavelUserId_key" ON "crianca_responsaveis"("criancaId", "responsavelUserId");
CREATE INDEX "crianca_responsaveis_tenantId_responsavelUserId_idx" ON "crianca_responsaveis"("tenantId", "responsavelUserId");
ALTER TABLE "crianca_responsaveis" ADD CONSTRAINT "crianca_responsaveis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crianca_responsaveis" ADD CONSTRAINT "crianca_responsaveis_criancaId_fkey" FOREIGN KEY ("criancaId") REFERENCES "criancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sessoes_sala_kids" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "criancaId" TEXT NOT NULL,
    "salaId" TEXT NOT NULL,
    "cultoData" DATE NOT NULL,
    "status" "StatusSessaoKids" NOT NULL DEFAULT 'EM_SALA',
    "codigoSegurancaHash" VARCHAR(64) NOT NULL,
    "checkinEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkinPor" TEXT NOT NULL,
    "checkoutEm" TIMESTAMP(3),
    "checkoutPor" TEXT,
    "retiradoPorUserId" TEXT,
    CONSTRAINT "sessoes_sala_kids_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sessoes_sala_kids_tenantId_status_cultoData_idx" ON "sessoes_sala_kids"("tenantId", "status", "cultoData");
CREATE INDEX "sessoes_sala_kids_tenantId_criancaId_cultoData_idx" ON "sessoes_sala_kids"("tenantId", "criancaId", "cultoData");
ALTER TABLE "sessoes_sala_kids" ADD CONSTRAINT "sessoes_sala_kids_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessoes_sala_kids" ADD CONSTRAINT "sessoes_sala_kids_criancaId_fkey" FOREIGN KEY ("criancaId") REFERENCES "criancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sessoes_sala_kids" ADD CONSTRAINT "sessoes_sala_kids_salaId_fkey" FOREIGN KEY ("salaId") REFERENCES "salas_kids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "qr_tokens_kids" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usado" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qr_tokens_kids_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "qr_tokens_kids_tenantId_sessaoId_idx" ON "qr_tokens_kids"("tenantId", "sessaoId");
ALTER TABLE "qr_tokens_kids" ADD CONSTRAINT "qr_tokens_kids_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qr_tokens_kids" ADD CONSTRAINT "qr_tokens_kids_sessaoId_fkey" FOREIGN KEY ("sessaoId") REFERENCES "sessoes_sala_kids"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "evolucoes_kids" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "criancaId" TEXT NOT NULL,
    "tipo" "TipoEvolucao" NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "descricao" VARCHAR(1000),
    "data" DATE NOT NULL,
    "midiaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evolucoes_kids_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "evolucoes_kids_tenantId_criancaId_data_idx" ON "evolucoes_kids"("tenantId", "criancaId", "data");
ALTER TABLE "evolucoes_kids" ADD CONSTRAINT "evolucoes_kids_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evolucoes_kids" ADD CONSTRAINT "evolucoes_kids_criancaId_fkey" FOREIGN KEY ("criancaId") REFERENCES "criancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "conquistas_kids" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "criancaId" TEXT NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "icone" VARCHAR(40) NOT NULL,
    "conquistadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "conquistas_kids_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conquistas_kids_tenantId_criancaId_idx" ON "conquistas_kids"("tenantId", "criancaId");
ALTER TABLE "conquistas_kids" ADD CONSTRAINT "conquistas_kids_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conquistas_kids" ADD CONSTRAINT "conquistas_kids_criancaId_fkey" FOREIGN KEY ("criancaId") REFERENCES "criancas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS em todas
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'salas_kids','criancas','crianca_responsaveis','sessoes_sala_kids',
    'qr_tokens_kids','evolucoes_kids','conquistas_kids'
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
