# Row-Level Security — documento operacional

Este documento existe porque RLS é o tipo de controle sobre o qual todo mundo
diz "está ligado" e ninguém verificou. Aqui está o que de fato está ativo, o que
está apenas escrito, e o que precisa acontecer para virar defesa real.

---

## 1. Estado atual — leia isto antes de qualquer coisa

| Camada | Onde | Status hoje |
|---|---|---|
| 1. Tenant resolvido pelo hostname | `src/lib/tenant/resolve.ts` | **ativa** |
| 2. Cliente Prisma escopado por tenant | `src/lib/db/tenant-client.ts` | **ativa — é a defesa principal** |
| 3. Row-Level Security no Postgres | `prisma/migrations/20260101000000_rls/` | **escrita e versionada, em modo transição (não protege nada ainda)** |
| 4. Verificação de propriedade nos serviços | `src/lib/services/*` | ativa |

**A defesa real hoje é a camada 2.** A migração de RLS está no repositório com
uma política de transição (`transicao_pre_rls`) que libera tudo enquanto o
parâmetro `app.rls_estrito` não estiver em `'on'`. Sem essa política, aplicar a
migração hoje derrubaria o sistema inteiro — porque a aplicação ainda não
executa `SET LOCAL app.tenant_id`.

Isso é uma escolha, não um esquecimento. As opções eram:

- **(A)** não versionar o SQL até a aplicação estar pronta — e aí o SQL nunca é
  revisado, nunca é testado, e chega em produção no dia mais tenso;
- **(B)** versionar com um interruptor explícito e documentado.

Escolhemos (B). O custo é este documento e a honestidade de admitir que, no
momento em que você lê isto, RLS não está protegendo ninguém.

---

## 2. O que RLS resolve — e o que não resolve

RLS **não** impede quem consegue executar SQL arbitrário como `discipular_app`.
Esse alguém simplesmente faz `SET app.tenant_id = '<outro tenant>'` e lê o que
quiser. Não existe configuração de RLS que impeça isso enquanto o valor do
tenant for um parâmetro de sessão controlado pela aplicação.

RLS resolve o vazamento que realmente acontece em SaaS multi-tenant:

```ts
prisma.pessoa.findMany({ where: { status: "MEMBRO" } })
//                              ^ faltou o tenantId
```

Essa linha passa em code review (parece certa), passa em teste (em dev só há um
tenant) e devolve a base de membros de 30 igrejas. Com RLS ativa, ela devolve
zero linhas. O incidente de vazamento vira um ticket de "sumiu a lista".

Comparação honesta entre as camadas 2 e 3:

|  | Camada 2 (`tenant-client.ts`) | Camada 3 (RLS) |
|---|---|---|
| Precisão | alta — sabe o modelo, erro explícito | baixa — some a linha, sem explicação |
| Cobertura | só quem passa por `tenantDb()` | tudo, inclusive `$queryRaw` e `psql` |
| Falha se… | alguém importar `prisma` direto | o app conectar como superusuário/owner |

Elas cobrem exatamente os buracos uma da outra. É por isso que existem as duas.

---

## 3. Como a política funciona

```sql
CREATE POLICY isolamento_tenant ON public.pessoas
  FOR ALL
  USING      ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

- `app.tenant_id` é um parâmetro de sessão customizado (GUC). Precisa do ponto
  no nome — sem ele o Postgres recusa parâmetros desconhecidos.
- O segundo argumento `true` (`missing_ok`) faz `current_setting` devolver
  `NULL` em vez de lançar erro quando o parâmetro nunca foi definido.
- `NULL` faz a comparação virar `NULL`, que não é `TRUE`: **nenhuma linha
  visível, nenhuma linha gravável**. Falha fechada.
- `WITH CHECK` impede que um `UPDATE` mova a linha para outro tenant.
- `FORCE ROW LEVEL SECURITY` faz a política valer também para o dono da tabela.
  Sem `FORCE`, apontar a `DATABASE_URL` para o usuário dono desligaria o
  isolamento em silêncio.

Não existe valor coringa. Não crie um. Um `'*'` que enxerga tudo é a primeira
coisa que um atacante procura e a primeira coisa que um desenvolvedor apressado
usa "só para debugar".

---

## 4. O problema difícil: `SET LOCAL` e o pool do Prisma

Para RLS funcionar, cada consulta precisa rodar numa conexão onde
`app.tenant_id` esteja definido com o tenant certo. E aí começam os problemas.

### 4.1 Por que `SET` (sem `LOCAL`) seria catastrófico

O pool do Prisma reaproveita conexões entre requisições. Um `SET
app.tenant_id` comum persiste na conexão até ela ser fechada. Sequência real:

1. Requisição da Igreja A pega a conexão nº 3, faz `SET app.tenant_id = 'A'`.
2. Requisição termina, conexão nº 3 volta para o pool **com o GUC ainda em 'A'**.
3. Requisição da Igreja B pega a conexão nº 3. Se por qualquer motivo o `SET`
   falhar, for pulado ou acontecer depois da primeira query, a Igreja B lê
   dados da Igreja A — **com a bênção do RLS**.

Isso é pior do que não ter RLS, porque produz confiança injustificada. A defesa
vira o vetor.

### 4.2 A forma correta: transação interativa

`SET LOCAL` só existe dentro de uma transação e é revertido no `COMMIT`/`ROLLBACK`
automaticamente. Uma transação interativa do Prisma fixa (pin) uma conexão do
pool durante todo o bloco, então o `SET LOCAL` e as queries acontecem na mesma
conexão, garantidamente.

Esboço do que a camada de aplicação precisará (a implementar na Fase 2 — hoje
`comTransacaoTenant` em `src/lib/db/tenant-client.ts` **não** faz isto):

```ts
export async function comEscopoRls<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // set_config(nome, valor, is_local=true) é o equivalente funcional de
    // SET LOCAL, com uma diferença decisiva: aceita PARÂMETRO LIGADO.
    // `SET LOCAL` não aceita, o que obrigaria a interpolar o tenantId na
    // string SQL — ou seja, a construir SQL dinâmico com um valor que um dia
    // alguém vai deixar chegar de fora. Aqui não há essa porta.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  }, { maxWait: 5_000, timeout: 15_000 });
}
```

Duas coisas que **não** funcionam e que já custaram tempo em outros projetos:

- **`$on('query')` / middleware do Prisma:** rodam por operação lógica, não por
  conexão. Não há garantia de que o `SET` e a query subsequente caiam na mesma
  conexão física.
- **`options` na connection string** (`?options=-c%20app.tenant_id%3Dx`): fixa o
  valor na conexão inteira, para todos os tenants. É o cenário 4.1.

### 4.3 O preço a pagar

| Custo | Detalhe |
|---|---|
| Conexão presa | Toda leitura vira transação. A conexão fica reservada do `BEGIN` ao `COMMIT`, e não por query. Com `connection_limit=10` e 90 usuários simultâneos, uma transação lenta trava as outras 9 requisições daquele processo. |
| Latência | +2 round-trips por requisição (`BEGIN` + `set_config`) e +1 (`COMMIT`). Em rede local, ~1 ms. Irrelevante isolado, mensurável em rota que faz 5 consultas separadas. |
| Rotas públicas | O site institucional é lido por visitante anônimo. Transacionar cada leitura de página estática é desperdício — vale usar cache do Next.js na frente e não tocar no banco na maioria dos acessos. |
| Nada de I/O dentro da transação | Chamada HTTP (YouTube, SMTP) dentro do bloco segura a conexão pelo tempo do timeout da rede. Regra: **nenhuma chamada externa dentro de `comEscopoRls`.** |
| PgBouncer | Se um dia entrar, use *transaction pooling* (compatível com `SET LOCAL`, que morre no commit) e `?pgbouncer=true` na URL do Prisma por causa dos prepared statements. *Session pooling* + `SET LOCAL` funciona, mas anula o ganho do bouncer. |

Mitigações já previstas: `idle_in_transaction_session_timeout` e
`statement_timeout` no `postgresql.conf.exemplo` — uma transação esquecida
aberta é o que transforma "lento" em "fora do ar".

### 4.4 Alternativas descartadas

- **Um pool por tenant** (`app.tenant_id` fixo na conexão): 30 igrejas × 10
  conexões = 300 conexões. Cada backend do Postgres custa alguns MB; em 8 GB de
  RAM isso não fecha, e o desperdício é quase total (a maioria das igrejas está
  ociosa a maior parte do tempo).
- **Um schema Postgres por tenant:** isolamento melhor, mas o Prisma passa a
  precisar de um client por schema, migrações viram 30 execuções e o `search_path`
  vira o novo ponto único de falha — trocamos um risco conhecido por outro.
- **Um banco por tenant:** só faz sentido em outra ordem de grandeza de receita
  por cliente. Reavaliar se algum cliente exigir isolamento contratual.

---

## 5. Plano de ativação em produção

Nenhuma fase é opcional e nenhuma deve ser pulada por estar "quase pronta".

### Fase 0 — Separar os papéis do banco (pré-requisito, faça já)

Rode como superusuário, uma vez, na VPS. Nada disto está no controle de versão
porque envolve senha.

```sql
-- Dono das tabelas / DDL. Usado SÓ por `prisma migrate deploy`.
CREATE ROLE discipular_migrator LOGIN PASSWORD '<senha forte>'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

-- Runtime web. Sem DDL, sem ownership, sem bypass.
CREATE ROLE discipular_app LOGIN PASSWORD '<outra senha forte>'
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

CREATE DATABASE discipular OWNER discipular_migrator;
\c discipular
ALTER SCHEMA public OWNER TO discipular_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
```

Confira que `DATABASE_URL` usa `discipular_app` e `DIRECT_DATABASE_URL` usa
`discipular_migrator`. Se as duas apontarem para o mesmo usuário, **toda esta
migração é decoração** — o app teria DDL e poderia executar
`ALTER TABLE ... DISABLE ROW LEVEL SECURITY` no meio de uma injeção de SQL.

Verificação:

```sql
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
  FROM pg_roles WHERE rolname LIKE 'discipular%';
-- discipular_app precisa ter tudo em `false`.
```

### Fase 1 — Aplicar a migração (segura, não muda comportamento)

```bash
npx prisma migrate deploy
```

Com `app.rls_estrito` em `off`, a política de transição libera tudo. O que muda:
RLS fica *ligada* nas 18 tabelas, os `GRANT`s corretos são aplicados e o
`_prisma_migrations` deixa de ser acessível pelo runtime. Nada quebra.

Verifique que ligou de verdade:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
   AND EXISTS (SELECT 1 FROM information_schema.columns c
                WHERE c.table_name = relname AND c.column_name = 'tenantId')
 ORDER BY relrowsecurity, relname;
-- 18 linhas, nenhuma com `false`.
```

### Fase 2 — Implementar `comEscopoRls` na aplicação

Trabalho de código, não de banco. Escopo:

1. Implementar o helper da seção 4.2 em `src/lib/db/`.
2. Fazer `tenantDb()` / `exigirPermissao()` devolverem um client já dentro do
   escopo, para que nenhum handler precise lembrar de nada.
3. Auditar todas as chamadas a `$queryRaw`/`$executeRaw` — elas passam por fora
   da camada 2 e são exatamente o que a camada 3 existe para pegar.
4. Cobrir o *seed* (`prisma/seed.ts`) e qualquer script de manutenção: eles
   também precisam do `set_config`, ou vão falhar depois da Fase 3.
5. Teste de integração obrigatório: com dois tenants no banco, uma query sem
   escopo tem que devolver **zero** linhas.

### Fase 3 — Virar o interruptor

```sql
-- Precisa ser executado como SUPERUSUÁRIO (postgres).
ALTER DATABASE discipular SET app.rls_estrito = 'on';
```

Desde o PostgreSQL 15, definir um parâmetro customizado no nível de banco exige
superusuário: rodando como `discipular_migrator` o comando falha com
`permission denied to set parameter "app.rls_estrito"`. Isso é desejável — o
interruptor do isolamento não deve estar ao alcance do papel que roda migrações
automatizadas. Se você quiser delegar a um DBA sem dar superusuário (testado no
PG 16, funciona para GUC customizado):

```sql
GRANT SET ON PARAMETER "app.rls_estrito" TO <papel_do_dba>;
```

`ALTER DATABASE ... SET` só vale para conexões **novas**. O pool do Prisma
segura as antigas indefinidamente, então **reinicie o processo Node** — sem
isso você vai "ativar" o RLS e não ver diferença nenhuma, e concluir a coisa
errada.

**Antes de virar o interruptor, decida sobre a seção 6.4** (as marcações
`LEAKPROOF`). Sem essa decisão, o sistema fica correto e mais lento, e a causa
não vai ser óbvia para quem investigar depois.

Limite honesto deste interruptor: `discipular_app` consegue executar
`SET app.rls_estrito = 'off'` na própria sessão (parâmetros customizados são
`USERSET` no nível de sessão) e assim reativar a política de transição para si
mesmo. Enquanto a política `transicao_pre_rls` existir, o isolamento depende de
a aplicação não fazer isso — por isso a Fase 4 não é opcional.

Janela sugerida: manhã de terça. Nunca sábado ou domingo — são os dias em que
os sites das igrejas têm pico e a equipe pastoral está trabalhando.

Reversão em um comando, se algo quebrar:

```sql
ALTER DATABASE discipular SET app.rls_estrito = 'off';  -- + restart do Node
```

Teste de aceitação, conectado como `discipular_app`:

```sql
BEGIN;
  SELECT set_config('app.tenant_id', '<id-igreja-A>', true);
  SELECT count(*) FROM pessoas;                                  -- só a A
  SELECT count(*) FROM pessoas WHERE "tenantId" = '<id-igreja-B>'; -- 0
  INSERT INTO pessoas ("id","tenantId","nome","atualizadoEm")
    VALUES ('t1','<id-igreja-B>','x',now());                     -- deve FALHAR
ROLLBACK;

-- Sem escopo nenhum:
SELECT count(*) FROM pessoas;   -- deve ser 0, não a base inteira
```

### Fase 4 — Remover a política de transição

Depois de uma ou duas semanas estáveis com `app.rls_estrito = 'on'`, crie uma
migração nova que faça `DROP POLICY transicao_pre_rls` nas 18 tabelas. Só aí a
garantia deixa de depender de um GUC que a própria aplicação poderia
sobrescrever, e passa a ser estrutural.

---

## 6. O que quebra com RLS ativa (e como tratar)

Estes casos precisam de decisão consciente **antes** da Fase 3.

### 6.1 Painel do super admin

Relatórios da plataforma que somam dados de todos os tenants
("quantas pessoas cadastradas no total?") param de funcionar: a conexão só
enxerga um tenant por vez.

Opções, em ordem de preferência:

1. **Iterar tenant a tenant** — uma transação por igreja, agregando na
   aplicação. Com 30 igrejas é barato e mantém o super admin sujeito ao mesmo
   mecanismo de todo mundo (bônus de auditoria).
2. **Papel dedicado com `BYPASSRLS`**, credencial separada, usada apenas por
   jobs de plataforma e nunca pelo processo que atende requisições web. Se
   escolher este caminho, o segredo tem que ficar fora da `DATABASE_URL`.
3. Manter contadores agregados por tenant (`tenants.totalPessoas`) atualizados
   na escrita — evita a leitura cruzada, mas cria consistência a manter.

### 6.2 Backups

`pg_dump` executado por um papel sujeito a RLS **falha**, com código de saída 1:

```
pg_dump: error: query failed: ERROR:  query would be affected by
         row-level security policy for table "agenda_itens"
HINT:  To disable the policy for the table's owner, use
       ALTER TABLE NO FORCE ROW LEVEL SECURITY.
```

Isso é bom — falha alto. O perigo é a "solução" que o Google oferece:
adicionar `--enable-row-security`. **Verificado no PostgreSQL 16**: com essa
flag o `pg_dump` sai com **código 0**, arquivo gerado, aparência de sucesso
completo — e **zero linhas** dentro. Você só descobre no restore, no pior dia
possível. Nunca use essa flag neste banco.

Faça o backup como superusuário ou como papel com `BYPASSRLS`, e valide o dump
comparando a contagem de linhas:

```bash
pg_dump -U postgres discipular | gzip > backup.sql.gz
# e sempre:
psql -U postgres -d discipular -Atc \
  'SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY 1'
```

Um backup nunca testado não é um backup. Restaure num banco descartável pelo
menos uma vez por trimestre.

### 6.3 Migrações futuras que mexem em dados

`FORCE` alcança o dono, então `UPDATE pessoas SET ...` numa migração vê zero
linhas. Duas saídas, ambas aceitáveis, ambas obrigatoriamente explícitas no PR:

```sql
-- (1) por tenant
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', t.id, true);
    UPDATE pessoas SET ... ;
  END LOOP;
END $$;

-- (2) suspender o FORCE dentro da MESMA transação da migração
ALTER TABLE pessoas NO FORCE ROW LEVEL SECURITY;
UPDATE pessoas SET ... ;
ALTER TABLE pessoas FORCE ROW LEVEL SECURITY;   -- nunca esqueça esta linha
```

A opção (2) é mais rápida e mais perigosa: se a migração falhar entre os dois
`ALTER`, a transação faz rollback e o `FORCE` volta — mas se alguém copiar o
trecho para um `psql` com autocommit, a tabela fica desprotegida sem aviso.
Prefira (1) quando o volume permitir.

### 6.4 Desempenho: RLS derruba a escolha de índice (o custo que ninguém avisa)

Este é o efeito colateral mais caro de ligar RLS, e ele não aparece em nenhum
tutorial. **Medido neste schema, PostgreSQL 16, 60 mil pessoas.**

Com uma política ativa, as condições dela viram *security quals* e precisam ser
avaliadas **antes** das condições da consulta — senão a consulta poderia
observar linhas que a política esconde. A única exceção são funções marcadas
`LEAKPROOF`. E acontece que quase nada é `LEAKPROOF` por padrão:

| Condição | Função | `LEAKPROOF`? | Efeito |
|---|---|---|---|
| `"tenantId" = 'x'` | `texteq` | sim | vira condição de índice |
| `status = 'MEMBRO'` | `enum_eq` | **não** | vira `Filter` |
| `lower(email) = 'x'` | `lower` | **não** | vira `Filter` |
| `nome ILIKE '%x%'` | `textlike` | **não** | vira `Filter` |

Resultado: o planner só consegue usar `"tenantId"` como condição de índice,
escolhe o índice genérico `("tenantId","excluidoEm")` que o Prisma cria, e
**ignora os índices parciais e o índice de trigrama** da migração
`20260101000001_indices`.

| Consulta | Sem RLS | Com RLS |
|---|---|---|
| Listagem do painel (tenant + status + `ORDER BY criadoEm DESC LIMIT 25`) | Index Scan, custo **3,28** | Bitmap + Sort, custo **2.283,62** |
| Busca por nome (`lower(nome) LIKE '%…%'`) | GIN de trigrama, custo **80,19** | GIN ignorado, custo **2.112,19** |

O conserto, também medido:

```sql
-- Como SUPERUSUÁRIO. É POR BANCO: pg_proc não é catálogo compartilhado,
-- então reaplique em todo banco novo e depois de todo restore.
ALTER FUNCTION pg_catalog.lower(text) LEAKPROOF;
ALTER FUNCTION pg_catalog.enum_eq(anyenum, anyenum) LEAKPROOF;
ALTER FUNCTION pg_catalog.textlike(text, text) LEAKPROOF;
```

Depois disso, **com a RLS ainda ativa**: a listagem volta a 3,52 e a busca por
nome volta a 80,23 — ou seja, o desempenho original é recuperado por inteiro.

O que se aceita ao marcar `LEAKPROOF`: um canal lateral. A função passa a poder
ser avaliada sobre linhas de outros tenants antes do filtro de RLS. As três não
lançam erro dependente do dado nem devolvem valor ao usuário, então o que sobra
é inferência por **tempo** — dá para descobrir que "existe em algum lugar da
plataforma alguma linha cujo nome contém X", nunca qual nem de quem. Diante da
alternativa (varredura sequencial servindo 30 igrejas), é troca razoável.
`lower` e `enum_eq` são as mais inócuas; quem quiser ser conservador pode
marcar só essas duas e aceitar a busca por nome sem índice.

**Não fazer nada também é defensável hoje**: 2.000 pessoas por igreja filtradas
em memória custa poucos milissegundos. Os números acima vêm de um teste com
40.000 pessoas em um único tenant, deliberadamente pessimista. O risco é
descobrir isso quando a igreja grande entrar, numa terça à noite.

Decida antes da Fase 3, e registre a decisão aqui.

### 6.5 Modelos novos

Todo modelo novo com `tenantId` precisa de três coisas, ou nasce sem proteção:

1. entrar em `MODELOS_TENANT` em `src/lib/db/tenant-client.ts`;
2. ganhar `ENABLE`/`FORCE`/`CREATE POLICY` numa migração;
3. entrar na lista de verificação da seção 6 da migração de RLS.

O item 1 falha alto (a extensão recusa modelos não classificados). Os itens 2 e
3 falham em silêncio — por isso a query de verificação abaixo deve entrar na
rotina de release.

---

## 7. Verificação periódica

Rode antes de cada release e depois de cada migração. Se qualquer uma retornar
linha, o release para.

```sql
-- 7.1 Tabela com tenantId sem RLS ligada e forçada
--
-- A exclusão de `tenant_domains` e `memberships` é obrigatória e não é
-- descuido: as duas TÊM coluna "tenantId" e mesmo assim ficam fora do RLS de
-- propósito (são lidas antes de existir um tenant resolvido — ver seção 3 da
-- migração). Sem a exceção, esta consulta acusa falha em todo release e a
-- equipe aprende a ignorá-la, que é como um alarme deixa de servir.
SELECT c.relname
  FROM pg_class c
  JOIN information_schema.columns col
    ON col.table_name = c.relname AND col.column_name = 'tenantId'
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
   AND c.relname NOT IN ('tenant_domains', 'memberships')
   AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

-- 7.1b Contagem de controle: precisa dar exatamente 18.
SELECT count(*) FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
   AND relrowsecurity AND relforcerowsecurity;

-- 7.2 Tabela com RLS ligada mas sem a política de isolamento
SELECT c.relname
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
   AND c.relrowsecurity
   AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.tablename = c.relname AND p.policyname = 'isolamento_tenant');

-- 7.3 O papel de runtime ganhou algum superpoder?
SELECT rolname FROM pg_roles
 WHERE rolname = 'discipular_app'
   AND (rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole);

-- 7.4 O interruptor da transição continua onde deveria?
SELECT setconfig FROM pg_db_role_setting s
  JOIN pg_database d ON d.oid = s.setdatabase
 WHERE d.datname = current_database();
```

---

## 8. O que já foi verificado de verdade

As duas migrações não estão apenas escritas — foram aplicadas contra um
PostgreSQL 16 real, sobre o schema gerado a partir de `prisma/schema.prisma`,
com dois tenants e os papéis separados da Fase 0. Resultados observados:

| Cenário | Resultado |
|---|---|
| Aplicar a migração dentro de uma transação (como o Prisma faz) | ok, sem erro |
| 18 tabelas com `relrowsecurity` **e** `relforcerowsecurity` | 18/18 |
| Consulta sem escopo, como `discipular_app` | **0 linhas** |
| Consulta sem escopo, como o **dono** das tabelas (prova do `FORCE`) | **0 linhas** |
| Consulta sem escopo, como **superusuário** | vê tudo — limite conhecido |
| Com escopo no tenant A: `SELECT count(*) FROM pessoas` | só as do A |
| Com escopo em A: `... WHERE "tenantId" = '<B>'` | 0 linhas |
| Com escopo em A: `INSERT` com `"tenantId"` = B | recusado pelo `WITH CHECK` |
| Com escopo em A: `UPDATE ... SET "tenantId" = '<B>'` | recusado pelo `WITH CHECK` |
| `set_config(..., is_local => true)` sobrevive ao `COMMIT`? | não — some, como esperado |
| `ALTER DATABASE ... SET app.rls_estrito` como migrator | negado (é o desejado) |
| `SET app.rls_estrito = 'off'` como `discipular_app`, na sessão | **permitido** — ver Fase 4 |
| `pg_dump` como dono, com RLS forçada | erro, exit 1 |
| `pg_dump --enable-row-security` | exit 0 e **dump vazio** |
| 18 índices da migração `_indices` (inclusive o GIN de trigrama) | criados |
| Planos usam os índices novos **sem** RLS | sim |
| Planos usam os índices novos **com** RLS | **não** — ver 6.4 |
| Planos com RLS **+** marcações `LEAKPROOF` | voltam ao ótimo |

O que **não** foi verificado e continua sendo trabalho da Fase 2: o
comportamento da aplicação Next.js sob RLS — pressão no pool do Prisma com 90
sessões, latência das transações interativas e o inventário de chamadas a
`$queryRaw`. Nada disso se prova em `psql`.

---

## 9. Resumo em uma frase

Hoje quem protege os dados das igrejas é `src/lib/db/tenant-client.ts`. O RLS
está escrito, revisado e versionado, mas desligado por um interruptor
documentado; ele só vira defesa de verdade depois da Fase 2 (código) e da
Fase 3 (o interruptor). Qualquer pessoa que afirmar o contrário antes disso
está enganada — e este parágrafo existe para que a afirmação seja fácil de
conferir.
