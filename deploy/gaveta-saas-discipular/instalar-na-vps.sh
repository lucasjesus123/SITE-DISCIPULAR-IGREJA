#!/usr/bin/env bash
# =============================================================================
# GAVETA SAAS-DISCIPULAR — instalação numa VPS Ubuntu COMPARTILHADA
#
# Roda NA VPS, como root. Ubuntu 24.04. Servidor de 1 núcleo / 4 GB.
#
# O que faz (tudo idempotente — pode rodar de novo sem estragar):
#   1. Verifica o terreno e MOSTRA os sites que já existem (não mexe neles).
#   2. Cria swap de 4 GB (necessário para compilar o Next com só 4 GB de RAM).
#   3. Instala Docker + plugin compose, se faltarem.
#   4. Gera segredos fortes e escreve o .env (permissão 600).
#   5. Sobe o app em Docker, escutando SÓ em 127.0.0.1:3000 (não abre porta
#      para a internet — quem faz isso é o nginx do host).
#   6. Roda as migrations do banco.
#   7. Instala o bloco nginx DESTA gaveta, ao lado dos outros sites, e recarrega
#      o nginx APENAS se o teste de configuração passar.
#
# NÃO toca em nenhum outro site, nem em nenhum outro bloco nginx.
#
# Uso:
#   bash instalar-na-vps.sh SEU_DOMINIO.com.br
#   # opcional: SEMEAR=1 para popular com as igrejas de demonstração
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# 0. Parâmetros
# ---------------------------------------------------------------------------
DOMINIO="${1:-}"
GAVETA="/var/www/saas-discipular"
PORTA_INTERNA="3000"
COMPOSE="docker compose -f docker-compose.yml -f deploy/gaveta-saas-discipular/docker-compose.override.yml"

vermelho() { printf '\033[31m%s\033[0m\n' "$*"; }
verde()    { printf '\033[32m%s\033[0m\n' "$*"; }
amarelo()  { printf '\033[33m%s\033[0m\n' "$*"; }
titulo()   { printf '\n\033[1;36m== %s ==\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  vermelho "Rode como root (use: sudo bash $0 ...)."; exit 1
fi
if [[ -z "$DOMINIO" ]]; then
  vermelho "Faltou o domínio. Uso: bash instalar-na-vps.sh SEU_DOMINIO.com.br"; exit 1
fi
if ! [[ "$DOMINIO" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  vermelho "Domínio em formato estranho: '$DOMINIO'. Confira e tente de novo."; exit 1
fi

# ---------------------------------------------------------------------------
# 1. Terreno — mostra o que já existe, sem mexer
# ---------------------------------------------------------------------------
titulo "Verificando o terreno (nada é alterado nesta etapa)"
echo "Sistema: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME" || echo desconhecido)"
echo "Memória: $(free -h | awk '/Mem:/{print $2}') · Disco livre: $(df -h / | awk 'NR==2{print $4}')"

if command -v nginx >/dev/null 2>&1; then
  verde "nginx já instalado — vou apenas ADICIONAR uma gaveta ao lado dos seus sites."
  echo "Sites nginx já ativos (NÃO serão tocados):"
  ls -1 /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/   • /' || echo "   (nenhum)"
else
  amarelo "nginx ainda não instalado — vou instalar (não havia sites nginx antes)."
fi

# Confirma que a porta interna está livre (se outro site usar a 3000, troca).
if ss -ltn 2>/dev/null | grep -q ":${PORTA_INTERNA} "; then
  amarelo "A porta ${PORTA_INTERNA} já está em uso. Vou usar a 3001 para esta gaveta."
  PORTA_INTERNA="3001"
fi

# ---------------------------------------------------------------------------
# 2. Swap — imprescindível para compilar o Next com 4 GB
# ---------------------------------------------------------------------------
titulo "Memória de troca (swap)"
if swapon --show 2>/dev/null | grep -q .; then
  verde "Swap já existe: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
else
  amarelo "Sem swap. Criando 4 GB (necessário para o build não travar por falta de RAM)."
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  verde "Swap de 4 GB criado e ativado."
fi

# ---------------------------------------------------------------------------
# 3. Docker
# ---------------------------------------------------------------------------
titulo "Docker"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  verde "Docker + compose já instalados."
else
  amarelo "Instalando Docker (script oficial)..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  verde "Docker instalado."
fi

# ---------------------------------------------------------------------------
# 4. Segredos e .env
# ---------------------------------------------------------------------------
titulo "Configuração (.env)"
cd "$GAVETA"

if [[ -f .env ]]; then
  verde ".env já existe — mantendo seus segredos atuais (não regenero, para não deslogar ninguém)."
else
  amarelo "Gerando segredos fortes e escrevendo .env ..."
  SESSION_SECRET="$(openssl rand -base64 48)"
  ENCRYPTION_KEY="$(openssl rand -base64 32)"
  CSRF_SECRET="$(openssl rand -base64 32)"
  DB_SENHA="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"

  # Escrevemos o .env com printf (não heredoc): cada valor já foi expandido
  # pelo shell e é passado como argumento LITERAL a %s, sem re-parsing. Isso
  # elimina qualquer chance de a URL do banco (com &, ?, @) ser interpretada
  # como comando — a causa do "command not found" que alguns shells disparam.
  # A URL do banco usa `postgres` (nome do serviço Docker) como host, não localhost.
  umask 177
  {
    printf '%s\n' "# Gerado por instalar-na-vps.sh — NAO compartilhe este arquivo."
    printf '%s\n' "NODE_ENV=production"
    printf '%s\n' "ROOT_DOMAIN=${DOMINIO}"
    printf '%s\n' "APP_URL=https://${DOMINIO}"
    printf '%s\n' "PORT=${PORTA_INTERNA}"
    printf '%s\n' "TRUSTED_PROXY_HOPS=1"
    printf '%s\n' "TZ=America/Sao_Paulo"
    printf '%s\n' "POSTGRES_ADMIN_USER=discipular"
    printf '%s\n' "POSTGRES_ADMIN_PASSWORD=${DB_SENHA}"
    printf '%s\n' "POSTGRES_DB=discipular"
    printf '%s\n' "DATABASE_URL=postgresql://discipular:${DB_SENHA}@postgres:5432/discipular?schema=public&connection_limit=10&pool_timeout=20"
    printf '%s\n' "DIRECT_DATABASE_URL=postgresql://discipular:${DB_SENHA}@postgres:5432/discipular?schema=public"
    # Backup (perfil 'backup') — mesmo usuário do banco nesta VPS pequena.
    printf '%s\n' "BACKUP_DB_USER=discipular"
    printf '%s\n' "BACKUP_DB_PASSWORD=${DB_SENHA}"
    printf '%s\n' "BACKUP_RETENCAO_DIAS=14"
    printf '%s\n' "SESSION_SECRET=${SESSION_SECRET}"
    printf '%s\n' "ENCRYPTION_KEY=${ENCRYPTION_KEY}"
    printf '%s\n' "CSRF_SECRET=${CSRF_SECRET}"
    printf '%s\n' "STORAGE_DIR=/var/lib/discipular/storage"
    printf '%s\n' "MAX_UPLOAD_BYTES=5242880"
    printf '%s\n' "YOUTUBE_API_KEY="
    printf '%s\n' "SMTP_HOST="
    printf '%s\n' "SMTP_PORT=587"
    printf '%s\n' "SMTP_USER="
    printf '%s\n' "SMTP_PASSWORD="
    printf '%s\n' "SMTP_FROM=Discipular <nao-responda@${DOMINIO}>"
    printf '%s\n' "LOG_LEVEL=info"
  } > .env
  umask 022
  chmod 600 .env
  verde ".env criado com segredos únicos (permissão 600)."
fi

# ---------------------------------------------------------------------------
# 5. Build + subir (Postgres antes, para as migrations terem banco)
# ---------------------------------------------------------------------------
titulo "Construindo a imagem (pode levar alguns minutos na primeira vez)"
$COMPOSE build

titulo "Subindo o banco de dados"
$COMPOSE up -d postgres
echo "Aguardando o Postgres ficar pronto..."
for i in $(seq 1 40); do
  if $COMPOSE exec -T postgres pg_isready -U discipular -d discipular >/dev/null 2>&1; then break; fi
  sleep 2
done

# ---------------------------------------------------------------------------
# Migrations + seed num contêiner Node DESCARTÁVEL (como root).
#
# Por que não pelas imagens do compose:
#   - o 'migrador' roda como usuário 1001 e não consegue gravar o engine do
#     Prisma em node_modules (erro "Can't write to @prisma/engines");
#   - a imagem de produção do 'app' é standalone: não tem o CLI do Prisma nem
#     o script de seed, e não tem HOME gravável para o npm.
# Este contêiner tem o node_modules completo, roda como root (escrita liberada)
# e fica na MESMA rede do banco, então resolve o host 'postgres'.
# ---------------------------------------------------------------------------
titulo "Migrando o banco${SEMEAR:+ e semeando a sua igreja}"
REDE_DADOS="$(docker network ls --format '{{.Name}}' | grep -E '(^|_)dados$' | grep discipular | head -1)"
REDE_DADOS="${REDE_DADOS:-discipular_dados}"

COMANDO_DB="npm ci --no-audit --no-fund && npx prisma generate && npx prisma migrate deploy"
if [[ "${SEMEAR:-0}" == "1" ]]; then
  COMANDO_DB="${COMANDO_DB} && npm run db:seed"
fi

if docker run --rm --network "$REDE_DADOS" -v "$PWD":/app -w /app --env-file .env \
      -e HOME=/root \
      -e SEED_PERMITIR_PRODUCAO=sim \
      -e SEED_ADMIN_EMAIL="admin@${DOMINIO}" \
      node:22-bookworm-slim \
      sh -c "$COMANDO_DB"; then
  verde "Banco migrado com sucesso."
  if [[ "${SEMEAR:-0}" == "1" ]]; then
    amarelo ">>> ANOTE AGORA as senhas impressas acima (super admin: admin@${DOMINIO}). Só aparecem uma vez."
  fi
else
  vermelho "Falha ao migrar/semear o banco. Copie o erro acima e me envie."
  exit 1
fi

titulo "Subindo a aplicação"
$COMPOSE up -d app
verde "App no ar internamente em http://127.0.0.1:${PORTA_INTERNA}"

# ---------------------------------------------------------------------------
# 6. Gaveta nginx (ao lado dos outros sites)
# ---------------------------------------------------------------------------
titulo "Instalando a gaveta nginx (sem tocar nos outros sites)"
if ! command -v nginx >/dev/null 2>&1; then
  apt-get update -y && apt-get install -y nginx
fi

CONF_ORIGEM="$GAVETA/deploy/gaveta-saas-discipular/nginx-saas-discipular.conf.template"
CONF_DESTINO="/etc/nginx/sites-available/saas-discipular.conf"

sed -e "s/__DOMINIO__/${DOMINIO}/g" \
    -e "s#http://127.0.0.1:3000#http://127.0.0.1:${PORTA_INTERNA}#g" \
    "$CONF_ORIGEM" > "$CONF_DESTINO"

ln -sf "$CONF_DESTINO" /etc/nginx/sites-enabled/saas-discipular.conf

# Testa ANTES de recarregar. Se o teste falhar, NÃO recarrega — os outros
# sites continuam no ar exatamente como estavam.
if nginx -t; then
  systemctl reload nginx
  verde "Gaveta nginx ativa. O nginx foi recarregado sem afetar os outros sites."
else
  vermelho "O teste do nginx falhou. NÃO recarreguei — seus outros sites seguem intactos."
  vermelho "A configuração desta gaveta está em: $CONF_DESTINO (revise e rode: nginx -t && systemctl reload nginx)"
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. Próximos passos
# ---------------------------------------------------------------------------
titulo "Pronto — gaveta SAAS-DISCIPULAR instalada"
cat <<FIM

  Onde ficou:      $GAVETA   (a "gaveta" isolada)
  App (interno):   127.0.0.1:${PORTA_INTERNA}   (Docker; não exposto direto)
  Banco:           Postgres em container (não exposto à internet)
  Nginx:           bloco próprio, ao lado dos seus outros sites

  FALTA VOCÊ FAZER (2 passos):

  1) DNS — no painel do seu domínio, crie um registro A:
        ${DOMINIO}   ->   (o IP desta VPS: 179.197.78.218)
     Para o SaaS multi-igrejas por subdomínio, crie também um curinga:
        *.${DOMINIO} ->   (mesmo IP)
     Aguarde a propagação (minutos a algumas horas).

  2) HTTPS — depois que o DNS propagar, rode nesta VPS:
        bash $GAVETA/deploy/ativar-https.sh ${DOMINIO} seu-email@exemplo.com
     (se esse arquivo não existir, use: certbot --nginx -d ${DOMINIO} -d www.${DOMINIO})

  COMANDOS ÚTEIS (rode dentro de $GAVETA):
     Ver logs:      $COMPOSE logs -f app
     Reiniciar:     $COMPOSE restart app
     Atualizar:     git pull && $COMPOSE up -d --build
     Criar 1ª igreja / super admin: $COMPOSE run --rm app npm run db:seed
        (ou crie manualmente pelo painel /plataforma depois de definir um admin)

FIM
verde "Instalação concluída."
