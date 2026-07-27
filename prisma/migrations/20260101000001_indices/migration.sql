-- =============================================================================
-- ÍNDICES COMPLEMENTARES — desempenho para 30 igrejas / 90 usuários simultâneos
-- =============================================================================
--
-- O QUE ESTA MIGRAÇÃO NÃO É
-- Não é uma lista de "todo índice que pode ajudar". Todo índice é um custo fixo
-- em cada INSERT/UPDATE/DELETE da tabela, ocupa espaço em shared_buffers
-- (2 GB numa VPS de 8 GB) e dá mais trabalho ao autovacuum. Num sistema com
-- este porte, índice sobrando é mais provável de atrapalhar do que a falta de
-- um índice sobrando é de ajudar. Cada índice abaixo tem uma query real por
-- trás e uma justificativa de por que o índice que o schema.prisma já cria não
-- resolve. No fim do arquivo há a lista dos que foram CONSIDERADOS E RECUSADOS,
-- com o motivo — para que ninguém refaça a análise daqui a seis meses.
--
-- ORDEM DE GRANDEZA (para calibrar as decisões)
-- 30 igrejas × ~2.000 pessoas = ~60 mil linhas em `pessoas`. `audit_logs` e
-- `submissoes` crescem sem teto natural; o resto é pequeno. Isso significa que
-- quase nada aqui é sobre "a query é lenta hoje" — é sobre manter o p99 estável
-- quando uma igreja grande entrar, e sobre não deixar o autovacuum e o cache
-- serem consumidos por escaneamento de tabela em rota de tráfego anônimo.
--
-- NOMES DE COLUNA
-- O schema.prisma não usa @map nos campos, então as colunas são camelCase e
-- exigem aspas duplas: "tenantId", "criadoEm", "excluidoEm".
--
-- CONVENÇÃO DE NOME
-- Prefixo `idx_`, que o Prisma nunca gera (ele usa `<tabela>_<colunas>_idx`).
-- Isso evita colisão e deixa óbvio, em qualquer `\d pessoas`, o que veio do
-- schema e o que veio daqui.
--
-- DRIFT DO PRISMA — LEIA ANTES DE RODAR `prisma migrate dev`
-- Estes índices não existem no schema.prisma, então `prisma migrate dev` os
-- enxerga como drift e se oferece para dropá-los (ou para resetar o banco).
-- Regras: em produção use SEMPRE `prisma migrate deploy`, que só aplica
-- migrações pendentes e nunca compara com o schema. Em desenvolvimento, se
-- aceitar o reset, esta migração roda de novo no fim e reconstrói tudo — o que
-- é aceitável em dev e inaceitável em produção.
--
-- SEM `CONCURRENTLY`
-- `CREATE INDEX CONCURRENTLY` não pode rodar dentro de transação, e o Prisma
-- envolve cada migração em uma. Como esta migração roda com as tabelas vazias
-- ou pequenas, o bloqueio de escrita dura milissegundos. Se um dia for preciso
-- criar um índice num banco em produção já grande, faça FORA do Prisma:
--     psql -c 'CREATE INDEX CONCURRENTLY idx_... ON ...;'
-- e registre a migração correspondente com `prisma migrate resolve --applied`.
-- =============================================================================


-- =============================================================================
-- AVISO CRÍTICO — COM RLS ATIVA, METADE DESTES ÍNDICES DEIXA DE SER USADA
-- =============================================================================
-- Isto foi MEDIDO neste schema, num PostgreSQL 16, com 60 mil pessoas. Não é
-- teoria, e é a coisa mais importante deste arquivo.
--
-- O MECANISMO
-- Quando há política de RLS, as condições da política viram "security quals" e
-- precisam ser avaliadas ANTES das condições da consulta — senão a consulta do
-- usuário poderia observar linhas que a política esconderia (por mensagem de
-- erro, por tempo de execução). O Postgres abre exceção apenas para funções
-- marcadas LEAKPROOF, que ele sabe serem incapazes de vazar o valor.
--
-- O problema é quais funções NÃO são leakproof por padrão:
--     texteq   ("tenantId" = 'x')            LEAKPROOF  -> pode ir para o índice
--     lower    (lower(nome), lower(email))   não        -> vira Filter
--     enum_eq  (status = 'MEMBRO')           não        -> vira Filter
--     textlike (nome LIKE / ILIKE '%x%')     não        -> vira Filter
--
-- Ou seja: com RLS ligada, o planner só consegue usar como condição de índice a
-- comparação de "tenantId". Todo o resto é aplicado depois, sobre as linhas já
-- lidas. Ele então escolhe o índice ("tenantId","excluidoEm") que o
-- schema.prisma cria — e ignora os índices desta migração.
--
-- MEDIDO (custo estimado do plano, mesma consulta, mesmos dados):
--
--   Listagem do painel (tenant + status + ORDER BY criadoEm DESC LIMIT 25)
--     sem RLS : Index Scan em idx_pessoas_ativas_status ......... custo    3,28
--     com RLS : Bitmap Heap Scan + Sort ........................ custo 2.283,62
--                                                                (~700x pior)
--
--   Busca por nome (lower(nome) LIKE '%oliveira%')
--     sem RLS : Bitmap Index Scan em idx_pessoas_nome_trgm ..... custo   80,19
--     com RLS : Bitmap + Filter, GIN NÃO usado ................. custo 2.112,19
--                                                                 (~26x pior)
--
-- O CONSERTO (também medido, e funciona)
-- Marcar as três funções como LEAKPROOF. Exige SUPERUSUÁRIO e é POR BANCO —
-- `pg_proc` não é catálogo compartilhado, então isto precisa ser reaplicado em
-- todo banco novo, inclusive depois de um restore para um banco recém-criado:
--
--     ALTER FUNCTION pg_catalog.lower(text) LEAKPROOF;
--     ALTER FUNCTION pg_catalog.enum_eq(anyenum, anyenum) LEAKPROOF;
--     ALTER FUNCTION pg_catalog.textlike(text, text) LEAKPROOF;
--
-- Resultado depois de aplicar, com RLS ainda ativa:
--     listagem do painel .... 2.283,62 -> 3,52   (volta a usar o índice parcial)
--     busca por nome ........ 2.112,19 -> 80,23  (volta a usar o GIN)
--
-- POR QUE ISTO NÃO É EXECUTADO AQUI
-- Três razões. (1) Exige superusuário, e o papel que roda migração não é — nem
-- deve ser. (2) Alterar a marcação de funções do `pg_catalog` é decisão de DBA,
-- não efeito colateral de um deploy automatizado. (3) Só é necessário DEPOIS da
-- Fase 3 do prisma/RLS.md; antes disso não há RLS efetiva e os índices já
-- funcionam. O passo está no checklist da Fase 3.
--
-- O QUE VOCÊ ESTÁ ACEITANDO AO MARCAR LEAKPROOF
-- Honestamente: um canal lateral. Uma função leakproof pode ser avaliada sobre
-- linhas de OUTROS tenants antes do filtro de RLS. As três acima não lançam
-- erro dependente do dado e não têm como devolver o valor ao usuário, então o
-- que resta é inferência por TEMPO — dá para descobrir que "existe alguma linha
-- em algum lugar da plataforma cujo nome contém X", nunca qual nem de quem.
-- Comparado a perder o índice (e servir 30 igrejas com varredura sequencial),
-- é troca razoável. `lower` e `enum_eq` são especialmente inócuas. Se alguém
-- quiser ser conservador, marque essas duas e deixe `textlike` de fora — o
-- custo é a busca por nome ficar sem índice.
--
-- E SE VOCÊ NÃO FIZER NADA
-- Também é escolha defensável no porte atual: ~2.000 pessoas por igreja
-- filtradas em memória custa poucos milissegundos. Os números assustadores
-- acima vêm de um teste com 40.000 pessoas em UM tenant, deliberadamente
-- pessimista. Só não descubra isso quando a igreja grande entrar.
-- =============================================================================


-- =============================================================================
-- 0. EXTENSÕES
-- =============================================================================
-- pg_trgm e btree_gin são "trusted" desde o PostgreSQL 13: o dono do banco
-- instala sem ser superusuário. Ainda assim envolvemos num bloco com tratamento
-- de exceção, porque em serviço gerenciado a política pode ser outra — e falta
-- de extensão não deve derrubar um deploy inteiro por causa de UM índice de
-- busca. Se falhar, o índice de trigrama é pulado e o resto segue.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE EXTENSION IF NOT EXISTS btree_gin;
EXCEPTION
  WHEN insufficient_privilege OR undefined_file THEN
    RAISE WARNING 'pg_trgm/btree_gin indisponíveis: a busca por nome cairá em varredura sequencial. Instale postgresql-contrib e reaplique.';
END $$;


-- =============================================================================
-- 1. PESSOAS — a tabela mais lida e a mais escrita
-- =============================================================================

-- 1.1 Listagem padrão do painel: pessoas não excluídas, filtradas por status,
--     mais recentes primeiro.
--
-- O schema já tem ("tenantId", status, "criadoEm"). Por que não basta:
-- ele indexa TAMBÉM as linhas com "excluidoEm" preenchido, que a aplicação
-- nunca mostra. Exclusão é soft (LGPD: precisamos provar quando e por quem),
-- então esse lixo só cresce e nunca sai. Um índice parcial não indexa essas
-- linhas: fica menor, cabe mais fácil no cache e não precisa ser reescrito
-- quando alguém "exclui" alguém.
--
-- CUSTO: mais uma entrada por INSERT em `pessoas` (~60 mil linhas hoje).
-- Baixo. BENEFÍCIO: cobre o caminho mais quente do painel com ordenação já
-- pronta — o Postgres lê o índice na ordem e para no LIMIT, sem sort.
CREATE INDEX IF NOT EXISTS idx_pessoas_ativas_status
  ON public.pessoas ("tenantId", status, "criadoEm" DESC)
  WHERE "excluidoEm" IS NULL;

-- 1.2 Busca por nome (o campo de busca do painel e do app).
--
-- A aplicação faz `contains`, que o Prisma traduz em `ILIKE '%texto%'`. Nenhum
-- índice B-tree serve para isso: sem âncora à esquerda, o B-tree é inútil e o
-- planner faz Seq Scan. Trigramas (pg_trgm) resolvem exatamente esse caso.
--
-- Por que GIN composto com "tenantId" (via btree_gin) e não só trigrama:
-- com o índice só em `lower(nome)`, uma busca por "silva" varre os trigramas
-- de TODAS as igrejas e só depois filtra o tenant. Funciona, mas o trabalho
-- cresce com a plataforma inteira em vez de com a igreja. Com "tenantId" como
-- primeira coluna do GIN, o conjunto candidato já nasce restrito à igreja.
--
-- CUSTO: GIN é o índice mais caro de manter em escrita e o maior em disco;
-- também exige o `gin_pending_list_limit` sendo drenado pelo autovacuum.
-- BENEFÍCIO: hoje, honestamente, modesto — 2.000 pessoas por igreja cabem num
-- Seq Scan de poucos milissegundos. A razão real de existir é a igreja de
-- 15.000 membros que vai entrar no plano MULTISEDE: sem isto, a busca degrada
-- linearmente e o sintoma aparece só para esse cliente, em produção.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_pessoas_nome_trgm
    ON public.pessoas USING gin ("tenantId", lower(nome) gin_trgm_ops)
    WHERE "excluidoEm" IS NULL;
EXCEPTION
  WHEN undefined_object OR undefined_function THEN
    RAISE WARNING 'idx_pessoas_nome_trgm pulado (pg_trgm/btree_gin ausentes).';
END $$;

-- 1.3 Deduplicação por e-mail na hora de aprovar uma submissão.
--
-- O schema tem ("tenantId", email), sensível a maiúsculas. O fluxo de triagem
-- procura "já existe alguém com este e-mail?" e e-mail digitado por humano vem
-- com capitalização aleatória — "Maria@Gmail.com" não casaria com
-- "maria@gmail.com" e criaríamos uma pessoa duplicada. Duplicata em cadastro
-- de igreja não é um problema estético: quebra o histórico pastoral.
--
-- CUSTO: índice pequeno (só quem tem e-mail e não foi excluído).
-- BENEFÍCIO: torna a checagem de duplicidade correta E indexada.
CREATE INDEX IF NOT EXISTS idx_pessoas_email_normalizado
  ON public.pessoas ("tenantId", lower(email))
  WHERE email IS NOT NULL AND "excluidoEm" IS NULL;

-- 1.4 "Qual pessoa corresponde a este usuário logado?"
--
-- Roda em praticamente toda requisição autenticada do app do membro, e hoje
-- não há índice algum em "userId" — é Seq Scan em `pessoas` por request.
-- Índice com "userId" na primeira posição (e não ("tenantId","userId")) porque
-- ele serve a dois propósitos: essa consulta e a manutenção da FK
-- pessoas.userId -> users(id) ON DELETE SET NULL. O Postgres não cria índice de
-- FK sozinho; sem ele, apagar um usuário varre `pessoas` inteira.
--
-- CUSTO: baixíssimo — parcial, e a maioria das pessoas nunca cria login.
-- BENEFÍCIO: tira um Seq Scan do caminho mais frequente do app.
CREATE INDEX IF NOT EXISTS idx_pessoas_user
  ON public.pessoas ("userId")
  WHERE "userId" IS NOT NULL;


-- =============================================================================
-- 2. INTERACOES — histórico pastoral
-- =============================================================================

-- 2.1 Timeline de uma pessoa + exclusão em cascata.
--
-- O schema tem ("tenantId", "pessoaId", "criadoEm"), que atende a leitura. O
-- que ele NÃO atende é a FK interacoes.pessoaId -> pessoas(id) ON DELETE
-- CASCADE: para essa varredura o Postgres precisa de "pessoaId" na PRIMEIRA
-- posição do índice. Sem isso, todo pedido de exclusão LGPD ("apague tudo sobre
-- mim") faz Seq Scan em `interacoes`, que é uma das tabelas que mais cresce.
--
-- CUSTO: um índice a mais numa tabela append-only. Aceitável.
-- BENEFÍCIO: o direito ao esquecimento tem prazo legal para ser atendido; ele
-- não pode depender de uma varredura que fica mais lenta a cada mês.
CREATE INDEX IF NOT EXISTS idx_interacoes_pessoa
  ON public.interacoes ("pessoaId", "criadoEm" DESC);


-- =============================================================================
-- 3. SUBMISSOES — a caixa de entrada
-- =============================================================================

-- 3.1 Fila de triagem (o que a secretaria abre todo dia).
--
-- O schema tem ("tenantId", status, "criadoEm"). Ele funciona, mas indexa
-- também CONCLUIDO / ARQUIVADO / SPAM — que, passados alguns meses, são 95% da
-- tabela e nunca aparecem na fila. O índice parcial fica praticamente do
-- tamanho da fila de verdade (dezenas de linhas por igreja) e tende a ficar
-- permanentemente em cache.
--
-- CUSTO: escrita extra apenas enquanto a submissão está aberta; ao ser
-- concluída, a entrada SAI do índice (o que é um bônus: o índice encolhe
-- sozinho conforme o trabalho é feito).
-- BENEFÍCIO: a tela mais consultada do painel responde em tempo constante,
-- independentemente de quantos anos de histórico existam.
CREATE INDEX IF NOT EXISTS idx_submissoes_fila_aberta
  ON public.submissoes ("tenantId", "criadoEm" DESC)
  WHERE status IN ('NOVO'::"StatusSubmissao", 'EM_ANALISE'::"StatusSubmissao");


-- =============================================================================
-- 4. PEDIDOS_ORACAO
-- =============================================================================

-- 4.1 Fila pastoral: urgentes primeiro, dentro do que ainda está aberto.
--
-- O schema tem ("tenantId", urgente, status) e ("tenantId", status, "criadoEm"),
-- mas nenhum entrega a ordenação real da tela — "urgente DESC, criadoEm DESC" —
-- sem um passo de sort. Este entrega, e restrito ao que está aberto.
--
-- CUSTO: baixo. BENEFÍCIO: além do desempenho, a ordem "urgente primeiro" fica
-- garantida pelo índice; é a tela em que um pedido de socorro não pode
-- afundar na paginação.
CREATE INDEX IF NOT EXISTS idx_oracao_fila_aberta
  ON public.pedidos_oracao ("tenantId", urgente DESC, "criadoEm" DESC)
  WHERE status IN ('RECEBIDO'::"StatusOracao", 'ORANDO'::"StatusOracao");

-- 4.2 Mural do app / site: só o que NÃO é privado.
--
-- Esta é a query mais perigosa do sistema — ela publica pedido de oração. O
-- índice parcial não é só desempenho: ele materializa a regra "PRIVADO nunca
-- sai daqui". Se alguém escrever a query sem o filtro de visibilidade, o
-- planner deixa de usar este índice, o plano muda de forma visível em
-- EXPLAIN e o teste de desempenho denuncia o bug de segurança.
--
-- CUSTO: mínimo — o padrão é PRIVADO, então poucas linhas entram no índice.
-- BENEFÍCIO: desempenho + um canário para uma regra crítica de privacidade.
CREATE INDEX IF NOT EXISTS idx_oracao_mural
  ON public.pedidos_oracao ("tenantId", "criadoEm" DESC)
  WHERE visibilidade <> 'PRIVADO'::"VisibilidadeOracao"
    AND status <> 'ARQUIVADO'::"StatusOracao";

-- 4.3 FK pedidos_oracao.pessoaId -> pessoas(id) ON DELETE SET NULL.
--     Mesmo raciocínio de 2.1: caminho de exclusão LGPD. Aqui pesa ainda mais,
--     porque é a tabela em que o titular mais provavelmente vai querer exercer
--     o direito de eliminação.
CREATE INDEX IF NOT EXISTS idx_oracao_pessoa
  ON public.pedidos_oracao ("pessoaId")
  WHERE "pessoaId" IS NOT NULL;


-- =============================================================================
-- 5. SOLICITACOES_BATISMO
-- =============================================================================

-- 5.1 Fila de acompanhamento: tudo que ainda não terminou.
--     Batismo é um processo longo (solicitação -> curso -> aprovação -> data),
--     então o histórico encerrado supera rapidamente o que está em andamento.
--     CUSTO: baixo. BENEFÍCIO: a fila não cresce com o histórico.
CREATE INDEX IF NOT EXISTS idx_batismo_fila_aberta
  ON public.solicitacoes_batismo ("tenantId", "criadoEm" DESC)
  WHERE status NOT IN (
    'REALIZADO'::"StatusBatismo",
    'RECUSADO'::"StatusBatismo",
    'CANCELADO'::"StatusBatismo"
  );


-- =============================================================================
-- 6. AGENDA — servida em tráfego ANÔNIMO, sem cache de sessão
-- =============================================================================
-- Estas duas alimentam a home de 30 sites públicos. É o único lugar do sistema
-- onde a taxa de requisições não depende de quantas pessoas fizeram login —
-- depende de quanta gente clicou no link do Instagram da igreja. Otimizar aqui
-- é otimizar o pico.

-- 6.1 Próximos eventos pontuais.
--     O schema tem ("tenantId","dataHora"), que também indexa itens inativos,
--     itens não publicados no site e — pior — todos os recorrentes, cujo
--     "dataHora" é NULL e que são a maioria das linhas. O parcial guarda só o
--     que a home realmente lista.
CREATE INDEX IF NOT EXISTS idx_agenda_proximos
  ON public.agenda_itens ("tenantId", "dataHora")
  WHERE ativo AND "publicoSite" AND "dataHora" IS NOT NULL;

-- 6.2 Grade semanal recorrente ("Cultos: domingo 18h, quarta 20h").
--     Consulta complementar à anterior e sem índice adequado hoje:
--     ("tenantId", ativo, ordem) não tem "diaSemana" e força sort.
CREATE INDEX IF NOT EXISTS idx_agenda_semanal
  ON public.agenda_itens ("tenantId", "diaSemana", ordem)
  WHERE ativo AND "publicoSite" AND recorrente;


-- =============================================================================
-- 7. MATRICULAS
-- =============================================================================

-- 7.1 "Meus cursos" no app do membro.
--     Hoje não há índice que comece por pessoaId nem que o inclua: os dois
--     índices do schema são ("tenantId","cursoId",status) e ("tenantId","criadoEm").
--     A tela do membro faz Seq Scan.
--     CUSTO: irrelevante (tabela pequena). BENEFÍCIO: tira um Seq Scan de uma
--     rota de app, e a tabela vai crescer com cada turma nova.
CREATE INDEX IF NOT EXISTS idx_matriculas_pessoa
  ON public.matriculas ("tenantId", "pessoaId", "criadoEm" DESC)
  WHERE "pessoaId" IS NOT NULL;


-- =============================================================================
-- 8. ARQUIVOS
-- =============================================================================

-- 8.1 Verificação de cota de storage (limiteStorageMb do plano).
--     Roda em TODO upload: `SELECT sum("tamanhoBytes") WHERE "tenantId" = ...`.
--     O índice ("tenantId","criadoEm") do schema obriga o Postgres a visitar a
--     heap linha a linha só para ler "tamanhoBytes". Com INCLUDE, o valor viaja
--     dentro do índice e a soma vira Index Only Scan — sem tocar na tabela.
--     CUSTO: o índice fica um pouco maior (4 bytes por linha).
--     BENEFÍCIO: elimina o acesso à heap no caminho de upload, que é a operação
--     que mais concorre por I/O na VPS.
--     Requer autovacuum em dia para o visibility map — ver seção 11.
CREATE INDEX IF NOT EXISTS idx_arquivos_cota
  ON public.arquivos ("tenantId") INCLUDE ("tamanhoBytes");


-- =============================================================================
-- 9. AUDIT_LOGS
-- =============================================================================

-- 9.1 "O que já aconteceu com ESTE registro?" — a aba de histórico na ficha de
--     uma pessoa, de um pedido, de uma configuração.
--     Os três índices do schema respondem "o que aconteceu no tenant", "por
--     ação" e "por ator". Nenhum responde "por alvo", que é a pergunta que a
--     interface faz. Sem este índice, abrir o histórico de uma pessoa varre
--     toda a auditoria da igreja — a tabela que mais cresce no sistema.
--     CUSTO: real, porque `audit_logs` é a tabela de maior taxa de INSERT.
--     BENEFÍCIO: sem ele, essa tela fica progressivamente inutilizável, e a
--     alternativa (não ter a tela) enfraquece o próprio valor da auditoria.
CREATE INDEX IF NOT EXISTS idx_audit_alvo
  ON public.audit_logs ("tenantId", "alvoTipo", "alvoId", "criadoEm" DESC)
  WHERE "alvoId" IS NOT NULL;


-- =============================================================================
-- 10. NOTIFICACOES
-- =============================================================================

-- 10.1 Contador de não lidas (o "badge") — carregado a cada abertura do app.
--      O schema tem ("tenantId","destinatarioUserId","lidaEm"), que serve; o
--      parcial serve melhor porque a esmagadora maioria das notificações acaba
--      lida e sai do índice. É o mesmo padrão de 3.1: o índice encolhe conforme
--      as pessoas usam o sistema.
CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas
  ON public.notificacoes ("tenantId", "destinatarioUserId", "criadoEm" DESC)
  WHERE "lidaEm" IS NULL;

-- 10.2 Fila do worker de envio de notificações agendadas.
--      Sem índice, o worker faz Seq Scan a cada ciclo (por minuto, por tenant)
--      numa tabela que só cresce — o tipo de consumo de I/O em segundo plano
--      que ninguém percebe até o sistema ficar lento sem motivo aparente.
--      "tenantId" vem primeiro porque, com RLS ativa, o worker roda por tenant.
CREATE INDEX IF NOT EXISTS idx_notificacoes_pendentes
  ON public.notificacoes ("tenantId", "agendadaPara")
  WHERE "enviadaEm" IS NULL AND "agendadaPara" IS NOT NULL;


-- =============================================================================
-- 11. TABELAS GLOBAIS
-- =============================================================================

-- 11.1 Revogar todas as sessões de uma igreja de uma vez.
--      Acontece quando um tenant é SUSPENSO por inadimplência ou CANCELADO, e
--      quando um administrador aperta "desconectar todo mundo" após um
--      incidente. É justamente o momento em que a operação precisa ser rápida e
--      completa — e hoje ela é um Seq Scan em `sessoes`, que tem uma linha por
--      login ativo de toda a plataforma.
CREATE INDEX IF NOT EXISTS idx_sessoes_tenant_ativo
  ON public.sessoes ("tenantAtivoId")
  WHERE "tenantAtivoId" IS NOT NULL AND "revogadaEm" IS NULL;


-- =============================================================================
-- 12. AUTOVACUUM PARA AS TABELAS APPEND-ONLY
-- =============================================================================
-- Não é índice, mas é a condição para que metade dos índices acima renda o que
-- promete. `audit_logs` e `interacoes` quase só recebem INSERT. Com os padrões
-- do autovacuum (que dispara por linhas MORTAS), uma tabela que nunca sofre
-- UPDATE/DELETE pode ficar meses sem vacuum — e o visibility map desatualizado
-- desliga o Index Only Scan, além de acumular risco de wraparound de
-- transaction ID, que se resolve com um vacuum de emergência bloqueante.
--
-- Os parâmetros abaixo (PostgreSQL 13+) fazem o autovacuum disparar também por
-- INSERTs: a cada ~5.000 linhas novas, independentemente do tamanho da tabela.
-- CUSTO: alguns vacuums a mais por dia, baratos, em tabela pequena.
-- BENEFÍCIO: visibility map fresco (Index Only Scan funciona) e estatísticas
-- atualizadas para o planner escolher os índices desta migração.
ALTER TABLE public.audit_logs  SET (autovacuum_vacuum_insert_scale_factor = 0.0,
                                    autovacuum_vacuum_insert_threshold   = 5000);
ALTER TABLE public.interacoes  SET (autovacuum_vacuum_insert_scale_factor = 0.0,
                                    autovacuum_vacuum_insert_threshold   = 5000);
ALTER TABLE public.arquivos    SET (autovacuum_vacuum_insert_scale_factor = 0.0,
                                    autovacuum_vacuum_insert_threshold   = 2000);

-- Estatísticas imediatas para o planner: sem ANALYZE, o Postgres pode ignorar
-- índices recém-criados até o próximo autovacuum e alguém vai concluir,
-- erroneamente, que "os índices não adiantaram".
ANALYZE public.pessoas;
ANALYZE public.submissoes;
ANALYZE public.pedidos_oracao;
ANALYZE public.agenda_itens;
ANALYZE public.audit_logs;
ANALYZE public.notificacoes;


-- =============================================================================
-- 13. CONSIDERADOS E RECUSADOS (e por quê)
-- =============================================================================
-- Registrado aqui para não ser reanalisado do zero na próxima vez que alguém
-- olhar um EXPLAIN e tiver uma ideia.
--
-- - celulas (latitude, longitude) para o mapa "encontre uma célula":
--   uma busca por caixa delimitadora ("lat BETWEEN .. AND lon BETWEEN ..") não
--   é bem servida por B-tree de duas colunas; o certo seria GiST sobre um tipo
--   geométrico, que o schema não tem. E são ~dezenas de células por igreja: o
--   Seq Scan é medido em microssegundos. Índice errado para um problema que não
--   existe. Reavaliar só se surgir uma coluna `geography`.
--
-- - mensagens ("tenantId", data DESC) WHERE publicado:
--   ("tenantId", publicado, data) já existe e o B-tree pode ser percorrido para
--   trás, então a ordenação DESC sai de graça. O ganho seria só de tamanho.
--
-- - pessoas ("celulaId") e pessoas ("campusId") para as FKs ON DELETE SET NULL:
--   `pessoas` é a tabela mais escrita do sistema; dois índices a mais custam em
--   todo cadastro e toda edição. Excluir uma célula ou um campus é operação
--   rara (mensal, no máximo) sobre ~2.000 linhas por igreja. Pagar em todo
--   INSERT para acelerar algo que acontece uma vez por mês é troca ruim.
--   ("tenantId","celulaId") já existe e cobre a consulta do app.
--
-- - matriculas ("cursoId") para a FK ON DELETE CASCADE:
--   mesmo raciocínio — apagar um curso é raro e a tabela é pequena.
--
-- - memberships ("celulaId"): tabela minúscula (dezenas de linhas por igreja).
--
-- - GIN sobre submissoes.dados (jsonb): não há nenhuma consulta que filtre por
--   dentro do JSON — `dados` é lido depois de a linha já ter sido encontrada
--   por tenant e status. Índice sem query é só custo de escrita.
--
-- - UNIQUE em matriculas ("tenantId","cursoId","pessoaId") para impedir
--   matrícula duplicada: é uma regra de negócio legítima e provavelmente
--   desejável, mas é MUDANÇA DE SCHEMA e pertence ao schema.prisma, não a uma
--   migração de índices — caso contrário o Prisma a trataria como drift e a
--   dropparia. Abrir issue.
--
-- - UNIQUE funcional em users (lower(email)) para login case-insensitive:
--   mesma razão (mudança semântica de schema) e, além disso, falharia se já
--   existirem dois cadastros que só diferem na capitalização. Exige migração de
--   dados própria, com plano de deduplicação. Abrir issue.
-- =============================================================================
