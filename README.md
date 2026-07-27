# Discipular — SaaS multi-tenant para igrejas

**Site + Aplicativo (PWA) + Sistema de gestão, tudo integrado no mesmo código.**
Uma plataforma onde cada igreja cliente tem o seu próprio site (100% editável, whitelabel),
o seu aplicativo de membros e o seu painel de gestão — isolados uns dos outros e servidos pelo
domínio da própria igreja.

Design derivado do site de referência **Discipular Igreja** (estética editorial escura/dourada,
tipografia Fraunces + Instrument Sans).

---

## Por que esta stack

**Next.js 15 (App Router) + TypeScript + PostgreSQL + Prisma.** A escolha resolve, com um único
código, três produtos que normalmente seriam três projetos:

- **Um código servindo site, app e painel.** Menos superfície, menos duplicação, uma correção de
  segurança vale para os três.
- **Roteamento por domínio nativo.** O `middleware` do Next resolve qual igreja é a requisição a
  partir do hostname — é o que torna o multi-tenant por domínio próprio simples e seguro.
- **SSR para o SEO do site da igreja** e **PWA instalável** para os membros, sem loja de app.
- **Folga de sobra** para o alvo (30 igrejas, ~90 usuários simultâneos) numa VPS modesta. Não há
  motivo técnico para uma stack mais pesada. *(ver `AUDITORIA_SEGURANCA.md` §6.)*

---

## As 4 camadas de isolamento entre igrejas

O maior risco de um SaaS multi-empresa é vazar dado de uma igreja para outra. Aqui isso é barrado
por camadas independentes — nenhuma sozinha é suficiente:

```
requisição  ──►  1. HOSTNAME resolve o tenant        (src/lib/tenant/resolve.ts)
                    nunca query string / body / header
                        │
                        ▼
                 2. tenantDb injeta o filtro de tenant   (src/lib/db/tenant-client.ts)
                    em TODA query — impossível esquecer
                        │
                        ▼
                 3. RLS no Postgres (2ª rede, ver prisma/RLS.md)
                        │
                        ▼
                 4. verificação de propriedade nos serviços
```

Toda rota de UI de igreja recebe `ctx.db` (de `exigirPermissao`/`exigirAcessoTenant`), que já é
o cliente escopado. Importar o Prisma "cru" nessas rotas é **bloqueado pelo ESLint**
(`eslint.config.mjs`) — é um controle de segurança, não de estilo.

---

## Rodando localmente

Pré-requisitos: Node ≥ 22, PostgreSQL, e um truque de DNS para testar subdomínios.

```bash
# 1. Dependências
npm install

# 2. Ambiente — copie e preencha (gere segredos com: openssl rand -base64 48)
cp .env.example .env

# 3. Banco
npx prisma migrate dev
npm run db:seed          # cria 2 igrejas de demonstração + usuários (senhas impressas no console)

# 4. Subir
npm run dev
```

**Testando o multi-tenant no navegador:** subdomínios de `localhost` funcionam sem configurar
nada. Acesse:

- `http://discipular.localhost:3000` — site da 1ª igreja
- `http://videira.localhost:3000` — site da 2ª igreja (existe para provar o isolamento)
- `.../painel` — sistema de gestão · `.../app` — PWA dos membros · `.../login` — entrar

O super admin (dono do SaaS) fica em `http://localhost:3000/plataforma`.

---

## Estrutura de pastas

```
prisma/            schema (em português), migrations, RLS, seed, tuning do Postgres
src/
  middleware.ts    CSP com nonce, checagem de origem, contexto confiável (host/ip)
  lib/
    tenant/        resolução de igreja por hostname
    db/            prisma.ts (global) e tenant-client.ts (escopado — o coração do isolamento)
    auth/          sessão, senha (scrypt), RBAC, permissões (módulo puro), recuperação
    security/      rate limit, CSRF, cabeçalhos/CSP
    validation/    schemas Zod (allowlist, nunca denylist)
    services/      site, submissões, domínios
    site/          tema whitelabel (cores/fontes validadas por allowlist)
    youtube/       detecção de transmissão AO VIVO (cache + janelas de culto)
    storage/       upload por magic bytes, entrega privada por tenant
  app/
    (site)/        site público whitelabel de cada igreja
    app/           PWA dos membros
    painel/        sistema de gestão da igreja
    plataforma/    super admin (você)
    api/           endpoints públicos e de autenticação
deploy/            backup/restore, systemd, hardening da VPS
nginx/             proxy reverso (TLS, rate limit, bloqueio de Host forjado)
Dockerfile, docker-compose.yml
AUDITORIA_SEGURANCA.md   relatório de segurança
```

---

## Papéis e permissões

Autorização por papel, do menor privilégio para o maior (`src/lib/auth/permissoes.ts`):

| Papel | O que enxerga / pode |
|---|---|
| **MEMBRO** | Usa o app; vê os próprios dados. Nenhuma gestão. |
| **LIDER_CELULA** | **Apenas a própria célula** (pessoas, oração, relatório de encontro). |
| **SECRETARIA** | Cadastros e triagem do dia a dia. Sem dado pastoral sensível, sem usuários, sem site. |
| **PASTOR** | Gestão pastoral completa, incluindo observações sensíveis e edição do site. |
| **ADMIN** | Tudo dentro da própria igreja (usuários, config, auditoria). |
| *plataforma admin* | Gestão de igrejas e domínios. Entra numa igreja só por **impersonação auditada**. |

---

## Deploy (resumo)

1. Provisione a VPS seguindo `deploy/primeiros-passos.md` (usuário não-root, SSH por chave, ufw,
   fail2ban, **dois** usuários de banco: runtime sem DDL e migrator com DDL).
2. `docker compose up -d` **ou** o serviço `deploy/discipular.service` (systemd).
3. Nginx à frente (`nginx/discipular.conf`); vincule o domínio do cliente e emita TLS conforme
   `nginx/README.md`.
4. Backup automático (`deploy/backup.sh`) — e **teste o restore** (`deploy/restore.sh`).

Detalhes de operação e resposta a incidentes: ver `AUDITORIA_SEGURANCA.md` e os runbooks em
`deploy/`.

---

## Estado atual

**Pronto e buildando** (`npm run build` limpo): isolamento multi-tenant, autenticação e RBAC,
site whitelabel com editor de blocos, formulários de captação com triagem, painel de gestão
(pessoas, oração, batismos, células, agenda, cursos, mensagens, site, usuários, config,
auditoria), PWA dos membros, super admin com domínios e impersonação, indicador AO VIVO do
YouTube, uploads seguros, infra (Docker/Nginx/systemd/backup) e auditoria de segurança.

**Antes de produção com dados reais**, ver o plano priorizado em `AUDITORIA_SEGURANCA.md` §7 —
com destaque para: rodar as ferramentas de auditoria (gitleaks/semgrep), atualizar dependências
com CVE, e ativar o RLS de verdade.
