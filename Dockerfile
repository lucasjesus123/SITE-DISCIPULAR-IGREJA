# =============================================================================
# Discipular SaaS — imagem de produção
#
# Build multi-stage. A imagem final contém APENAS:
#   - o runtime do Node 22
#   - a saída `standalone` do Next (que já traz só os módulos realmente
#     importados pelo código de servidor — nenhuma devDependency)
#   - os assets estáticos e a engine do Prisma
#
# O que ela NÃO contém: código-fonte TypeScript, .git, node_modules completo,
# CLI do Prisma, ESLint, TypeScript. Menos bytes é menos superfície de ataque.
#
# Construir:   docker build -t discipular:latest .
# Migrações:   docker build --target migrador -t discipular-migrador:latest .
# =============================================================================

# Fixamos a MINOR do Node. "node:22-alpine" flutuante faria a imagem mudar
# sozinha entre dois builds do mesmo commit — o oposto de um deploy previsível.
ARG NODE_VERSION=22.14-alpine3.21

# -----------------------------------------------------------------------------
# Estágio base — dependências de sistema comuns a todos os estágios
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base

# openssl: a engine de query do Prisma faz dlopen em libssl. Sem isso o cliente
#          falha em runtime com "Unable to require libquery_engine".
# libc6-compat: alguns binários nativos assumem glibc; o shim resolve.
# tini: PID 1 de verdade. Sem ele o Node vira PID 1, ignora SIGTERM por padrão
#       e todo `docker stop` acaba em SIGKILL depois de 10s — conexões abertas
#       morrem no meio e o pool do Postgres fica com sessões zumbis.
RUN apk add --no-cache openssl libc6-compat tini

WORKDIR /app

# Nunca gerar telemetria do Next a partir de um servidor de produção.
ENV NEXT_TELEMETRY_DISABLED=1

# -----------------------------------------------------------------------------
# Estágio deps — instala node_modules com cache de camada eficiente
# -----------------------------------------------------------------------------
FROM base AS deps

# Copiamos só os manifestos primeiro: enquanto eles não mudarem, o Docker
# reaproveita a camada de `npm ci` mesmo que todo o src/ tenha mudado.
COPY package.json package-lock.json* ./

# --ignore-scripts é deliberado: o postinstall do @prisma/client dispara
# `prisma generate`, que ainda não tem o schema copiado aqui. Além disso,
# rodar scripts arbitrários de pacotes de terceiros no build é vetor de
# supply chain — geramos o cliente explicitamente no estágio seguinte.
#
# `npm ci` exige package-lock.json. Se o lockfile não estiver commitado o
# build cai para `npm install`, mas isso torna a imagem NÃO reprodutível:
# commite o lockfile. Ver deploy/primeiros-passos.md.
RUN if [ -f package-lock.json ]; then \
      npm ci --ignore-scripts --no-audit --no-fund; \
    else \
      echo "AVISO: package-lock.json ausente — build nao reprodutivel." >&2; \
      npm install --ignore-scripts --no-audit --no-fund; \
    fi

# -----------------------------------------------------------------------------
# Estágio builder — gera o cliente Prisma e compila o Next
# -----------------------------------------------------------------------------
FROM base AS builder

# Cache-bust por commit: o deploy passa --build-arg GIT_SHA=<commit>. Quando o
# código muda, GIT_SHA muda e força recompilar A PARTIR DAQUI (as deps acima
# continuam em cache). Blinda contra o caso em que o Docker reaproveitava um
# COPY antigo e a imagem subia com código velho.
ARG GIT_SHA=dev
RUN echo "build do commit ${GIT_SHA}" > /tmp/.commit

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` roda com NODE_ENV=production, e src/lib/env.ts valida o ambiente
# no import. Sem estas variáveis o build quebra na coleta de páginas.
#
# ATENÇÃO: são valores DESCARTÁVEIS, existem só para satisfazer o Zod durante a
# compilação. Nenhum deles vai para a imagem final (este estágio é descartado) e
# nenhum é usado em runtime — o container recebe os segredos reais por env.
# Não substitua por segredos verdadeiros: eles ficariam gravados no histórico
# de camadas da imagem e visíveis com `docker history`.
ENV NODE_ENV=production \
    DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    DIRECT_DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public" \
    SESSION_SECRET="YnVpbGQtb25seS1zZXNzYW8tbmFvLXVzYXItZW0tcHJvZHVjYW8tMDAwMDAwMDAx" \
    ENCRYPTION_KEY="YnVpbGQtb25seS1jaWZyYS0tbmFvLXVzYXItZW0tcHJvZHVjYW8tMDAwMDAwMDAy" \
    CSRF_SECRET="YnVpbGQtb25seS1jc3JmLS0tbmFvLXVzYXItZW0tcHJvZHVjYW8tMDAwMDAwMDAz" \
    ROOT_DOMAIN="exemplo.invalid" \
    APP_URL="https://exemplo.invalid"

# `npm run build` = prisma generate && next build.
# O generate roda aqui dentro do Alpine, então o binaryTarget "native" resolve
# para linux-musl-openssl-3.0.x — o mesmo do estágio final. Buildar em Debian e
# rodar em Alpine é o erro clássico que produz engine incompatível.
RUN npm run build

# -----------------------------------------------------------------------------
# Estágio migrador — imagem separada, usada só para `prisma migrate deploy`
#
# Migração é DDL: precisa do CLI do Prisma (devDependency) e do usuário
# `discipular_migrator`. Nada disso pode viver na imagem que atende requisição.
# Se a aplicação em produção fosse capaz de rodar DDL, um RCE viraria DROP TABLE.
#
#   docker compose --profile migracao run --rm migrador
# -----------------------------------------------------------------------------
FROM base AS migrador

ENV NODE_ENV=production
# Cache-bust por commit (mesma ideia do builder): garante que uma migração nova
# seja sempre incluída, mesmo que o cache tentasse reaproveitar o COPY prisma.
ARG GIT_SHA=dev
RUN echo "migrador do commit ${GIT_SHA}" > /tmp/.commit
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma

RUN addgroup -g 1001 -S discipular && adduser -u 1001 -S discipular -G discipular
USER 1001:1001

ENTRYPOINT ["/sbin/tini", "--"]
# `migrate deploy` só aplica migrações já existentes: nunca gera nem apaga
# nada, ao contrário de `migrate dev`. É o único comando seguro em produção.
CMD ["npx", "--no-install", "prisma", "migrate", "deploy"]

# -----------------------------------------------------------------------------
# Estágio runner — a imagem que vai para produção
# -----------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    STORAGE_DIR=/var/lib/discipular/storage

# Usuário não-root dedicado, uid/gid fixos em 1001.
# Fixar o uid importa para o volume: o dono dos arquivos gravados no host
# precisa bater com o usuário do container, senão o upload falha com EACCES
# (ou, pior, alguém "resolve" com chmod 777).
RUN addgroup -g 1001 -S discipular && adduser -u 1001 -S discipular -G discipular

# A saída standalone traz server.js + apenas os módulos rastreados pelo Next.
# Os estáticos e o public/ NÃO entram nela — precisam ser copiados à mão.
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=builder --chown=1001:1001 /app/public ./public

# A engine binária do Prisma é carregada por caminho, não por `require` comum,
# então o file tracing do Next às vezes a deixa de fora. Copiar explicitamente
# custa alguns MB e evita o clássico "Query engine library not found" às 3h.
COPY --from=builder --chown=1001:1001 /app/node_modules/.prisma/client ./node_modules/.prisma/client

# Diretório de uploads. Fica FORA de public/ de propósito: arquivo de igreja só
# sai por rota autenticada que valida o tenant (/api/arquivos/[id]).
# Em produção este caminho deve ser um volume — ver docker-compose.yml.
RUN mkdir -p ${STORAGE_DIR} && chown -R 1001:1001 ${STORAGE_DIR}

# Sistema de arquivos da aplicação pertence ao root e é só-leitura para o app.
# Assim, mesmo com execução de código arbitrário, o atacante não reescreve o
# próprio bundle para persistir. O compose complementa com read_only: true.
RUN chown -R root:root /app && chmod -R a-w /app

# Única exceção à regra acima: o Next grava o cache do otimizador de imagens em
# .next/cache. Sem este diretório gravável, toda <Image> de origem remota
# devolve 500. O compose monta um tmpfs aqui — cache não precisa sobreviver ao
# restart, e mantê-lo em memória evita que ele cresça sem controle no disco.
RUN mkdir -p /app/.next/cache && chown -R 1001:1001 /app/.next/cache

USER 1001:1001

EXPOSE 3000

# Healthcheck: abre uma conexão HTTP real contra o processo Node.
# Aceitamos qualquer status < 500 — o container é considerado saudável quando
# o servidor RESPONDE. Um 404 aqui é esperado: o Host "localhost" não pertence
# a nenhum tenant, e é justamente isso que resolverTenantPorHost deve devolver.
# Um 5xx, esse sim, indica processo degradado e dispara o restart.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||3000;require('http').get({host:'127.0.0.1',port:p,path:'/',timeout:4000,headers:{host:'localhost'}},r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1)).on('timeout',function(){this.destroy();process.exit(1)})"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
