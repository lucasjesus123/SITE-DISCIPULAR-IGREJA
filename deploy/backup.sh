#!/bin/sh
# =============================================================================
# Discipular SaaS — backup diário do Postgres + dos arquivos das igrejas
#
# -----------------------------------------------------------------------------
# COMO TESTAR O RESTORE  (leia isto antes de confiar neste script)
#
# Backup que nunca foi restaurado NÃO é backup: é um arquivo grande de valor
# desconhecido. Dump corrompido, dump de banco vazio, dump de outro servidor,
# dump sem a tabela nova da última migração — nada disso aparece até a hora em
# que você mais precisa. Este script verifica a integridade do que gera, mas
# verificação de integridade só prova que o arquivo é LEGÍVEL, não que ele
# reconstrói o sistema.
#
# Faça este ensaio no PRIMEIRO DIA ÚTIL DE CADA MÊS, com o sistema no ar:
#
#   1. Crie um banco descartável no mesmo servidor:
#        docker compose exec postgres \
#          psql -U "$POSTGRES_ADMIN_USER" -c 'CREATE DATABASE ensaio_restore;'
#
#   2. Restaure nele o backup MAIS RECENTE (nunca o mais antigo — você quer
#      testar o que restauraria de verdade numa emergência):
#        ./deploy/restore.sh --arquivo /var/backups/discipular/discipular-AAAA-MM-DD.dump \
#                            --banco ensaio_restore
#
#   3. Confira que os dados chegaram inteiros, e não só que o comando passou:
#        docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d ensaio_restore -c "
#          SELECT (SELECT count(*) FROM tenants)   AS igrejas,
#                 (SELECT count(*) FROM pessoas)   AS pessoas,
#                 (SELECT count(*) FROM submissoes) AS submissoes,
#                 (SELECT max(\"criadoEm\") FROM audit_logs) AS ultimo_evento;"
#      O `ultimo_evento` tem que ser de ontem. Se for de três meses atrás, o
#      backup vem falhando em silêncio desde então.
#
#   4. Confira que as MIGRAÇÕES batem com o código em produção:
#        SELECT migration_name FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 3;
#
#   5. Derrube o banco de ensaio:
#        docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" \
#          -c 'DROP DATABASE ensaio_restore;'
#
#   6. Anote no runbook: data do ensaio, tamanho do dump, tempo de restore.
#      O tempo de restore é o seu RTO real — é o número que você vai dar para
#      a igreja quando ela perguntar "em quanto tempo volta?".
#
# -----------------------------------------------------------------------------
# COMO RODAR
#
#   Com Docker (agendado pelo cron do HOST):
#     docker compose --profile backup run --rm backup
#
#   Direto no host (instalação via systemd):
#     PGHOST=localhost PGUSER=discipular_backup PGPASSWORD=... \
#     PGDATABASE=discipular DIR_BACKUP=/var/backups/discipular \
#     sh deploy/backup.sh
#
#   Agendamento sugerido (crontab -e do root), 03:10 todo dia:
#     10 3 * * * cd /opt/discipular && docker compose --profile backup run --rm backup >> /var/log/discipular-backup.log 2>&1
#
# Códigos de saída: 0 sucesso | 1 falha (o cron manda e-mail) | 2 já rodando.
# =============================================================================

set -eu

# `pipefail` não é POSIX, mas o ash do Alpine e o bash aceitam. Sem ele, um
# `pg_dump | gzip` mascararia a falha do pg_dump com o sucesso do gzip.
# shellcheck disable=SC3040
(set -o pipefail 2>/dev/null) && set -o pipefail

# Dump contém dado pessoal de milhares de membros de igreja. Nasce 0600.
umask 077

# -----------------------------------------------------------------------------
# Configuração
# -----------------------------------------------------------------------------
DIR_BACKUP="${DIR_BACKUP:-/backups}"
DIR_ARQUIVOS="${DIR_ARQUIVOS:-/dados/arquivos}"
RETENCAO_DIAS="${RETENCAO_DIAS:-14}"
PGDATABASE="${PGDATABASE:-discipular}"

# Tamanho mínimo aceitável para o dump, em bytes. Um dump de 2 KB é o retrato
# de um `pg_dump` que conectou num banco vazio — o cenário mais perigoso,
# porque ele "funciona" e ainda por cima passa na verificação de integridade.
# Ajuste conforme o banco cresce (o log imprime o tamanho real todo dia).
MINIMO_BYTES="${MINIMO_BYTES:-51200}"

CARIMBO="$(date +%Y-%m-%d_%H%M%S)"
DIA="$(date +%Y-%m-%d)"
ARQ_DUMP="${DIR_BACKUP}/discipular-${DIA}.dump"
ARQ_ARQUIVOS="${DIR_BACKUP}/arquivos-${DIA}.tar.gz"
ARQ_SOMAS="${DIR_BACKUP}/SHA256SUMS-${DIA}.txt"
DIR_LOCK="${DIR_BACKUP}/.backup.lock.d"

log() { printf '%s [backup] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
falhar() { log "ERRO: $*"; exit 1; }

# -----------------------------------------------------------------------------
# Trava de execução única
#
# Dois pg_dump simultâneos disputam I/O, dobram o uso de conexão e podem
# gerar dois arquivos parciais com o mesmo nome. Acontece quando um backup
# demora mais que o intervalo do cron — justamente à medida que a base cresce.
#
# `mkdir` é a primitiva de exclusão mútua portátil: ou cria o diretório, ou
# falha, atomicamente, em qualquer sistema de arquivos. `flock` seria mais
# elegante, mas o busybox do Alpine não aceita `-E`, e sem ele não dá para
# distinguir "lock ocupado" de "o script falhou com código 1".
# -----------------------------------------------------------------------------
mkdir -p "$DIR_BACKUP" || falhar "não consegui criar ${DIR_BACKUP}"

# Lock com mais de 6 horas é resquício de execução morta (container derrubado,
# reboot no meio do dump). Sem esta limpeza, um kill -9 desliga o backup para
# sempre — e ninguém percebe, porque o script continua "saindo com sucesso".
if [ -d "$DIR_LOCK" ] && [ -z "$(find "$DIR_LOCK" -maxdepth 0 -mmin -360 2>/dev/null)" ]; then
    log "AVISO: lock com mais de 6h em ${DIR_LOCK}; assumindo execução morta e removendo."
    rm -rf "$DIR_LOCK"
fi

if ! mkdir "$DIR_LOCK" 2>/dev/null; then
    log "outro backup já está em execução (${DIR_LOCK}); saindo sem fazer nada."
    exit 2
fi
echo "$$" > "${DIR_LOCK}/pid" 2>/dev/null || true

# Libera o lock em qualquer saída, inclusive erro e Ctrl-C.
trap 'rm -rf "$DIR_LOCK"' EXIT
trap 'log "interrompido."; exit 1' INT TERM

# -----------------------------------------------------------------------------
# Verificações de ambiente
# -----------------------------------------------------------------------------
command -v pg_dump    >/dev/null 2>&1 || falhar "pg_dump não encontrado no PATH."
command -v pg_restore >/dev/null 2>&1 || falhar "pg_restore não encontrado no PATH."

# PGPASSWORD é lido do ambiente pelo libpq. Nunca é impresso, nunca vai para a
# linha de comando (o que o exporia em `ps aux` para qualquer usuário do host).
[ -n "${PGPASSWORD:-}" ] || [ -f "${HOME:-/}/.pgpass" ] || \
    falhar "credencial ausente: defina PGPASSWORD ou use ~/.pgpass."

log "iniciando — banco=${PGDATABASE} host=${PGHOST:-local} destino=${DIR_BACKUP}"

# Espaço em disco. Backup que enche o disco derruba o Postgres junto: o
# incidente que você tentava prevenir vira o incidente que você causou.
LIVRE_KB="$(df -Pk "$DIR_BACKUP" 2>/dev/null | tail -n 1 | awk '{print $4}')"
[ -n "${LIVRE_KB:-}" ] || LIVRE_KB="$(df -k "$DIR_BACKUP" | tail -n 1 | awk '{print $4}')"
if [ "${LIVRE_KB:-0}" -lt 1048576 ]; then
    falhar "menos de 1 GB livre em ${DIR_BACKUP} (${LIVRE_KB} KB). Abortando antes de encher o disco."
fi

# -----------------------------------------------------------------------------
# 1. Dump do banco
# -----------------------------------------------------------------------------
# -Fc  : formato custom — comprimido, restaurável seletivamente (tabela a
#        tabela) e a única entrada aceita pelo pg_restore. SQL puro obrigaria
#        restaurar tudo ou nada.
# -Z 6 : compressão equilibrada. 9 economiza pouco e come CPU que a VPS não tem.
# --no-owner / --no-privileges : o dump não carrega os donos e GRANTs do
#        servidor de origem. Sem isso, restaurar numa máquina onde
#        `discipular_app` ainda não existe falha na primeira linha, e um
#        restore de emergência não é hora de descobrir isso.
TEMPORARIO="${ARQ_DUMP}.parcial"
rm -f "$TEMPORARIO"

log "gerando dump..."
if ! pg_dump --format=custom --compress=6 --no-owner --no-privileges \
             --file="$TEMPORARIO" "$PGDATABASE"; then
    rm -f "$TEMPORARIO"
    falhar "pg_dump falhou. Nenhum arquivo foi publicado."
fi

# -----------------------------------------------------------------------------
# 2. Verificação de integridade
#
# Gravamos em .parcial e só renomeamos depois que o arquivo passa nos testes.
# Assim nunca existe, no diretório de backup, um arquivo com nome definitivo e
# conteúdo quebrado — o que faria alguém restaurar lixo com confiança.
# -----------------------------------------------------------------------------
TAMANHO="$(wc -c < "$TEMPORARIO" | tr -d ' ')"
if [ "$TAMANHO" -lt "$MINIMO_BYTES" ]; then
    rm -f "$TEMPORARIO"
    falhar "dump com apenas ${TAMANHO} bytes (mínimo ${MINIMO_BYTES}). Banco vazio ou dump truncado?"
fi

# `pg_restore --list` percorre o índice (TOC) do arquivo inteiro. Se o dump
# estiver truncado ou corrompido, falha aqui — e não daqui a três meses.
log "verificando integridade do dump..."
TOC="${DIR_BACKUP}/.toc.$$"
if ! pg_restore --list "$TEMPORARIO" > "$TOC" 2>/dev/null; then
    rm -f "$TEMPORARIO" "$TOC"
    falhar "dump ilegível: pg_restore --list falhou. Arquivo descartado."
fi

# Presença dos dados, não só do schema. Um dump com `--schema-only` acidental
# passaria no teste acima sem conter uma única linha.
TABELAS_COM_DADOS="$(grep -c 'TABLE DATA' "$TOC" || true)"
if [ "${TABELAS_COM_DADOS:-0}" -lt 5 ]; then
    rm -f "$TEMPORARIO" "$TOC"
    falhar "dump com apenas ${TABELAS_COM_DADOS} tabelas com dados. Suspeito de schema-only ou banco errado."
fi

# As tabelas que, se faltarem, tornam o restore inútil. `tenants` é a raiz do
# isolamento multi-tenant; `pessoas` é o dado que a igreja não recupera de
# outro lugar; `_prisma_migrations` é o que permite saber em qual versão do
# schema este dump está.
for tabela in tenants pessoas _prisma_migrations; do
    grep -q "TABLE public ${tabela}" "$TOC" || {
        rm -f "$TEMPORARIO" "$TOC"
        falhar "tabela '${tabela}' ausente do dump. Banco errado ou migração não aplicada."
    }
done
rm -f "$TOC"

mv "$TEMPORARIO" "$ARQ_DUMP"
log "dump ok — ${ARQ_DUMP} (${TAMANHO} bytes, ${TABELAS_COM_DADOS} tabelas com dados)"

# -----------------------------------------------------------------------------
# 3. Arquivos enviados pelas igrejas
#
# Restaurar só o banco deixaria as linhas da tabela `arquivos` apontando para
# bytes que não existem mais. Banco e storage têm que voltar do mesmo dia.
# -----------------------------------------------------------------------------
if [ -d "$DIR_ARQUIVOS" ]; then
    log "compactando ${DIR_ARQUIVOS}..."
    TMP_ARQ="${ARQ_ARQUIVOS}.parcial"
    rm -f "$TMP_ARQ"
    if tar -czf "$TMP_ARQ" -C "$DIR_ARQUIVOS" . 2>/dev/null; then
        # `tar -tzf` relê o arquivo inteiro: pega gzip truncado por disco cheio.
        if tar -tzf "$TMP_ARQ" >/dev/null 2>&1; then
            mv "$TMP_ARQ" "$ARQ_ARQUIVOS"
            log "arquivos ok — ${ARQ_ARQUIVOS} ($(wc -c < "$ARQ_ARQUIVOS" | tr -d ' ') bytes)"
        else
            rm -f "$TMP_ARQ"
            falhar "tarball dos arquivos corrompido. Descartado."
        fi
    else
        rm -f "$TMP_ARQ"
        falhar "falha ao compactar ${DIR_ARQUIVOS}."
    fi
else
    log "AVISO: ${DIR_ARQUIVOS} não existe — backup só do banco nesta execução."
fi

# -----------------------------------------------------------------------------
# 4. Somas de verificação
#
# Detectam corrupção silenciosa no disco (bitrot) e alteração indevida. Confira
# antes de qualquer restore:  sha256sum -c SHA256SUMS-AAAA-MM-DD.txt
# -----------------------------------------------------------------------------
(
    cd "$DIR_BACKUP"
    if [ -f "$(basename "$ARQ_ARQUIVOS")" ]; then
        sha256sum "$(basename "$ARQ_DUMP")" "$(basename "$ARQ_ARQUIVOS")" > "$(basename "$ARQ_SOMAS")"
    else
        sha256sum "$(basename "$ARQ_DUMP")" > "$(basename "$ARQ_SOMAS")"
    fi
)
log "somas gravadas em ${ARQ_SOMAS}"

# -----------------------------------------------------------------------------
# 5. Retenção
#
# Só apaga DEPOIS de o backup do dia ter sido gerado e verificado. Apagar antes
# é como cancelar o seguro na véspera da viagem: numa sequência de falhas você
# ficaria sem nenhuma cópia.
# -----------------------------------------------------------------------------
log "aplicando retenção de ${RETENCAO_DIAS} dias..."
find "$DIR_BACKUP" -maxdepth 1 -type f -name 'discipular-*.dump'   -mtime "+${RETENCAO_DIAS}" -delete
find "$DIR_BACKUP" -maxdepth 1 -type f -name 'arquivos-*.tar.gz'   -mtime "+${RETENCAO_DIAS}" -delete
find "$DIR_BACKUP" -maxdepth 1 -type f -name 'SHA256SUMS-*.txt'    -mtime "+${RETENCAO_DIAS}" -delete
find "$DIR_BACKUP" -maxdepth 1 -type f -name '*.parcial'           -mtime +1 -delete

RESTANTES="$(find "$DIR_BACKUP" -maxdepth 1 -type f -name 'discipular-*.dump' | wc -l | tr -d ' ')"
log "concluído — ${RESTANTES} dump(s) retido(s) em ${DIR_BACKUP} (execução ${CARIMBO})"

# -----------------------------------------------------------------------------
# 6. Lembrete de cópia externa
#
# Backup no mesmo servidor protege contra `DROP TABLE`, não contra a VPS ser
# apagada, invadida ou o provedor sumir. Configure a cópia para fora (rclone,
# restic, S3 com versionamento e object lock) e mantenha a chave de escrita
# FORA deste servidor: ransomware que compromete o app não pode ser capaz de
# apagar os backups remotos.
# -----------------------------------------------------------------------------
if [ -z "${SEM_AVISO_EXTERNO:-}" ]; then
    log "LEMBRETE: confirme que ${DIR_BACKUP} está sendo replicado para fora desta VPS."
fi

exit 0
