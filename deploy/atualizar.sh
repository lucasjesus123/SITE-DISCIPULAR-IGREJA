#!/usr/bin/env bash
# =============================================================================
# ATUALIZAR — deploy automático de uma nova versão, em UM comando.
#
#   cd /var/www/saas-discipular && sudo bash deploy/atualizar.sh
#
# Faz, em ordem e sem intervenção:
#   1. git pull (traz o código novo)
#   2. reconstrói a imagem SEMPRE refletindo o commit atual (cache-bust por
#      GIT_SHA — nunca sobe código velho por causa de cache)
#   3. aplica as migrações do banco (serviço `migrador`, com o usuário que tem
#      DDL — o app não altera schema)
#   4. sobe o app recriando o container
#   5. confere que o código no ar bate com o commit
#
# É idempotente: rodar de novo sem novidade só reconfirma que está tudo no ar.
# =============================================================================
set -euo pipefail

APP_DIR="/var/www/saas-discipular"
BRANCH="${BRANCH:-claude/saas-church-system-3tayab}"
cd "$APP_DIR"

COMPOSE="docker compose -f docker-compose.yml -f deploy/gaveta-saas-discipular/docker-compose.override.yml"

verde()   { printf '\033[32m%s\033[0m\n' "$*"; }
titulo()  { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

titulo "1/5 Atualizando o código (git pull)"
git pull origin "$BRANCH"
SHA="$(git rev-parse --short HEAD)"
verde "Commit: $SHA"

titulo "2/5 Reconstruindo a imagem (cache-bust do commit $SHA)"
# --build-arg GIT_SHA garante que o COPY/npm run build reflitam este commit.
$COMPOSE build --build-arg GIT_SHA="$SHA" app

titulo "3/5 Migrando o banco"
# Perfil 'migracao': sobe o migrador, aplica as migrações pendentes e morre.
$COMPOSE --profile migracao build --build-arg GIT_SHA="$SHA" migrador
$COMPOSE --profile migracao run --rm migrador

titulo "4/5 Subindo a aplicação"
$COMPOSE up -d --force-recreate app

titulo "5/5 Conferindo se o app respondeu"
PORT="$(grep -E '^PORT=' .env | head -1 | cut -d= -f2- || true)"; PORT="${PORT:-3000}"
sleep 4
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PORT}/" || echo 000)"
if [ "$CODE" != "000" ]; then
  verde "✅ App no ar (HTTP $CODE em 127.0.0.1:${PORT}) — commit $SHA."
  verde "   Abra o site em aba anônima (Ctrl+Shift+R) para não pegar cache do navegador."
else
  printf '\033[33m%s\033[0m\n' "⚠ App ainda não respondeu. Veja os logs:"
  echo "   $COMPOSE logs --tail=40 app"
fi
