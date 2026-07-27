-- =============================================================================
-- ROW-LEVEL SECURITY — segunda camada de isolamento entre igrejas
-- =============================================================================
--
-- LEIA prisma/RLS.md ANTES DE APLICAR ESTA MIGRAÇÃO EM PRODUÇÃO.
-- Aplicada com a "política de transição" ainda presente (ver seção 5), esta
-- migração é inofensiva. Removida a transição sem que a aplicação execute
-- `SET LOCAL app.tenant_id`, TODA query passa a devolver zero linhas e TODO
-- INSERT passa a ser recusado. É proposital — mas é um evento de deploy
-- coordenado, não um detalhe de migração.
--
-- -----------------------------------------------------------------------------
-- QUAL É O MODELO DE AMEAÇA (importa, porque define o que RLS resolve e o que não)
-- -----------------------------------------------------------------------------
-- RLS aqui NÃO existe para deter alguém que já consegue executar SQL arbitrário
-- como `discipular_app` — esse alguém simplesmente faz `SET app.tenant_id` para
-- o valor que quiser. RLS existe para deter a falha realista e frequente:
--
--     prisma.pessoa.findMany({ where: { status: 'MEMBRO' } })
--                                     -- ^ faltou o tenantId
--
-- Uma query dessas passa em code review, passa em teste (em dev só existe um
-- tenant) e vaza a base de membros de 30 igrejas. Com RLS ligada ela devolve
-- zero linhas: o bug vira um ticket de "sumiu a lista", não um incidente de
-- vazamento. É essa a troca que estamos comprando.
--
-- A camada nº 1 continua sendo src/lib/db/tenant-client.ts. Ela é mais precisa
-- (sabe o modelo, dá erro explícito) mas falha se alguém importar `prisma`
-- direto. RLS é mais burra e mais abrangente: pega qualquer caminho, inclusive
-- $queryRaw. As duas se cobrem mutuamente — nenhuma substitui a outra.
--
-- -----------------------------------------------------------------------------
-- (a) POR QUE `FORCE ROW LEVEL SECURITY` E NÃO SÓ `ENABLE`
-- -----------------------------------------------------------------------------
-- `ENABLE` liga as políticas para todo mundo EXCETO o dono da tabela. O dono
-- passa direto, sem erro, sem aviso, sem entrada em log. Ou seja: se um dia
-- alguém apontar a DATABASE_URL para `discipular_migrator` (o dono) ou para
-- `postgres` — o que acontece em migração manual, em script de importação, em
-- ambiente de homologação montado às pressas — o isolamento desaparece
-- silenciosamente e nada quebra para avisar. `FORCE` faz o dono também ficar
-- sujeito às políticas. Um controle de segurança que falha em silêncio é pior
-- que nenhum, porque produz confiança injustificada.
--
-- Ressalva honesta: `FORCE` ainda NÃO alcança superusuários nem papéis com o
-- atributo BYPASSRLS. Não existe forma de alcançá-los — daí o item (b).
--
-- Consequência operacional: como o dono também fica sujeito, migrações futuras
-- que precisem varrer dados de todos os tenants (backfill, correção de dados)
-- precisam de um dos dois caminhos, e ambos devem constar do PR:
--   1. iterar tenant a tenant com `SET LOCAL app.tenant_id = '<id>'`; ou
--   2. `ALTER TABLE x NO FORCE ROW LEVEL SECURITY;` ... `ALTER TABLE x FORCE ...;`
--      dentro da MESMA transação da migração.
--
-- -----------------------------------------------------------------------------
-- (b) POR QUE A APLICAÇÃO NÃO PODE CONECTAR COMO SUPERUSUÁRIO NEM COMO DONO
-- -----------------------------------------------------------------------------
-- Superusuário e papéis BYPASSRLS ignoram RLS por completo, `FORCE` ou não.
-- Conectar a aplicação assim reduz toda esta migração a decoração.
--
-- O dono das tabelas é quase tão ruim: mesmo com `FORCE` respeitando as
-- políticas nas leituras/escritas, o dono tem DDL. Uma única injeção de SQL
-- num caminho que use `$queryRawUnsafe` permite `ALTER TABLE pessoas DISABLE
-- ROW LEVEL SECURITY` ou `DROP POLICY isolamento_tenant ON pessoas` — e aí o
-- atacante desliga a defesa antes de usá-la. Separar os papéis transforma
-- "desligar o RLS" num privilégio que o processo web simplesmente não tem.
--
-- Portanto, exatamente três papéis:
--   discipular_migrator  dono das tabelas, tem DDL, usado SÓ por
--                        `prisma migrate deploy` (DIRECT_DATABASE_URL)
--   discipular_app       runtime web. NOSUPERUSER NOBYPASSRLS NOCREATEDB
--                        NOCREATEROLE, sem DDL, sem ownership (DATABASE_URL)
--   discipular_backup    somente leitura para pg_dump (opcional; precisa de
--                        BYPASSRLS ou o dump sai vazio — ver prisma/RLS.md)
--
-- -----------------------------------------------------------------------------
-- (c) O QUE FAZ O SEGUNDO ARGUMENTO `true` EM current_setting()
-- -----------------------------------------------------------------------------
-- `current_setting('app.tenant_id')` com um argumento LANÇA
-- `ERROR: unrecognized configuration parameter "app.tenant_id"` quando o
-- parâmetro nunca foi definido naquela sessão. Como a política é avaliada em
-- toda linha de toda query, isso transformaria "esqueci de setar o tenant" em
-- uma exceção de banco no meio da requisição — que sobe pelo Prisma como erro
-- genérico, entra no log e é indistinguível de um banco fora do ar.
--
-- O segundo argumento (`missing_ok`) faz a função devolver NULL em vez de
-- lançar. Trocamos uma exceção barulhenta e ambígua por um NULL, que é o
-- ingrediente do item (d).
--
-- -----------------------------------------------------------------------------
-- (d) O QUE ACONTECE QUANDO app.tenant_id NÃO ESTÁ DEFINIDO — FALHA FECHADA
-- -----------------------------------------------------------------------------
-- Com `missing_ok`, `current_setting(...)` devolve NULL. A expressão vira
-- `"tenantId" = NULL`, que em SQL de três valores resulta em NULL — e NULL não
-- é TRUE. Consequências:
--   USING      -> nenhuma linha é visível: SELECT devolve 0 linhas,
--                 UPDATE/DELETE atingem 0 linhas
--   WITH CHECK -> nenhuma linha pode ser gravada: INSERT e UPDATE são
--                 recusados com "new row violates row-level security policy"
--
-- Isto é falha FECHADA por construção: o estado padrão de uma conexão que
-- ninguém configurou é "não enxerga nada". O oposto — política que libera tudo
-- quando o parâmetro está ausente — parece conveniente e é exatamente como se
-- constrói um vazamento: basta um caminho de código esquecer o `SET LOCAL`.
--
-- DETALHE VERIFICADO NA PRÁTICA (PostgreSQL 16), porque contraria a intuição:
-- depois que uma sessão executa `set_config('app.tenant_id', ..., true)` pela
-- primeira vez, o parâmetro passa a EXISTIR nela. Ao final da transação ele não
-- volta a ser indefinido — volta para string VAZIA. Ou seja, a partir da
-- segunda transação `current_setting('app.tenant_id', true)` devolve `''`, e
-- não NULL.
-- Isso não muda o resultado: `"tenantId" = ''` é FALSE para todo tenant real
-- (cuid nunca é vazio), então a falha continua fechada. Mas quem escrever a
-- política como `... IS NULL OR ...` achando que está tratando o caso "sem
-- escopo" vai proteger só a primeira transação de cada conexão do pool — e o
-- teste manual, que roda uma transação só, vai passar.
--
-- Não há valor "coringa". Não crie um.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- NOTA SOBRE NOMES DE COLUNA
-- O schema.prisma não usa @map nos campos, então as colunas no Postgres são
-- camelCase e PRECISAM de aspas duplas: "tenantId", e não tenant_id. Escrever
-- tenant_id aqui daria `ERROR: column "tenant_id" does not exist` — o que ao
-- menos falha alto. Escrever sem aspas (tenantId) seria pior: o Postgres
-- dobraria para minúsculas e o erro falaria de uma coluna "tenantid".
-- -----------------------------------------------------------------------------


-- =============================================================================
-- 1. VERIFICAÇÃO DE PRÉ-REQUISITOS
-- =============================================================================
-- Falhar aqui, cedo e com mensagem clara, é melhor do que aplicar RLS pela
-- metade e descobrir a lacuna quando alguém ler dado alheio.

DO $$
DECLARE
  tabela        text;
  faltando      text[] := ARRAY[]::text[];
  sem_tenant_id text[] := ARRAY[]::text[];
  esperadas     text[] := ARRAY[
    'pessoas', 'interacoes', 'submissoes', 'solicitacoes_batismo',
    'pedidos_oracao', 'campi', 'celulas', 'encontros_celula',
    'agenda_itens', 'cursos', 'matriculas', 'mensagens',
    'site_configs', 'site_paginas', 'live_configs', 'arquivos',
    'audit_logs', 'notificacoes'
  ];
BEGIN
  FOREACH tabela IN ARRAY esperadas LOOP
    IF to_regclass('public.' || quote_ident(tabela)) IS NULL THEN
      faltando := faltando || tabela;
    ELSIF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tabela AND column_name = 'tenantId'
    ) THEN
      sem_tenant_id := sem_tenant_id || tabela;
    END IF;
  END LOOP;

  IF array_length(faltando, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'RLS: tabelas ausentes: %. Esta migração precisa rodar DEPOIS da migração inicial que cria o schema.',
      array_to_string(faltando, ', ');
  END IF;

  IF array_length(sem_tenant_id, 1) IS NOT NULL THEN
    RAISE EXCEPTION
      'RLS: tabelas sem coluna "tenantId": %. Ou o schema mudou, ou a tabela não deveria estar nesta lista.',
      array_to_string(sem_tenant_id, ', ');
  END IF;
END $$;


-- =============================================================================
-- 2. ENABLE + FORCE + POLÍTICA DE ISOLAMENTO, TABELA A TABELA
-- =============================================================================
-- Escrito de forma explícita e repetitiva (em vez de um laço) de propósito:
-- este é o arquivo que um auditor vai ler linha a linha, e ele precisa
-- conseguir dar `grep pessoas` e ver as três linhas que protegem `pessoas`.
--
-- `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY` deixa a migração
-- idempotente — dá para reaplicar em um banco parcialmente migrado sem erro.
--
-- A política é `FOR ALL`: cobre SELECT, INSERT, UPDATE e DELETE. `USING`
-- decide o que a linha EXISTENTE deixa ver/alterar; `WITH CHECK` decide o que
-- a linha RESULTANTE pode conter. Sem `WITH CHECK`, um UPDATE poderia mover a
-- linha para outro tenant ("UPDATE pessoas SET tenantId = <outro>") — o mesmo
-- vazamento, ao contrário.
--
-- Não há CAST na comparação: "tenantId" é text (cuid) e current_setting()
-- devolve text. Um cast dos dois lados impediria o uso dos índices que
-- começam por "tenantId", que são exatamente os índices de todo o sistema.

-- --- pessoas ------------------------------------------------------------------
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.pessoas;
CREATE POLICY isolamento_tenant ON public.pessoas
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- interacoes ---------------------------------------------------------------
ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interacoes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.interacoes;
CREATE POLICY isolamento_tenant ON public.interacoes
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- submissoes ---------------------------------------------------------------
ALTER TABLE public.submissoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissoes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.submissoes;
CREATE POLICY isolamento_tenant ON public.submissoes
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- solicitacoes_batismo -----------------------------------------------------
ALTER TABLE public.solicitacoes_batismo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitacoes_batismo FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.solicitacoes_batismo;
CREATE POLICY isolamento_tenant ON public.solicitacoes_batismo
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- pedidos_oracao -----------------------------------------------------------
-- A tabela mais sensível do sistema (saúde, luto, crise familiar). Se houvesse
-- uma única tabela para blindar, seria esta.
ALTER TABLE public.pedidos_oracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_oracao FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.pedidos_oracao;
CREATE POLICY isolamento_tenant ON public.pedidos_oracao
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- campi --------------------------------------------------------------------
ALTER TABLE public.campi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campi FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.campi;
CREATE POLICY isolamento_tenant ON public.campi
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- celulas ------------------------------------------------------------------
ALTER TABLE public.celulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.celulas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.celulas;
CREATE POLICY isolamento_tenant ON public.celulas
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- encontros_celula ---------------------------------------------------------
ALTER TABLE public.encontros_celula ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encontros_celula FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.encontros_celula;
CREATE POLICY isolamento_tenant ON public.encontros_celula
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- agenda_itens -------------------------------------------------------------
ALTER TABLE public.agenda_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_itens FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.agenda_itens;
CREATE POLICY isolamento_tenant ON public.agenda_itens
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- cursos -------------------------------------------------------------------
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.cursos;
CREATE POLICY isolamento_tenant ON public.cursos
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- matriculas ---------------------------------------------------------------
ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.matriculas;
CREATE POLICY isolamento_tenant ON public.matriculas
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- mensagens ----------------------------------------------------------------
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.mensagens;
CREATE POLICY isolamento_tenant ON public.mensagens
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- site_configs -------------------------------------------------------------
ALTER TABLE public.site_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_configs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.site_configs;
CREATE POLICY isolamento_tenant ON public.site_configs
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- site_paginas -------------------------------------------------------------
ALTER TABLE public.site_paginas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_paginas FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.site_paginas;
CREATE POLICY isolamento_tenant ON public.site_paginas
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- live_configs -------------------------------------------------------------
ALTER TABLE public.live_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.live_configs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.live_configs;
CREATE POLICY isolamento_tenant ON public.live_configs
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- arquivos -----------------------------------------------------------------
-- Vazar uma linha daqui é pior que vazar texto: `caminho` é a chave usada pela
-- rota /api/arquivos para servir o binário do disco.
ALTER TABLE public.arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arquivos FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.arquivos;
CREATE POLICY isolamento_tenant ON public.arquivos
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- audit_logs ---------------------------------------------------------------
-- A auditoria de uma igreja descreve quem mexeu em quê. É o mapa do sistema
-- para quem já entrou — e por isso é alvo, não só registro.
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.audit_logs;
CREATE POLICY isolamento_tenant ON public.audit_logs
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

-- --- notificacoes -------------------------------------------------------------
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS isolamento_tenant ON public.notificacoes;
CREATE POLICY isolamento_tenant ON public.notificacoes
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));


-- =============================================================================
-- 3. TABELAS GLOBAIS — POR QUE NÃO TÊM RLS
-- =============================================================================
-- Ficam de fora: tenants, tenant_domains, users, memberships, sessoes,
-- tokens_senha, rate_limit_buckets e platform_audit_logs.
--
-- ATENÇÃO — DUAS DELAS TÊM COLUNA "tenantId" E MESMO ASSIM NÃO ENTRAM:
--   tenant_domains."tenantId"  e  memberships."tenantId"
-- Ou seja, "tem tenantId" NÃO é critério suficiente para decidir o que
-- proteger. Qualquer verificação automática que use só a presença da coluna vai
-- acusar estas duas como falha — inclua a exceção explicitamente (a consulta da
-- seção 7 do prisma/RLS.md já faz isso).
--
-- O motivo de elas ficarem fora é de ordem cronológica, não de sensibilidade:
-- as duas são consultadas ANTES de existir um tenant resolvido.
--   - `tenant_domains` é como o middleware DESCOBRE o tenant a partir do
--     hostname. Protegê-la por `app.tenant_id` seria circular: para saber o
--     tenant, é preciso ler a tabela; para ler a tabela, é preciso saber o
--     tenant. Nenhuma requisição entraria no sistema.
--   - `memberships` é lida no login, quando a sessão ainda não escolheu igreja,
--     justamente para descobrir de quais igrejas o usuário participa.
--
-- As demais são globais por natureza: um usuário pode pastorear duas igrejas,
-- um hostname precisa ser único no planeta, e o rate limit enxerga o IP antes
-- de saber de que igreja ele é.
--
-- Consequência aceita conscientemente: `users` e `memberships` são legíveis por
-- qualquer sessão da aplicação. A proteção delas é RBAC na camada de aplicação
-- (src/lib/auth/rbac.ts), não o banco. Elas não guardam dado pastoral — nome,
-- e-mail, hash de senha e papel —, então o dano de um vazamento é ordens de
-- grandeza menor que o de `pessoas` ou `pedidos_oracao`. Ainda assim, é dívida
-- consciente e está registrada como tal.


-- =============================================================================
-- 4. GRANTS PARA discipular_app
-- =============================================================================
-- Princípio: o papel de runtime recebe DML e nada mais. Sem CREATE, sem ALTER,
-- sem DROP, sem TRUNCATE (TRUNCATE ignora políticas de RLS por linha e é uma
-- forma barata de destruir dados de todas as igrejas de uma vez).
--
-- Os GRANTs rodam dentro de um bloco condicional porque o papel é criado fora
-- do controle de versão (com senha, pelo DBA). Em uma máquina de dev onde ele
-- não existe, queremos um WARNING e a migração seguindo — e não um deploy
-- travado. O RLS da seção 2 já foi aplicado de qualquer forma.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'discipular_app') THEN
    RAISE WARNING
      'Papel "discipular_app" não existe: GRANTs ignorados. Crie-o conforme prisma/RLS.md e reaplique esta seção.';
    RETURN;
  END IF;

  -- Conectar e enxergar o schema. Sem CREATE: o app não cria objeto nenhum.
  EXECUTE 'GRANT CONNECT ON DATABASE ' || quote_ident(current_database()) || ' TO discipular_app';
  EXECUTE 'GRANT USAGE ON SCHEMA public TO discipular_app';
  EXECUTE 'REVOKE CREATE ON SCHEMA public FROM discipular_app';

  -- DML em todas as tabelas existentes. TRUNCATE e REFERENCES ficam de fora
  -- de propósito (REFERENCES permitiria criar FK que revelam existência de
  -- linhas de outros tenants por violação de chave).
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO discipular_app';

  -- Tabelas criadas por MIGRAÇÕES FUTURAS herdam o mesmo grant automaticamente.
  -- Sem isto, toda migração nova exigiria um GRANT manual — e a que esquecesse
  -- só quebraria em produção, no primeiro acesso à tabela nova.
  --
  -- `FOR ROLE` precisa nomear quem CRIA as tabelas (o migrator). Em ambiente de
  -- desenvolvimento o dono costuma ser o próprio usuário da conexão, então
  -- aplicamos para os dois casos quando eles existem.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'discipular_migrator') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE discipular_migrator IN SCHEMA public '
         || 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO discipular_app';
  ELSE
    RAISE WARNING
      'Papel "discipular_migrator" não existe: as tabelas de migrações FUTURAS não herdarão GRANT automático. Ver prisma/RLS.md, Fase 0.';
  END IF;

  IF current_user <> 'discipular_migrator' THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE ' || quote_ident(current_user)
         || ' IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO discipular_app';
  END IF;

  -- Nenhum GRANT em SEQUENCES: todos os IDs do schema são cuid gerados na
  -- aplicação. Se um dia entrar um autoincrement, este comentário vira o
  -- lembrete de que falta um GRANT USAGE ON SEQUENCE.

  -- O histórico de migrações do Prisma é do migrator. O runtime não precisa
  -- lê-lo e definitivamente não pode escrevê-lo — marcar uma migração como
  -- aplicada sem aplicá-la é uma forma silenciosa de sabotar o deploy.
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public._prisma_migrations FROM discipular_app';
  END IF;
END $$;


-- =============================================================================
-- 5. POLÍTICA DE TRANSIÇÃO — TEMPORÁRIA, COM DATA PARA MORRER
-- =============================================================================
-- POR QUE ELA EXISTE
-- A seção 2 sozinha derruba o sistema no instante em que for aplicada, porque
-- a aplicação ainda não executa `SET LOCAL app.tenant_id` (ver prisma/RLS.md,
-- "Fase 2"). As alternativas eram: (i) não versionar o RLS até a aplicação
-- estar pronta — e aí o SQL nunca é revisado nem testado; ou (ii) versionar
-- com um interruptor explícito. Escolhemos (ii).
--
-- COMO FUNCIONA
-- Políticas PERMISSIVE se somam com OR. Enquanto esta existir e o GUC
-- `app.rls_estrito` não estiver em 'on', tudo passa. Ligado o GUC, esta
-- política deixa de conceder qualquer coisa e sobra apenas `isolamento_tenant`.
--
-- COMO ATIVAR (uma linha, reversível, sem DDL):
--     ALTER DATABASE discipular SET app.rls_estrito = 'on';
--   e então reinicie o processo Node — `ALTER DATABASE ... SET` só vale para
--   conexões NOVAS, e o pool do Prisma segura as antigas indefinidamente.
--
-- COMO REVERTER, se algo quebrar às 20h de domingo:
--     ALTER DATABASE discipular SET app.rls_estrito = 'off';  -- + restart
--
-- HONESTIDADE SOBRE O QUE ISTO VALE
-- Enquanto o interruptor estiver desligado, o RLS não protege nada. E mesmo
-- ligado, `discipular_app` pode executar `SET app.rls_estrito = 'off'` na
-- própria sessão — o GUC é USERSET. Ou seja: isto NÃO resiste a execução de
-- SQL arbitrário. Resiste a query sem filtro, que é a ameaça real (ver topo do
-- arquivo). Quando a Fase 3 concluir, REMOVA esta seção com uma migração
-- `DROP POLICY transicao_pre_rls ON ...` em cada tabela; aí o interruptor
-- deixa de existir e a garantia deixa de depender de um GUC.

DO $$
DECLARE
  tabela    text;
  esperadas text[] := ARRAY[
    'pessoas', 'interacoes', 'submissoes', 'solicitacoes_batismo',
    'pedidos_oracao', 'campi', 'celulas', 'encontros_celula',
    'agenda_itens', 'cursos', 'matriculas', 'mensagens',
    'site_configs', 'site_paginas', 'live_configs', 'arquivos',
    'audit_logs', 'notificacoes'
  ];
BEGIN
  FOREACH tabela IN ARRAY esperadas LOOP
    EXECUTE format('DROP POLICY IF EXISTS transicao_pre_rls ON public.%I', tabela);
    EXECUTE format(
      'CREATE POLICY transicao_pre_rls ON public.%I '
      || 'FOR ALL '
      || 'USING      (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'') '
      || 'WITH CHECK (coalesce(current_setting(''app.rls_estrito'', true), ''off'') <> ''on'')',
      tabela
    );
  END LOOP;
END $$;

-- Deixa registrado no próprio banco em que estado o interruptor está.
--
-- VERIFICADO NO POSTGRESQL 16: desde a versão 15, definir um GUC customizado no
-- nível de banco (`ALTER DATABASE ... SET app.algo`) exige SUPERUSUÁRIO ou uma
-- concessão explícita. Rodando esta migração como `discipular_migrator`, o
-- comando abaixo falha com `permission denied to set parameter` — e isso é o
-- comportamento DESEJADO, não um defeito: o interruptor que ativa o isolamento
-- não deve estar ao alcance do papel que roda migrações automatizadas.
--
-- Logo, o WARNING abaixo é ESPERADO num deploy normal e não indica falha. O
-- modo transição continua valendo mesmo sem o ALTER DATABASE: `current_setting`
-- devolve NULL, o `coalesce` transforma em 'off' e a política libera.
--
-- Para tornar o parâmetro explícito, rode UMA VEZ como superusuário:
--     ALTER DATABASE discipular SET app.rls_estrito = 'off';
-- Ou delegue ao DBA sem conceder superusuário (também verificado no PG 16 —
-- funciona para GUC customizado):
--     GRANT SET ON PARAMETER "app.rls_estrito" TO <papel_do_dba>;
DO $$
BEGIN
  IF current_setting('app.rls_estrito', true) IS NULL THEN
    EXECUTE 'ALTER DATABASE ' || quote_ident(current_database()) || ' SET app.rls_estrito = ''off''';
    RAISE NOTICE 'RLS aplicada em modo TRANSIÇÃO (app.rls_estrito=off). Ver prisma/RLS.md para ativar.';
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING 'Sem privilégio para ALTER DATABASE SET app.rls_estrito (esperado fora de superusuário). O modo transição segue valendo por padrão; ver prisma/RLS.md, Fase 3.';
END $$;


-- =============================================================================
-- 6. COMO CONFERIR QUE FUNCIONOU
-- =============================================================================
-- Nenhuma destas verificações roda automaticamente — RLS é justamente o tipo de
-- controle que todo mundo assume estar ligado. Rode à mão depois do deploy:
--
--   -- 6.1 Toda tabela com tenantId está com RLS ligada E forçada?
--   SELECT relname, relrowsecurity, relforcerowsecurity
--     FROM pg_class
--    WHERE relnamespace = 'public'::regnamespace
--      AND relkind = 'r'
--      AND EXISTS (SELECT 1 FROM information_schema.columns c
--                   WHERE c.table_name = relname AND c.column_name = 'tenantId')
--    ORDER BY relrowsecurity, relname;     -- nenhuma linha pode ter false
--
--   -- 6.2 O papel do runtime é mesmo inofensivo?
--   SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
--     FROM pg_roles WHERE rolname = 'discipular_app';   -- tudo false
--
--   -- 6.3 O teste que realmente importa (como discipular_app, após ativar):
--   BEGIN;
--     SET LOCAL app.tenant_id = '<id-da-igreja-A>';
--     SELECT count(*) FROM pessoas;                  -- só a igreja A
--     SELECT count(*) FROM pessoas WHERE "tenantId" = '<id-da-igreja-B>';  -- 0
--     INSERT INTO pessoas ("id","tenantId","nome","atualizadoEm")
--       VALUES ('teste','<id-da-igreja-B>','x',now());  -- deve ser RECUSADO
--   ROLLBACK;
--
--   -- 6.4 O caso de falha fechada — conexão sem SET LOCAL:
--   SELECT count(*) FROM pessoas;   -- deve devolver 0, não a base inteira
-- =============================================================================
