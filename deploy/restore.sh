#!/bin/sh
# =============================================================================
# Discipular SaaS — restore guiado
#
# Restaurar é a operação mais destrutiva do sistema: ela APAGA o conteúdo atual
# do banco de destino. Por isso este script é conversado, verboso e chato de
# propósito. Um restore feito às pressas no banco errado transforma um
# incidente em uma perda de dados de 30 igrejas.
#
# USO
#   Interativo (recomendado):
#     sudo sh deploy/restore.sh
#
#   Direto, apontando o arquivo e o destino:
#     sh deploy/restore.sh --arquivo /var/backups/discipular/discipular-2026-07-26.dump \
#                          --banco   ensaio_restore
#
#   Ensaio mensal obrigatório: restaure SEMPRE em um banco descartável
#   (`ensaio_restore`), nunca por cima da produção. O procedimento completo
#   está no topo de deploy/backup.sh.
#
# CONEXÃO
#   Usa as variáveis padrão do libpq: PGHOST, PGPORT, PGUSER, PGPASSWORD.
#   O usuário precisa de DDL — use `discipular_migrator` ou o admin, nunca
#   `discipular_app` (que de propósito não consegue criar nem apagar tabela).
#
# Códigos de saída: 0 sucesso | 1 falha/abortado pelo operador.
# =============================================================================

set -eu
umask 077

DIR_BACKUP="${DIR_BACKUP:-/var/backups/discipular}"
ARQUIVO=""
BANCO=""
ASSUMIR_SIM=""

log()    { printf '%s [restore] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
falhar() { log "ERRO: $*"; exit 1; }
titulo() { printf '\n=== %s ===\n' "$*"; }

# -----------------------------------------------------------------------------
# Argumentos
# -----------------------------------------------------------------------------
while [ $# -gt 0 ]; do
    case "$1" in
        --arquivo) ARQUIVO="${2:-}"; shift 2 ;;
        --banco)   BANCO="${2:-}";   shift 2 ;;
        --dir)     DIR_BACKUP="${2:-}"; shift 2 ;;
        # Existe só para o ensaio automatizado do CI/cron. NUNCA use isto num
        # restore de produção: a confirmação digitada é a última barreira
        # entre um erro de digitação e a perda dos dados de 30 igrejas.
        --sim-eu-tenho-certeza) ASSUMIR_SIM="1"; shift ;;
        -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
        *) falhar "argumento desconhecido: $1" ;;
    esac
done

command -v pg_restore >/dev/null 2>&1 || falhar "pg_restore não encontrado no PATH."
command -v psql       >/dev/null 2>&1 || falhar "psql não encontrado no PATH."

# -----------------------------------------------------------------------------
# 1. Escolha do arquivo
# -----------------------------------------------------------------------------
titulo "1/6 — escolher o backup"

if [ -z "$ARQUIVO" ]; then
    [ -d "$DIR_BACKUP" ] || falhar "diretório de backups não encontrado: ${DIR_BACKUP}"

    log "backups disponíveis em ${DIR_BACKUP} (mais recente por último):"
    # `ls -l` puro para o operador ver tamanho e data — é justamente pelo
    # tamanho que se percebe um dump anômalo antes de restaurá-lo.
    ls -lh "$DIR_BACKUP"/discipular-*.dump 2>/dev/null || \
        falhar "nenhum arquivo discipular-*.dump em ${DIR_BACKUP}"

    SUGESTAO="$(ls -1t "$DIR_BACKUP"/discipular-*.dump 2>/dev/null | head -n 1)"
    printf '\nCaminho do dump [%s]: ' "$SUGESTAO"
    read -r RESPOSTA
    ARQUIVO="${RESPOSTA:-$SUGESTAO}"
fi

[ -f "$ARQUIVO" ] || falhar "arquivo não encontrado: ${ARQUIVO}"
log "arquivo escolhido: ${ARQUIVO}"
log "tamanho: $(wc -c < "$ARQUIVO" | tr -d ' ') bytes"
log "modificado em: $(date -r "$ARQUIVO" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo 'desconhecido')"

# -----------------------------------------------------------------------------
# 2. Integridade do arquivo
#
# Conferimos ANTES de tocar no banco de destino. Descobrir que o dump está
# corrompido depois do DROP das tabelas é o pior desfecho possível.
# -----------------------------------------------------------------------------
titulo "2/6 — verificar integridade"

SOMAS="$(dirname "$ARQUIVO")/SHA256SUMS-$(basename "$ARQUIVO" | sed 's/^discipular-//; s/\.dump$//').txt"
if [ -f "$SOMAS" ]; then
    log "conferindo ${SOMAS}..."
    ( cd "$(dirname "$ARQUIVO")" && sha256sum -c "$(basename "$SOMAS")" ) \
        || falhar "soma SHA-256 NÃO confere. O arquivo foi corrompido ou alterado. Abortado."
    log "soma confere."
else
    log "AVISO: arquivo de somas não encontrado (${SOMAS}). Seguindo apenas com a checagem do TOC."
fi

TOC="$(mktemp)"
trap 'rm -f "$TOC"' EXIT
pg_restore --list "$ARQUIVO" > "$TOC" 2>/dev/null \
    || falhar "dump ilegível: pg_restore --list falhou. Este arquivo não serve para restore."

TABELAS="$(grep -c 'TABLE DATA' "$TOC" || true)"
log "TOC legível — ${TABELAS} tabela(s) com dados."
[ "${TABELAS:-0}" -ge 5 ] || falhar "apenas ${TABELAS} tabelas com dados. Dump suspeito; restore abortado."

log "migrações contidas no dump (as 3 últimas devem bater com o código em produção):"
grep -i '_prisma_migrations' "$TOC" || log "  (tabela _prisma_migrations não localizada no TOC — atenção)"

# -----------------------------------------------------------------------------
# 3. Escolha do destino
# -----------------------------------------------------------------------------
titulo "3/6 — escolher o banco de destino"

if [ -z "$BANCO" ]; then
    printf 'Nome do banco de DESTINO (será SOBRESCRITO) [ensaio_restore]: '
    read -r RESPOSTA
    BANCO="${RESPOSTA:-ensaio_restore}"
fi

log "destino: host=${PGHOST:-local} porta=${PGPORT:-5432} usuário=${PGUSER:-$(id -un)} banco=${BANCO}"

# Conexão testada agora, antes da confirmação: não faz sentido pedir para o
# operador digitar o nome do banco para depois descobrir que a senha está errada.
psql -d "$BANCO" -tAc 'SELECT 1' >/dev/null 2>&1 \
    || falhar "não consegui conectar em '${BANCO}'. Verifique PGHOST/PGUSER/PGPASSWORD e se o banco existe (CREATE DATABASE)."

# Retrato do que existe hoje no destino. É este número que o operador precisa
# ver antes de decidir: "0 igrejas" é um banco de ensaio; "30 igrejas" é
# produção, e restaurar por cima apaga tudo que entrou depois do dump.
ATUAL="$(psql -d "$BANCO" -tAc "SELECT count(*) FROM tenants" 2>/dev/null || echo '?')"
log "o banco '${BANCO}' contém HOJE ${ATUAL} igreja(s) na tabela tenants."

# -----------------------------------------------------------------------------
# 4. Rede de segurança: dump do estado atual
#
# Antes de destruir, guardamos o que está lá. Já salvou muita gente que
# descobriu, no meio do restore, que o backup escolhido era do dia errado.
# -----------------------------------------------------------------------------
titulo "4/6 — salvaguarda do estado atual"

if [ "$ATUAL" != "?" ] && [ "$ATUAL" != "0" ]; then
    SALVAGUARDA="${DIR_BACKUP}/pre-restore-${BANCO}-$(date +%Y-%m-%d_%H%M%S).dump"
    log "o destino NÃO está vazio; gerando salvaguarda em ${SALVAGUARDA}"
    if pg_dump --format=custom --compress=6 --no-owner --no-privileges \
               --file="$SALVAGUARDA" "$BANCO"; then
        log "salvaguarda gravada. Se este restore der errado, é por ela que você volta."
    else
        falhar "não consegui gerar a salvaguarda. Restore ABORTADO — sem rede, não se anda na corda bamba."
    fi
else
    log "destino vazio ou não inspecionável; nada a salvaguardar."
fi

# -----------------------------------------------------------------------------
# 5. Confirmação explícita
#
# Digitar o nome do banco (e não "s"/"y") é deliberado: obriga o operador a
# LER o destino em vez de apertar Enter no automático às 3 da manhã.
# -----------------------------------------------------------------------------
titulo "5/6 — confirmação"

cat <<FIM

  ATENÇÃO — operação destrutiva.

    Origem  : ${ARQUIVO}
    Destino : ${BANCO}  (host ${PGHOST:-local})
    Efeito  : as tabelas atuais de '${BANCO}' serão APAGADAS e substituídas
              pelo conteúdo do dump. Tudo que entrou no sistema depois da data
              deste backup será PERDIDO.

FIM

if [ -n "$ASSUMIR_SIM" ]; then
    log "confirmação dispensada por --sim-eu-tenho-certeza (modo automatizado)."
else
    # Sem terminal não há como confirmar — e restore sem confirmação humana é
    # exatamente o que este script existe para impedir.
    [ -t 0 ] || falhar "sem terminal interativo para confirmar. Rode com TTY ou use --sim-eu-tenho-certeza (ensaio automatizado apenas)."

    printf "Para confirmar, digite o nome do banco de destino (%s): " "$BANCO"
    read -r CONFIRMACAO
    [ "$CONFIRMACAO" = "$BANCO" ] || falhar "confirmação não confere ('${CONFIRMACAO}'). Nada foi alterado."

    if [ "$BANCO" = "discipular" ]; then
        printf "\nEste é o banco de PRODUÇÃO. Digite RESTAURAR PRODUCAO para prosseguir: "
        read -r CONFIRMACAO2
        [ "$CONFIRMACAO2" = "RESTAURAR PRODUCAO" ] || falhar "confirmação de produção não confere. Nada foi alterado."

        cat <<'FIM'

  Antes de continuar, PARE A APLICAÇÃO. Restaurar com o app escrevendo no
  banco produz um estado misturado, metade antigo e metade novo:

      docker compose stop app        # ou: sudo systemctl stop discipular

FIM
        printf "A aplicação está parada? Digite PARADA: "
        read -r CONFIRMACAO3
        [ "$CONFIRMACAO3" = "PARADA" ] || falhar "pare a aplicação e rode de novo. Nada foi alterado."
    fi
fi

# -----------------------------------------------------------------------------
# 6. Restore
# -----------------------------------------------------------------------------
titulo "6/6 — restaurando"

INICIO="$(date +%s)"

# --clean --if-exists : apaga os objetos antes de recriar, sem falhar quando
#                       algum ainda não existe (banco novo).
# --no-owner/--no-privileges : ignora donos e GRANTs do servidor de origem.
#                       As permissões corretas dos DOIS usuários são aplicadas
#                       depois, no passo pós-restore abaixo.
# --exit-on-error     : ESSENCIAL. Sem isto o pg_restore engole os erros, sai
#                       com 0 e entrega um banco pela metade que parece bom.
# -j 2                : dois workers. Mais que isso satura o I/O da VPS.
if pg_restore --dbname="$BANCO" --clean --if-exists --no-owner --no-privileges \
              --exit-on-error --jobs=2 "$ARQUIVO"; then
    DURACAO=$(( $(date +%s) - INICIO ))
    log "restore concluído em ${DURACAO}s."
else
    falhar "pg_restore falhou. O banco '${BANCO}' pode estar INCONSISTENTE. Restaure a salvaguarda gerada no passo 4 antes de subir a aplicação."
fi

# -----------------------------------------------------------------------------
# Conferência pós-restore
# -----------------------------------------------------------------------------
titulo "conferência"

psql -d "$BANCO" <<'SQL' || log "AVISO: a conferência falhou; inspecione manualmente."
\pset border 2
SELECT (SELECT count(*) FROM tenants)    AS igrejas,
       (SELECT count(*) FROM pessoas)    AS pessoas,
       (SELECT count(*) FROM submissoes) AS submissoes,
       (SELECT count(*) FROM users)      AS usuarios;
SELECT migration_name, finished_at
  FROM _prisma_migrations
 ORDER BY finished_at DESC NULLS LAST
 LIMIT 3;
SQL

cat <<FIM

PRÓXIMOS PASSOS (não pule):

  1. Reaplicar as permissões dos dois usuários do Postgres. O dump veio com
     --no-owner/--no-privileges, então 'discipular_app' ainda NÃO tem acesso
     às tabelas restauradas e o app subiria com "permission denied".
     Rode o bloco de GRANTs de deploy/primeiros-passos.md, seção 7.

  2. Restaurar também os ARQUIVOS do mesmo dia — banco e storage têm que
     voltar juntos, senão a tabela 'arquivos' aponta para bytes inexistentes:
       tar -xzf ${DIR_BACKUP}/arquivos-AAAA-MM-DD.tar.gz -C /var/lib/discipular/storage

  3. Conferir que as migrações listadas acima batem com o código em produção.
     Se o código estiver à frente do dump:
       docker compose --profile migracao run --rm migrador

  4. Subir a aplicação e validar o login de uma igreja de verdade:
       docker compose start app     # ou: sudo systemctl start discipular

  5. Registrar no runbook: data, arquivo usado, duração do restore
     (${DURACAO:-?}s) e o que foi perdido na janela entre o dump e o incidente.

FIM

exit 0
