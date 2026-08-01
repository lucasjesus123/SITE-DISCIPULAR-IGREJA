-- =============================================================================
-- MINISTÉRIO DE LOUVOR — equipe, escala, repertório, chat. Tenant-scoped + RLS.
-- =============================================================================
CREATE TYPE "TipoMinisterio" AS ENUM ('LOUVOR', 'MULTIMIDIA', 'RECEPCAO', 'INTERCESSAO', 'DANCA', 'OUTRO');
CREATE TYPE "StatusEscala" AS ENUM ('RASCUNHO', 'PUBLICADA');
CREATE TYPE "TipoEventoEscala" AS ENUM ('CULTO', 'ENSAIO', 'EVENTO');
CREATE TYPE "PapelEscalado" AS ENUM ('MINISTRANTE', 'INSTRUMENTISTA', 'VOCAL', 'MULTIMIDIA');
CREATE TYPE "StatusEscalado" AS ENUM ('PENDENTE', 'CONFIRMADO', 'RECUSADO', 'TROCA_SOLICITADA');

CREATE TABLE "ministerios" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "tipo" "TipoMinisterio" NOT NULL DEFAULT 'LOUVOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ministerios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ministerios_tenantId_ativo_idx" ON "ministerios"("tenantId", "ativo");
ALTER TABLE "ministerios" ADD CONSTRAINT "ministerios_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "membros_ministerio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ministerioId" TEXT NOT NULL,
    "userId" TEXT,
    "pessoaId" TEXT,
    "nome" VARCHAR(160) NOT NULL,
    "whatsapp" VARCHAR(20),
    "fotoId" TEXT,
    "ehLider" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "membros_ministerio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "membros_ministerio_tenantId_ministerioId_ativo_idx" ON "membros_ministerio"("tenantId", "ministerioId", "ativo");
CREATE INDEX "membros_ministerio_tenantId_userId_idx" ON "membros_ministerio"("tenantId", "userId");
ALTER TABLE "membros_ministerio" ADD CONSTRAINT "membros_ministerio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membros_ministerio" ADD CONSTRAINT "membros_ministerio_ministerioId_fkey" FOREIGN KEY ("ministerioId") REFERENCES "ministerios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "funcoes_ministerio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ministerioId" TEXT NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "funcoes_ministerio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "funcoes_ministerio_tenantId_ministerioId_ordem_idx" ON "funcoes_ministerio"("tenantId", "ministerioId", "ordem");
ALTER TABLE "funcoes_ministerio" ADD CONSTRAINT "funcoes_ministerio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "funcoes_ministerio" ADD CONSTRAINT "funcoes_ministerio_ministerioId_fkey" FOREIGN KEY ("ministerioId") REFERENCES "ministerios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "membro_funcoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membroId" TEXT NOT NULL,
    "funcaoId" TEXT NOT NULL,
    CONSTRAINT "membro_funcoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "membro_funcoes_membroId_funcaoId_key" ON "membro_funcoes"("membroId", "funcaoId");
CREATE INDEX "membro_funcoes_tenantId_idx" ON "membro_funcoes"("tenantId");
ALTER TABLE "membro_funcoes" ADD CONSTRAINT "membro_funcoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membro_funcoes" ADD CONSTRAINT "membro_funcoes_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "membros_ministerio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membro_funcoes" ADD CONSTRAINT "membro_funcoes_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "funcoes_ministerio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "indisponibilidades_ministerio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "membroId" TEXT NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "motivo" VARCHAR(200),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "indisponibilidades_ministerio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "indisponibilidades_ministerio_tenantId_membroId_idx" ON "indisponibilidades_ministerio"("tenantId", "membroId");
ALTER TABLE "indisponibilidades_ministerio" ADD CONSTRAINT "indisponibilidades_ministerio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "indisponibilidades_ministerio" ADD CONSTRAINT "indisponibilidades_ministerio_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "membros_ministerio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "escalas_ministerio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ministerioId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "status" "StatusEscala" NOT NULL DEFAULT 'RASCUNHO',
    "publicadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "escalas_ministerio_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "escalas_ministerio_ministerioId_ano_mes_key" ON "escalas_ministerio"("ministerioId", "ano", "mes");
CREATE INDEX "escalas_ministerio_tenantId_ministerioId_idx" ON "escalas_ministerio"("tenantId", "ministerioId");
ALTER TABLE "escalas_ministerio" ADD CONSTRAINT "escalas_ministerio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalas_ministerio" ADD CONSTRAINT "escalas_ministerio_ministerioId_fkey" FOREIGN KEY ("ministerioId") REFERENCES "ministerios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "eventos_escala" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "escalaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "hora" VARCHAR(5) NOT NULL,
    "tipo" "TipoEventoEscala" NOT NULL DEFAULT 'CULTO',
    "titulo" VARCHAR(120) NOT NULL,
    "dressCodeTexto" VARCHAR(200),
    "dressCodeImagemId" TEXT,
    "observacoes" VARCHAR(1000),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "eventos_escala_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "eventos_escala_tenantId_escalaId_data_idx" ON "eventos_escala"("tenantId", "escalaId", "data");
ALTER TABLE "eventos_escala" ADD CONSTRAINT "eventos_escala_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "eventos_escala" ADD CONSTRAINT "eventos_escala_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "escalas_ministerio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "escalados_evento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "membroId" TEXT NOT NULL,
    "funcaoId" TEXT,
    "papel" "PapelEscalado" NOT NULL DEFAULT 'INSTRUMENTISTA',
    "status" "StatusEscalado" NOT NULL DEFAULT 'PENDENTE',
    "respondidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "escalados_evento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "escalados_evento_tenantId_eventoId_idx" ON "escalados_evento"("tenantId", "eventoId");
CREATE INDEX "escalados_evento_tenantId_membroId_idx" ON "escalados_evento"("tenantId", "membroId");
ALTER TABLE "escalados_evento" ADD CONSTRAINT "escalados_evento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalados_evento" ADD CONSTRAINT "escalados_evento_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalados_evento" ADD CONSTRAINT "escalados_evento_membroId_fkey" FOREIGN KEY ("membroId") REFERENCES "membros_ministerio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escalados_evento" ADD CONSTRAINT "escalados_evento_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "funcoes_ministerio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "musicas_ministerio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ministerioId" TEXT NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "artista" VARCHAR(120),
    "tomPadrao" VARCHAR(8),
    "linkCifra" VARCHAR(500),
    "linkLetra" VARCHAR(500),
    "linkVideo" VARCHAR(500),
    "linkAudio" VARCHAR(500),
    "cifra" TEXT,
    "tags" VARCHAR(200),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "musicas_ministerio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "musicas_ministerio_tenantId_ministerioId_titulo_idx" ON "musicas_ministerio"("tenantId", "ministerioId", "titulo");
ALTER TABLE "musicas_ministerio" ADD CONSTRAINT "musicas_ministerio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "musicas_ministerio" ADD CONSTRAINT "musicas_ministerio_ministerioId_fkey" FOREIGN KEY ("ministerioId") REFERENCES "ministerios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "evento_musicas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventoId" TEXT NOT NULL,
    "musicaId" TEXT NOT NULL,
    "tomDoDia" VARCHAR(8),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "evento_musicas_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "evento_musicas_tenantId_eventoId_ordem_idx" ON "evento_musicas"("tenantId", "eventoId", "ordem");
ALTER TABLE "evento_musicas" ADD CONSTRAINT "evento_musicas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evento_musicas" ADD CONSTRAINT "evento_musicas_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos_escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evento_musicas" ADD CONSTRAINT "evento_musicas_musicaId_fkey" FOREIGN KEY ("musicaId") REFERENCES "musicas_ministerio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_ministerio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ministerioId" TEXT NOT NULL,
    "eventoId" TEXT,
    "autorUserId" TEXT NOT NULL,
    "autorNome" VARCHAR(160) NOT NULL,
    "texto" VARCHAR(2000) NOT NULL,
    "fixada" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_ministerio_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_ministerio_tenantId_ministerioId_criadoEm_idx" ON "chat_ministerio"("tenantId", "ministerioId", "criadoEm");
ALTER TABLE "chat_ministerio" ADD CONSTRAINT "chat_ministerio_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_ministerio" ADD CONSTRAINT "chat_ministerio_ministerioId_fkey" FOREIGN KEY ("ministerioId") REFERENCES "ministerios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS em todas as tabelas do módulo (isolamento por tenant + porta de transição).
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'ministerios','membros_ministerio','funcoes_ministerio','membro_funcoes',
    'indisponibilidades_ministerio','escalas_ministerio','eventos_escala',
    'escalados_evento','musicas_ministerio','evento_musicas','chat_ministerio'
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
