# Auditoria de Segurança — Discipular SaaS

> Sistema multi-tenant para igrejas: **site whitelabel + PWA de membros + sistema de gestão**, tudo no mesmo código.
> Data da auditoria: 2026-07-27 · Escopo: todo o repositório · Método: leitura manual dirigida + `npm audit` + verificações automatizadas de padrão.

**Regras seguidas nesta auditoria:** nenhum segredo real é exibido; nenhum código foi alterado *para* a auditoria (as correções de build feitas antes são de engenharia, não de auditoria); cada achado separa **fato / hipótese / não verificado**; nada é marcado como seguro sem evidência.

---

## 1. Sumário executivo

Em linguagem simples: **a base de segurança do sistema é sólida e foi projetada, desde o início, em torno do problema mais perigoso de um SaaS multi-empresa — o vazamento de dados de uma igreja para outra.** O isolamento entre igrejas não depende de o programador lembrar de filtrar cada consulta: ele é imposto por uma camada central (`tenantDb`) e reforçado por outras três. Nos pontos que auditei manualmente, o isolamento se sustentou, inclusive contra o ataque clássico de trocar um ID na URL (IDOR).

O que **impede colocar dados reais em produção hoje** não são falhas de arquitetura, e sim itens de operação e de ativação:

1. **As ferramentas de rastreio de segredos e SAST não puderam ser executadas** (gitleaks, trufflehog, semgrep, osv-scanner, trivy não estão instaladas nesta máquina). A verificação manual não encontrou segredo commitado, mas isso **não substitui** o gitleaks rodando sobre todo o histórico do Git. → *ver §4.*
2. **Dependências com vulnerabilidade conhecida** (3 de severidade alta, todas transitivas do Next.js). Corrigível com atualização de versão. → *SEC-002.*
3. **A segunda camada de isolamento (RLS no Postgres) está escrita mas não ativada de verdade** — a defesa que está de pé em produção é a da aplicação (camadas 1, 2 e 4). Aceitável para começar, mas precisa ser fechado antes de escalar. → *SEC-004.*

Os **3 riscos mais graves**, em ordem:

| # | Risco | Severidade | Estado |
|---|---|---|---|
| SEC-001 | Ferramentas de auditoria de segredos/SAST não executadas — cobertura incompleta | ALTO (processo) | não verificado |
| SEC-002 | Dependências vulneráveis (postcss, sharp/libvips via Next) | ALTO | verificado |
| SEC-004 | RLS presente porém inativa; isolamento depende só da aplicação | MÉDIO | verificado |

**Veredito:** adequado para **piloto controlado** (poucas igrejas, dados reais com consentimento, monitoramento próximo). **Não** liberar cadastro aberto de 30 igrejas antes de resolver os itens "Corrigir imediatamente" e "Corrigir antes de escalar" da §7.

---

## 2. Stack identificada

- **Linguagem:** TypeScript (strict, `noUncheckedIndexedAccess`), Node.js ≥ 22.
- **Framework:** Next.js 15 (App Router), React 19.
- **Banco:** PostgreSQL (via Prisma 6). `directUrl` separado para migrations.
- **Acesso a dados:** Prisma Client, **sempre** através da extensão `tenantDb` para dados de igreja (`src/lib/db/tenant-client.ts`).
- **Validação:** Zod em todas as entradas (`src/lib/validation/*`).
- **Autenticação:** sessões opacas server-side, hash com HMAC no banco (`src/lib/auth/session.ts`); senhas com scrypt (`src/lib/auth/password.ts`).
- **Como é servido:** processo Node (`output: "standalone"`) atrás de **Nginx** (proxy reverso, TLS, rate limit), empacotado em **Docker** (`Dockerfile`, `docker-compose.yml`) ou via **systemd** (`deploy/discipular.service`). Multi-tenant por **hostname** (subdomínio `*.dominio` ou domínio próprio verificado).
- **Configuração relevante:** `.env.example` (placeholders, sem segredo), `next.config.ts` (cabeçalhos de segurança), `src/middleware.ts` (CSP com nonce, checagem de origem), `nginx/discipular.conf`, migrations em `prisma/migrations/`.

---

## 3. Vulnerabilidades encontradas

### SEC-001 — Cobertura de auditoria incompleta (ferramentas ausentes)
- **Severidade:** ALTO *(risco de processo, não de código)*
- **Categoria:** Gestão de vulnerabilidades / segredos
- **Evidência:** `gitleaks`, `trufflehog`, `semgrep`, `osv-scanner` e `trivy` não estão instalados nesta máquina (verificado por `command -v`).
- **Risco:** um segredo que tenha entrado e saído do código em algum commit **passado** não é detectável por leitura do estado atual — só uma varredura do histórico completo (`--all`) pega. Sem SAST, padrões de vulnerabilidade sutis podem passar.
- **Impacto:** um segredo vazado no histórico continua explorável mesmo após removido do HEAD.
- **Como corrigir (alto nível):** instalar e rodar as ferramentas sobre todo o histórico. Comandos:
  ```
  # Segredos (todo o histórico)
  gitleaks detect --source . --log-opts="--all" -v
  trufflehog git file://. --only-verified
  # SAST
  semgrep --config auto .
  # Dependências multi-linguagem
  osv-scanner -r .
  ```
- **Status:** não verificado (impossível executar no ambiente atual).

### SEC-002 — Dependências com vulnerabilidade conhecida
- **Severidade:** ALTO
- **Categoria:** Cadeia de suprimentos
- **Evidência:** `npm audit` reporta **3 vulnerabilidades altas**, todas transitivas do `next`:
  - `postcss` — *Path Traversal via sourceMappingURL* (GHSA-r28c-9q8g-f849). Superfície: **build-time**.
  - `sharp` < 0.35 — CVEs herdadas do `libvips` (CVE-2026-33327/33328/35590/35591). Superfície: otimização de imagem.
- **Risco:** o `postcss` é risco de build (não exposto em runtime na nossa config). O `sharp` só seria explorável processando imagem hostil; a config já restringe `remotePatterns` a `i.ytimg.com`/`img.youtube.com` e serve uploads pela rota própria (não pelo otimizador), o que **reduz** a exposição — mas não zera.
- **Impacto:** exploração exigiria condições específicas; ainda assim são "alto" por CVSS.
- **Como corrigir:** atualizar o Next.js para o patch mais recente da linha 15.x (que traz `postcss`/`sharp` corrigidos). **Não** aceitar a sugestão do `npm audit fix --force` (ela quer *rebaixar* para `next@9`, o que é um erro do resolvedor). Após atualizar, rodar `npm audit` de novo.
- **Status:** verificado.

### SEC-003 — `dangerouslySetInnerHTML` no tema do site
- **Severidade:** BAIXO
- **Categoria:** XSS (injeção de CSS)
- **Arquivo:** `src/app/(site)/layout.tsx:100`, `src/app/app/layout.tsx:65`, `src/app/login/page.tsx:31`
- **Evidência:** `<style dangerouslySetInnerHTML={{ __html: cssDoTema(dados.tema) }} />`.
- **Risco:** o cliente edita cores e fontes; se esses valores entrassem crus no CSS, seria injeção de CSS (defacement, exfiltração limitada por seletor de atributo).
- **Análise:** **mitigado.** `cssDoTema` só interpola valores que passaram por allowlist ancorada — cor por regex `^#[0-9a-fA-F]{3,8}$` (`corSegura`) e fonte por lista fechada (`fonteSegura`), em `src/lib/site/theme.ts`. Nenhum caractere `;`, `}` ou `(` do usuário alcança a folha de estilo. Confirmado que **não há** `dangerouslySetInnerHTML` com conteúdo textual de usuário em nenhuma página (os demais resultados do grep são comentários dizendo para *não* usar).
- **Como corrigir:** manter. Se um dia for possível, migrar cores para atributos `style` de um elemento (evita o `<style>` inline). Risco residual aceitável.
- **Status:** verificado (falso positivo de XSS clássico; injeção de CSS neutralizada por allowlist).

### SEC-004 — RLS presente mas não ativada em runtime
- **Severidade:** MÉDIO
- **Categoria:** Isolamento multi-tenant (defesa em profundidade)
- **Arquivo:** `prisma/migrations/*_rls/migration.sql`, `prisma/RLS.md`
- **Evidência:** as políticas de Row-Level Security existem, mas dependem de o app executar `SET LOCAL app.tenant_id` dentro de transação — o que ainda **não** está ligado no caminho de consulta do Prisma.
- **Risco:** hoje o isolamento em produção repousa nas camadas de **aplicação** (`tenantDb` + verificação de propriedade). Se algum dia alguém importar `prisma` cru numa rota e esquecer o filtro, a rede de segurança do banco não estaria lá para pegar.
- **Impacto:** hipótese — exige um bug de aplicação futuro para se materializar; não é explorável hoje sozinho.
- **Como corrigir:** conectar o app como usuário **sem** BYPASSRLS e envolver as queries num `SET LOCAL app.tenant_id` por requisição (o `prisma/RLS.md` descreve o plano e o trade-off com o pool). Até lá, a regra de ESLint (SEC-006) é a barreira que impede o gatilho.
- **Status:** verificado (documentado como pendente, honestamente, em `prisma/RLS.md`).

### SEC-005 — `style-src 'unsafe-inline'` na CSP
- **Severidade:** BAIXO
- **Categoria:** Cabeçalhos / CSP
- **Arquivo:** `src/lib/security/headers.ts`
- **Evidência:** a CSP usa `script-src` com nonce + `strict-dynamic` (forte), mas `style-src` inclui `'unsafe-inline'`.
- **Risco:** um XSS hipotético poderia injetar `<style>`; como `script-src` **não** tem `unsafe-inline`, não há execução de JS — o impacto fica em CSS.
- **Impacto:** baixo; é o preço do tema whitelabel e dos estilos inline do React.
- **Como corrigir:** possível endurecer com hash/nonce de estilo no futuro. Aceitável.
- **Status:** verificado (trade-off documentado no próprio arquivo).

### SEC-006 — Regra de ESLint estrita com exceções revisadas
- **Severidade:** BAIXO *(observação de manutenção)*
- **Arquivo:** `eslint.config.mjs`
- **Evidência:** a regra `no-restricted-imports` bloqueia `prisma` cru em `src/app/painel/**`, `app/**`, `(site)/**`. Existem **7 usos legítimos** de `prisma` cru no painel (auditados abaixo, todos seguros), que a regra sinalizaria.
- **Risco:** se a regra for silenciada em massa, perde o valor. Se for respeitada, força cada exceção a ser justificada.
- **Como corrigir:** manter a regra; marcar as 7 linhas legítimas com `// eslint-disable-next-line` e um comentário do porquê (todas tocam **modelos globais** — Tenant/User/Membership/Sessao — ou escopam `tenantId` à mão). Isso mantém a revisão consciente.
- **Status:** verificado (as 7 exceções são seguras — ver §5).

### SEC-007 — Reset de senha silencioso quando SMTP não configurado
- **Severidade:** BAIXO
- **Categoria:** Operação / disponibilidade
- **Arquivo:** `src/lib/auth/recuperacao.ts`, `src/lib/email/enviar.ts`
- **Evidência:** se as variáveis SMTP estiverem vazias, o pedido de reset responde "sucesso" (correto, anti-enumeração) mas o e-mail fica pendente e é só logado.
- **Risco:** operacional — o usuário acha que recebeu o link e não recebeu.
- **Como corrigir:** configurar SMTP em produção e monitorar o log por "E-mail PENDENTE". Não é falha de segurança; a resposta idêntica é **proposital** (evita enumeração de contas).
- **Status:** verificado.

---

## 4. Resultado das ferramentas automáticas

| Ferramenta | Executada? | Resultado |
|---|---|---|
| **Gitleaks** | ❌ ausente | `gitleaks detect --source . --log-opts="--all" -v` — **não pôde rodar**. Instalar: `brew install gitleaks` ou binário do GitHub `gitleaks/gitleaks`. Impacto da ausência: segredos no **histórico** não verificados. |
| **Trufflehog** | ❌ ausente | `trufflehog git file://. --only-verified` — não rodou. Instalar: `pip install trufflehog` ou binário oficial. |
| **Semgrep** | ❌ ausente | `semgrep --config auto .` — não rodou. Instalar: `pip install semgrep`. Impacto: sem SAST automatizado; a revisão foi manual. |
| **OSV-Scanner** | ❌ ausente | `osv-scanner -r .` — não rodou. Instalar: binário `google/osv-scanner`. |
| **Trivy** | ❌ ausente | `trivy fs .` — não rodou (relevante para a imagem Docker). |
| **npm audit** | ✅ | **3 vulnerabilidades altas** (postcss, sharp/libvips), todas transitivas do Next. Ver SEC-002. |
| **Verificação manual de segredos** | ✅ | `git grep` por padrões de segredo hardcoded: **nenhum encontrado**. Nenhum `.env` real rastreado (só `.env.example` com placeholders). *Não substitui o gitleaks sobre o histórico.* |

> **Nenhum valor sensível é exibido neste relatório.** A verificação manual olhou padrões, não conteúdo.

---

## 5. Análise multi-tenant

Esta é a seção mais importante para um SaaS multi-empresa. Respondendo explicitamente:

**O isolamento está garantido?** — Na camada de aplicação, **sim**, com evidência. Ele é imposto por 4 camadas:

1. **Resolução por hostname** (`src/lib/tenant/resolve.ts`): o tenant vem **exclusivamente** do domínio da requisição, nunca de query string, body, header ou path. Um usuário da Igreja A que troque qualquer parâmetro continua confinado à Igreja A, porque o host dele continua sendo o da Igreja A. Domínio próprio só resolve depois de **verificado por DNS** (impede sequestro de domínio).
2. **`tenantDb` (`src/lib/db/tenant-client.ts`)**: extensão do Prisma que **injeta o filtro de tenant em toda operação** sobre dados de igreja. Esquecer o filtro é impossível — a extensão o adiciona. Passar um `tenantId` divergente **lança `ViolacaoTenantError`**. `findUnique` é convertido em `findFirst` com escopo; `update`/`delete` verificam propriedade antes de mutar; modelo novo não classificado **falha fechado**.
3. **RLS no Postgres** — presente, **ainda não ativa** (ver SEC-004).
4. **Verificação de propriedade nos serviços** — o ID já chega filtrado; um ID de outra igreja simplesmente "não existe".

**Onde é aplicado?** — No `tenantDb`, usado por todo `ctx.db` (obtido de `exigirAcessoTenant`/`exigirPermissao` em `src/lib/auth/rbac.ts`). O `exigirAcessoTenant` ainda compara `sessao.tenantId === tenant.id` (o do hostname): um pastor da Igreja A que cole a URL do painel da Igreja B é **negado**.

**Depende do backend, do banco, do ORM ou do frontend?** — Do **backend + ORM** (camadas 1, 2, 4). O frontend nunca é fonte de autorização (o menu esconde itens por usabilidade; a barreira é server-side). O banco (RLS) ainda não participa.

**Há risco de IDOR?** — Auditei o vetor clássico. Exemplo verificado: em `src/app/painel/usuarios/acoes.ts`, alterar/remover um `Membership` por `id` primeiro resolve o alvo com `findFirst({ where: { id, tenantId: ctx.tenant.id } })`; se for de outra igreja, vem `null` e **nada acontece**. **IDOR prevenido** nesse caminho. Trocar ID em recursos que passam por `ctx.db` também é barrado, porque o registro de outra igreja não existe no cliente escopado.

**Toda query relevante filtra por tenant?** — As que passam por `ctx.db`, **sim, automaticamente**. As **7** que usam `prisma` cru no painel foram auditadas uma a uma:

| Arquivo | Uso | Veredito |
|---|---|---|
| `painel/auditoria/page.tsx:195` | `membership` (global) com `where: { tenantId }` à mão | seguro |
| `painel/pessoas/acoes.ts:173` | `tenant.findUnique` (global, própria igreja) | seguro |
| `painel/configuracoes/acoes.ts` | `tenant` + `membership` da própria igreja | seguro |
| `painel/usuarios/acoes.ts` | `membership`/`user`/`sessao` (globais); alvo resolvido com `tenantId` antes de mutar | seguro |
| `painel/minha-conta/page.tsx` | `user`/`sessao` do **próprio** userId | seguro |

**Há RLS ou mecanismo equivalente?** — RLS escrito, inativo (SEC-004). O mecanismo equivalente **ativo** é o `tenantDb`.

**Endpoints críticos sem escopo de tenant?** — Não encontrados na amostra. O único caminho sem escopo automático (prisma cru) foi 100% auditado acima.

**O que precisa mudar para o isolamento ser considerado aceitável para escalar?** — (a) ativar RLS de verdade; (b) marcar as 7 exceções com `eslint-disable` justificado para a regra continuar afiada; (c) rodar semgrep para uma segunda opinião automatizada.

---

## 6. Escalabilidade (alvo: 30 empresas, até 5 usuários cada, ~90 simultâneos, VPS própria)

**A stack aguenta?** — Sim, com folga, para esse alvo. 90 conexões simultâneas é modesto para Node + Postgres numa VPS de 4 vCPU / 8 GB. O gargalo provável é **o pool de conexões do banco**, não CPU.

- **Pool de conexões:** o `DATABASE_URL` fixa `connection_limit` (ver `.env.example`). Com múltiplos processos Node, dimensionar `connection_limit × nº de processos ≤ max_connections` do Postgres (ver `prisma/postgresql.conf.exemplo`). **Verificar** esse casamento antes de subir carga.
- **Índices:** as tabelas multi-tenant têm índices **começando por `tenantId`** (`@@index([tenantId, ...])` no schema), o que é exatamente o necessário para os filtros por igreja. Há migração de índices adicionais (parciais e de busca) em `prisma/migrations/*_indices`.
- **N+1:** as consultas do site usam `select` explícito e `Promise.all`; a resolução de tenant é deduplicada por requisição com `cache()` do React. Bom.
- **Paginação:** presente e com **teto** (máx. 100/página) — evita `?limite=1000000` virar DoS.
- **YouTube ao vivo:** com **cache no banco + janelas de culto + backoff**, protege a cota da API (10.000 u/dia); sem isso, uma igreja movimentada derrubaria a integração de todas.
- **Rate limit:** persistido em Postgres (funciona com múltiplos processos); pesa uma escrita por requisição limitada — só em rotas sensíveis. Se o volume crescer muito, o ponto de troca para Redis é um módulo só (`src/lib/security/rate-limit.ts`).
- **Jobs pesados / uploads:** upload valida magic bytes e tem teto de tamanho e de storage por tenant. Não há job pesado no processo web.

**Infra:** `docker-compose.yml` define limites de recurso; há `nginx` (proxy, TLS, rate limit, bloqueio de Host forjado com 444), `deploy/backup.sh` + `restore.sh` (com nota de **testar o restore**), `deploy/primeiros-passos.md` (ufw, fail2ban, unattended-upgrades, 2 usuários de banco). **Recomenda-se** adicionar healthcheck+restart (já no compose/systemd) e monitoramento de CPU/memória/disco/conexões (a documentar operacionalmente).

**Precisa trocar de stack?** — **Não.** Não há motivo técnico. A stack atende o alvo com margem; os ajustes são de configuração (pool, índices já previstos, monitoramento), não de reescrita.

---

## 7. Plano de correção priorizado

### Corrigir imediatamente (bloqueia produção com dados reais)
1. **Rodar as ferramentas de auditoria ausentes** (SEC-001): gitleaks sobre `--all`, semgrep, osv-scanner. Tratar o que aparecer.
2. **Atualizar o Next.js** para o patch mais recente da 15.x e re-rodar `npm audit` até zerar as 3 altas (SEC-002). **Não** usar `audit fix --force`.
3. **Configurar segredos reais** (`SESSION_SECRET`, `ENCRYPTION_KEY`, `CSRF_SECRET` distintos, via `openssl rand -base64 48`) e os **dois** usuários de banco (runtime sem DDL, migrator com DDL). O `env.ts` já recusa subir produção com placeholders.

### Corrigir antes de escalar (antes de abrir para muitas igrejas)
4. **Ativar RLS de verdade** (SEC-004): app sem BYPASSRLS + `SET LOCAL app.tenant_id` por requisição. Fechar a 3ª camada.
5. **Marcar as 7 exceções de `prisma` cru** com `eslint-disable` justificado (SEC-006) e ligar o `lint` no CI como *gate*.
6. **Configurar SMTP** e monitorar reset de senha (SEC-007).
7. **Validar o casamento pool × max_connections** e habilitar monitoramento de recursos na VPS.

### Melhorias recomendadas (importantes, não bloqueadoras)
8. Endurecer `style-src` da CSP com hash/nonce (SEC-005).
9. Testar o **restore** do backup num ambiente separado (o backup nunca restaurado não é backup).
10. Adicionar testes automatizados de isolamento (dois tenants no seed já permitem: "usuário da Igreja A não enxerga nada da Igreja B").

### Pode esperar (baixo risco / melhoria futura)
11. Rotação documentada de segredos.
12. Trocar rate limit para Redis se/quando o volume justificar.

---

## Apêndice — o que foi verificado com evidência vs. hipótese

- **Fato (verificado):** ausência de segredo hardcoded e de `.env` rastreado; 3 vulns do `npm audit`; isolamento por hostname; `tenantDb` injeta e valida tenant; IDOR barrado em `usuarios/acoes.ts`; as 7 exceções de prisma cru são globais/escopadas; cookies de sessão com `httpOnly`+`secure`+`sameSite`; CSP com nonce sem `unsafe-inline` em script; build e typecheck limpos.
- **Hipótese:** SEC-004 (RLS) só se materializa com bug futuro de aplicação; exposição do `sharp` depende de processamento de imagem hostil, reduzida pela config.
- **Não verificado:** histórico completo do Git quanto a segredos (falta gitleaks); SAST completo (falta semgrep); imagem Docker (falta trivy). Esses três só fecham com as ferramentas instaladas.
