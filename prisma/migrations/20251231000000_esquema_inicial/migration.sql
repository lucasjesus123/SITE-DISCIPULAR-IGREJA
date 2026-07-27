-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ATIVO', 'SUSPENSO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('ESSENCIAL', 'CRESCIMENTO', 'MULTISEDE');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDENTE', 'VERIFICADO', 'ERRO');

-- CreateEnum
CREATE TYPE "Papel" AS ENUM ('ADMIN', 'PASTOR', 'SECRETARIA', 'LIDER_CELULA', 'MEMBRO');

-- CreateEnum
CREATE TYPE "StatusPessoa" AS ENUM ('VISITANTE', 'EM_ACOMPANHAMENTO', 'CONGREGANTE', 'MEMBRO', 'INATIVO', 'TRANSFERIDO');

-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('MASCULINO', 'FEMININO', 'NAO_INFORMADO');

-- CreateEnum
CREATE TYPE "EstadoCivil" AS ENUM ('SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_ESTAVEL', 'NAO_INFORMADO');

-- CreateEnum
CREATE TYPE "OrigemCadastro" AS ENUM ('SITE', 'APP', 'PAINEL', 'IMPORTACAO', 'CELULA');

-- CreateEnum
CREATE TYPE "StatusSubmissao" AS ENUM ('NOVO', 'EM_ANALISE', 'CONCLUIDO', 'ARQUIVADO', 'SPAM');

-- CreateEnum
CREATE TYPE "TipoSubmissao" AS ENUM ('NOVO_MEMBRO', 'VISITANTE', 'BATISMO', 'PEDIDO_ORACAO', 'CONTATO', 'INSCRICAO_CURSO', 'QUERO_CELULA', 'ACONSELHAMENTO');

-- CreateEnum
CREATE TYPE "StatusBatismo" AS ENUM ('SOLICITADO', 'EM_PREPARO', 'APROVADO', 'AGENDADO', 'REALIZADO', 'RECUSADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusOracao" AS ENUM ('RECEBIDO', 'ORANDO', 'RESPONDIDO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "VisibilidadeOracao" AS ENUM ('PRIVADO', 'MURAL_MEMBROS', 'PUBLICO');

-- CreateEnum
CREATE TYPE "TipoAgenda" AS ENUM ('CULTO', 'ESCOLA', 'CELULA', 'EVENTO', 'ENSAIO', 'ORACAO');

-- CreateEnum
CREATE TYPE "StatusMatricula" AS ENUM ('INSCRITO', 'CONFIRMADO', 'CURSANDO', 'CONCLUIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "razaoSocial" VARCHAR(200),
    "cnpj" VARCHAR(18),
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "plano" "TenantPlan" NOT NULL DEFAULT 'ESSENCIAL',
    "trialExpiraEm" TIMESTAMP(3),
    "limiteUsuarios" INTEGER NOT NULL DEFAULT 5,
    "limitePessoas" INTEGER NOT NULL DEFAULT 2000,
    "limiteStorageMb" INTEGER NOT NULL DEFAULT 512,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "excluidoEm" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_domains" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDENTE',
    "tokenVerificacao" VARCHAR(64) NOT NULL,
    "verificadoEm" TIMESTAMP(3),
    "ultimoErro" VARCHAR(500),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "emailVerificadoEm" TIMESTAMP(3),
    "nome" VARCHAR(160) NOT NULL,
    "telefone" VARCHAR(20),
    "senhaHash" VARCHAR(255) NOT NULL,
    "senhaAtualizadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "plataformaAdmin" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "tentativasFalhas" INTEGER NOT NULL DEFAULT 0,
    "bloqueadoAte" TIMESTAMP(3),
    "ultimoLoginEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "papel" "Papel" NOT NULL DEFAULT 'MEMBRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "celulaId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantAtivoId" TEXT,
    "impersonadoPor" TEXT,
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoUsoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "revogadaEm" TIMESTAMP(3),

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tokens_senha" (
    "id" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tokens_senha_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "chave" VARCHAR(160) NOT NULL,
    "contador" INTEGER NOT NULL DEFAULT 0,
    "janelaFim" TIMESTAMP(3) NOT NULL,
    "bloqueadoAte" TIMESTAMP(3),

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("chave")
);

-- CreateTable
CREATE TABLE "platform_audit_logs" (
    "id" TEXT NOT NULL,
    "atorUserId" VARCHAR(30),
    "atorEmail" VARCHAR(254),
    "acao" VARCHAR(80) NOT NULL,
    "alvoTipo" VARCHAR(60),
    "alvoId" VARCHAR(60),
    "detalhes" JSONB,
    "ipHash" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254),
    "telefone" VARCHAR(20),
    "dataNascimento" DATE,
    "genero" "Genero" NOT NULL DEFAULT 'NAO_INFORMADO',
    "estadoCivil" "EstadoCivil" NOT NULL DEFAULT 'NAO_INFORMADO',
    "status" "StatusPessoa" NOT NULL DEFAULT 'VISITANTE',
    "origem" "OrigemCadastro" NOT NULL DEFAULT 'SITE',
    "cep" VARCHAR(9),
    "logradouro" VARCHAR(200),
    "numero" VARCHAR(20),
    "complemento" VARCHAR(100),
    "bairro" VARCHAR(100),
    "cidade" VARCHAR(100),
    "uf" VARCHAR(2),
    "dataConversao" DATE,
    "batizado" BOOLEAN NOT NULL DEFAULT false,
    "dataBatismo" DATE,
    "igrejaAnterior" VARCHAR(160),
    "celulaId" TEXT,
    "campusId" TEXT,
    "userId" TEXT,
    "observacoesPastorais" TEXT,
    "consentimentoLgpd" BOOLEAN NOT NULL DEFAULT false,
    "consentimentoEm" TIMESTAMP(3),
    "consentimentoOrigem" VARCHAR(60),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "excluidoEm" TIMESTAMP(3),

    CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "descricao" TEXT NOT NULL,
    "autorId" VARCHAR(30),
    "autorNome" VARCHAR(160),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoSubmissao" NOT NULL,
    "status" "StatusSubmissao" NOT NULL DEFAULT 'NOVO',
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254),
    "telefone" VARCHAR(20),
    "dados" JSONB NOT NULL,
    "origem" "OrigemCadastro" NOT NULL DEFAULT 'SITE',
    "paginaOrigem" VARCHAR(200),
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "scoreSpam" INTEGER NOT NULL DEFAULT 0,
    "responsavelId" VARCHAR(30),
    "notaInterna" TEXT,
    "processadoEm" TIMESTAMP(3),
    "pessoaGeradaId" VARCHAR(30),
    "consentimentoLgpd" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_batismo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254),
    "telefone" VARCHAR(20),
    "dataNascimento" DATE,
    "status" "StatusBatismo" NOT NULL DEFAULT 'SOLICITADO',
    "respostas" JSONB,
    "menorIdade" BOOLEAN NOT NULL DEFAULT false,
    "responsavelNome" VARCHAR(160),
    "responsavelTelefone" VARCHAR(20),
    "autorizacaoResponsavel" BOOLEAN NOT NULL DEFAULT false,
    "turmaPreparatoria" VARCHAR(120),
    "dataBatismo" TIMESTAMP(3),
    "campusId" TEXT,
    "observacoes" TEXT,
    "motivoRecusa" VARCHAR(500),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitacoes_batismo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_oracao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "nomeSolicitante" VARCHAR(160),
    "emailContato" VARCHAR(254),
    "telefoneContato" VARCHAR(20),
    "anonimo" BOOLEAN NOT NULL DEFAULT false,
    "categoria" VARCHAR(40) NOT NULL DEFAULT 'GERAL',
    "titulo" VARCHAR(160),
    "pedido" TEXT NOT NULL,
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "visibilidade" "VisibilidadeOracao" NOT NULL DEFAULT 'PRIVADO',
    "status" "StatusOracao" NOT NULL DEFAULT 'RECEBIDO',
    "contadorOracoes" INTEGER NOT NULL DEFAULT 0,
    "respostaTestemunho" TEXT,
    "respondidoEm" TIMESTAMP(3),
    "responsavelId" VARCHAR(30),
    "origem" "OrigemCadastro" NOT NULL DEFAULT 'SITE',
    "ipHash" VARCHAR(64),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_oracao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campi" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" VARCHAR(255),
    "cep" VARCHAR(9),
    "logradouro" VARCHAR(200),
    "numero" VARCHAR(20),
    "complemento" VARCHAR(100),
    "bairro" VARCHAR(100),
    "cidade" VARCHAR(100),
    "uf" VARCHAR(2),
    "mapaEmbedUrl" VARCHAR(500),
    "telefone" VARCHAR(20),
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celulas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "nome" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "diaSemana" SMALLINT,
    "horario" VARCHAR(5),
    "liderNome" VARCHAR(160),
    "liderTelefone" VARCHAR(20),
    "bairro" VARCHAR(100),
    "cidade" VARCHAR(100),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "capacidade" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encontros_celula" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "celulaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "presentes" INTEGER NOT NULL DEFAULT 0,
    "visitantes" INTEGER NOT NULL DEFAULT 0,
    "decisoes" INTEGER NOT NULL DEFAULT 0,
    "ofertaCentavos" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "registradoPorId" VARCHAR(30),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encontros_celula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_itens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campusId" TEXT,
    "tipo" "TipoAgenda" NOT NULL DEFAULT 'CULTO',
    "titulo" VARCHAR(160) NOT NULL,
    "descricao" TEXT,
    "diaSemana" SMALLINT,
    "horario" VARCHAR(5),
    "dataHora" TIMESTAMP(3),
    "recorrente" BOOLEAN NOT NULL DEFAULT true,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "publicoSite" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cursos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "descricao" TEXT,
    "resumo" VARCHAR(400),
    "diaSemana" SMALLINT,
    "horario" VARCHAR(5),
    "precoCentavos" INTEGER,
    "periodicidade" VARCHAR(20),
    "vagas" INTEGER,
    "inscricoesAbertas" BOOLEAN NOT NULL DEFAULT true,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matriculas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cursoId" TEXT NOT NULL,
    "pessoaId" TEXT,
    "nome" VARCHAR(160) NOT NULL,
    "email" VARCHAR(254),
    "telefone" VARCHAR(20),
    "status" "StatusMatricula" NOT NULL DEFAULT 'INSCRITO',
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matriculas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "descricao" TEXT,
    "preletor" VARCHAR(160),
    "serie" VARCHAR(120),
    "youtubeVideoId" VARCHAR(20),
    "duracaoSegundos" INTEGER,
    "data" DATE,
    "capaArquivoId" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "destaque" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nomeExibicao" VARCHAR(120) NOT NULL,
    "tagline" VARCHAR(200),
    "descricaoSeo" VARCHAR(300),
    "logoClaroId" TEXT,
    "logoEscuroId" TEXT,
    "faviconId" TEXT,
    "ogImageId" TEXT,
    "corAcento" VARCHAR(9) NOT NULL DEFAULT '#C2A15C',
    "corAcentoClara" VARCHAR(9) NOT NULL DEFAULT '#DCC08A',
    "corTinta" VARCHAR(9) NOT NULL DEFAULT '#0B0D11',
    "corPapel" VARCHAR(9) NOT NULL DEFAULT '#FBF8F1',
    "fonteTitulo" VARCHAR(60) NOT NULL DEFAULT 'Fraunces',
    "fonteTexto" VARCHAR(60) NOT NULL DEFAULT 'Instrument Sans',
    "heroTitulo" VARCHAR(200),
    "heroSubtitulo" VARCHAR(400),
    "heroEyebrow" VARCHAR(80),
    "heroImagemId" TEXT,
    "heroVideoUrl" VARCHAR(500),
    "heroCtaTexto" VARCHAR(60),
    "heroCtaLink" VARCHAR(200),
    "emailContato" VARCHAR(254),
    "telefoneContato" VARCHAR(20),
    "whatsapp" VARCHAR(20),
    "instagram" VARCHAR(200),
    "facebook" VARCHAR(200),
    "youtube" VARCHAR(200),
    "spotify" VARCHAR(200),
    "pixChave" VARCHAR(200),
    "pixTitular" VARCHAR(160),
    "pixDescricao" TEXT,
    "dadosBancariosCriptografados" TEXT,
    "pwaNome" VARCHAR(60),
    "pwaNomeCurto" VARCHAR(20),
    "pwaIconeId" TEXT,
    "pwaCorTema" VARCHAR(9) NOT NULL DEFAULT '#0B0D11',
    "modulos" JSONB NOT NULL DEFAULT '{}',
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_paginas" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "seoTitulo" VARCHAR(200),
    "seoDescricao" VARCHAR(300),
    "blocos" JSONB NOT NULL DEFAULT '[]',
    "publicada" BOOLEAN NOT NULL DEFAULT false,
    "ordemMenu" INTEGER,
    "mostrarMenu" BOOLEAN NOT NULL DEFAULT true,
    "sistema" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_paginas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "youtubeChannelId" VARCHAR(40),
    "youtubeVideoIdManual" VARCHAR(20),
    "modo" VARCHAR(10) NOT NULL DEFAULT 'AUTO',
    "forcarAoVivo" BOOLEAN NOT NULL DEFAULT false,
    "janelas" JSONB NOT NULL DEFAULT '[]',
    "fusoHorario" VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    "mensagemAoVivo" VARCHAR(120),
    "exibirNoSite" BOOLEAN NOT NULL DEFAULT true,
    "exibirNoApp" BOOLEAN NOT NULL DEFAULT true,
    "ultimoCheckEm" TIMESTAMP(3),
    "ultimoCheckAoVivo" BOOLEAN NOT NULL DEFAULT false,
    "ultimoVideoId" VARCHAR(20),
    "ultimoTitulo" VARCHAR(200),
    "falhasConsecutivas" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arquivos" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nomeOriginal" VARCHAR(255) NOT NULL,
    "nomeArmazenado" VARCHAR(80) NOT NULL,
    "caminho" VARCHAR(400) NOT NULL,
    "mimeType" VARCHAR(100) NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "largura" INTEGER,
    "altura" INTEGER,
    "publico" BOOLEAN NOT NULL DEFAULT false,
    "enviadoPorId" VARCHAR(30),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "arquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "atorUserId" VARCHAR(30),
    "atorNome" VARCHAR(160),
    "atorPapel" VARCHAR(20),
    "impersonadoPor" VARCHAR(254),
    "acao" VARCHAR(80) NOT NULL,
    "alvoTipo" VARCHAR(60),
    "alvoId" VARCHAR(60),
    "detalhes" JSONB,
    "ipHash" VARCHAR(64),
    "userAgent" VARCHAR(255),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" VARCHAR(160) NOT NULL,
    "corpo" TEXT NOT NULL,
    "link" VARCHAR(300),
    "destinatarioUserId" VARCHAR(30),
    "lidaEm" TIMESTAMP(3),
    "agendadaPara" TIMESTAMP(3),
    "enviadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_hostname_key" ON "tenant_domains"("hostname");

-- CreateIndex
CREATE INDEX "tenant_domains_tenantId_principal_idx" ON "tenant_domains"("tenantId", "principal");

-- CreateIndex
CREATE INDEX "tenant_domains_status_idx" ON "tenant_domains"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_plataformaAdmin_idx" ON "users"("plataformaAdmin");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE INDEX "memberships_tenantId_papel_idx" ON "memberships"("tenantId", "papel");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_userId_key" ON "memberships"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_tokenHash_key" ON "sessoes"("tokenHash");

-- CreateIndex
CREATE INDEX "sessoes_userId_revogadaEm_idx" ON "sessoes"("userId", "revogadaEm");

-- CreateIndex
CREATE INDEX "sessoes_expiraEm_idx" ON "sessoes"("expiraEm");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_senha_tokenHash_key" ON "tokens_senha"("tokenHash");

-- CreateIndex
CREATE INDEX "tokens_senha_userId_idx" ON "tokens_senha"("userId");

-- CreateIndex
CREATE INDEX "tokens_senha_expiraEm_idx" ON "tokens_senha"("expiraEm");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_janelaFim_idx" ON "rate_limit_buckets"("janelaFim");

-- CreateIndex
CREATE INDEX "platform_audit_logs_criadoEm_idx" ON "platform_audit_logs"("criadoEm");

-- CreateIndex
CREATE INDEX "platform_audit_logs_atorUserId_criadoEm_idx" ON "platform_audit_logs"("atorUserId", "criadoEm");

-- CreateIndex
CREATE INDEX "pessoas_tenantId_status_criadoEm_idx" ON "pessoas"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "pessoas_tenantId_nome_idx" ON "pessoas"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "pessoas_tenantId_celulaId_idx" ON "pessoas"("tenantId", "celulaId");

-- CreateIndex
CREATE INDEX "pessoas_tenantId_email_idx" ON "pessoas"("tenantId", "email");

-- CreateIndex
CREATE INDEX "pessoas_tenantId_excluidoEm_idx" ON "pessoas"("tenantId", "excluidoEm");

-- CreateIndex
CREATE INDEX "interacoes_tenantId_pessoaId_criadoEm_idx" ON "interacoes"("tenantId", "pessoaId", "criadoEm");

-- CreateIndex
CREATE INDEX "submissoes_tenantId_status_criadoEm_idx" ON "submissoes"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "submissoes_tenantId_tipo_status_idx" ON "submissoes"("tenantId", "tipo", "status");

-- CreateIndex
CREATE INDEX "submissoes_tenantId_criadoEm_idx" ON "submissoes"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "solicitacoes_batismo_tenantId_status_criadoEm_idx" ON "solicitacoes_batismo"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "solicitacoes_batismo_tenantId_dataBatismo_idx" ON "solicitacoes_batismo"("tenantId", "dataBatismo");

-- CreateIndex
CREATE INDEX "pedidos_oracao_tenantId_status_criadoEm_idx" ON "pedidos_oracao"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "pedidos_oracao_tenantId_visibilidade_status_idx" ON "pedidos_oracao"("tenantId", "visibilidade", "status");

-- CreateIndex
CREATE INDEX "pedidos_oracao_tenantId_urgente_status_idx" ON "pedidos_oracao"("tenantId", "urgente", "status");

-- CreateIndex
CREATE INDEX "campi_tenantId_ativo_ordem_idx" ON "campi"("tenantId", "ativo", "ordem");

-- CreateIndex
CREATE INDEX "celulas_tenantId_ativa_idx" ON "celulas"("tenantId", "ativa");

-- CreateIndex
CREATE INDEX "celulas_tenantId_cidade_bairro_idx" ON "celulas"("tenantId", "cidade", "bairro");

-- CreateIndex
CREATE INDEX "encontros_celula_tenantId_data_idx" ON "encontros_celula"("tenantId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "encontros_celula_celulaId_data_key" ON "encontros_celula"("celulaId", "data");

-- CreateIndex
CREATE INDEX "agenda_itens_tenantId_ativo_ordem_idx" ON "agenda_itens"("tenantId", "ativo", "ordem");

-- CreateIndex
CREATE INDEX "agenda_itens_tenantId_dataHora_idx" ON "agenda_itens"("tenantId", "dataHora");

-- CreateIndex
CREATE INDEX "cursos_tenantId_ativo_ordem_idx" ON "cursos"("tenantId", "ativo", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "cursos_tenantId_slug_key" ON "cursos"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "matriculas_tenantId_cursoId_status_idx" ON "matriculas"("tenantId", "cursoId", "status");

-- CreateIndex
CREATE INDEX "matriculas_tenantId_criadoEm_idx" ON "matriculas"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "mensagens_tenantId_publicado_data_idx" ON "mensagens"("tenantId", "publicado", "data");

-- CreateIndex
CREATE UNIQUE INDEX "mensagens_tenantId_slug_key" ON "mensagens"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "site_configs_tenantId_key" ON "site_configs"("tenantId");

-- CreateIndex
CREATE INDEX "site_paginas_tenantId_publicada_ordemMenu_idx" ON "site_paginas"("tenantId", "publicada", "ordemMenu");

-- CreateIndex
CREATE UNIQUE INDEX "site_paginas_tenantId_slug_key" ON "site_paginas"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "live_configs_tenantId_key" ON "live_configs"("tenantId");

-- CreateIndex
CREATE INDEX "arquivos_tenantId_criadoEm_idx" ON "arquivos"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "arquivos_tenantId_sha256_idx" ON "arquivos"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_criadoEm_idx" ON "audit_logs"("tenantId", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_acao_criadoEm_idx" ON "audit_logs"("tenantId", "acao", "criadoEm");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_atorUserId_criadoEm_idx" ON "audit_logs"("tenantId", "atorUserId", "criadoEm");

-- CreateIndex
CREATE INDEX "notificacoes_tenantId_destinatarioUserId_lidaEm_idx" ON "notificacoes"("tenantId", "destinatarioUserId", "lidaEm");

-- CreateIndex
CREATE INDEX "notificacoes_tenantId_criadoEm_idx" ON "notificacoes"("tenantId", "criadoEm");

-- AddForeignKey
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_celulaId_fkey" FOREIGN KEY ("celulaId") REFERENCES "celulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tokens_senha" ADD CONSTRAINT "tokens_senha_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_celulaId_fkey" FOREIGN KEY ("celulaId") REFERENCES "celulas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissoes" ADD CONSTRAINT "submissoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_batismo" ADD CONSTRAINT "solicitacoes_batismo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_batismo" ADD CONSTRAINT "solicitacoes_batismo_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_batismo" ADD CONSTRAINT "solicitacoes_batismo_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_oracao" ADD CONSTRAINT "pedidos_oracao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_oracao" ADD CONSTRAINT "pedidos_oracao_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campi" ADD CONSTRAINT "campi_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celulas" ADD CONSTRAINT "celulas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "celulas" ADD CONSTRAINT "celulas_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encontros_celula" ADD CONSTRAINT "encontros_celula_celulaId_fkey" FOREIGN KEY ("celulaId") REFERENCES "celulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_itens" ADD CONSTRAINT "agenda_itens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_itens" ADD CONSTRAINT "agenda_itens_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "campi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cursos" ADD CONSTRAINT "cursos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "cursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_capaArquivoId_fkey" FOREIGN KEY ("capaArquivoId") REFERENCES "arquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_configs" ADD CONSTRAINT "site_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_paginas" ADD CONSTRAINT "site_paginas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_configs" ADD CONSTRAINT "live_configs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

