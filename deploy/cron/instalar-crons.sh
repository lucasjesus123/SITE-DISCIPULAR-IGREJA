#!/usr/bin/env bash
# =============================================================================
# CRONS do Discipular — aniversário, boas-vindas e convite de retorno.
#
# Cria timers do systemd que chamam as rotas do app por HTTP, autenticadas pelo
# CRON_SECRET que está no .env. Rode ESTE script na VPS, como root:
#
#     sudo bash deploy/cron/instalar-crons.sh
#
# Ele lê o domínio e o CRON_SECRET do próprio .env (não precisa digitar nada).
# =============================================================================
set -euo pipefail

APP_DIR="/var/www/saas-discipular"
ENV_FILE="$APP_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "ERRO: $ENV_FILE não encontrado."; exit 1; }

# Lê CRON_SECRET e APP_URL do .env (sem expor no terminal).
CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
APP_URL="$(grep -E '^APP_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)"
APP_URL="${APP_URL:-https://discipularigreja.com.br}"
APP_URL="${APP_URL%/}"

[ -n "$CRON_SECRET" ] || { echo "ERRO: CRON_SECRET vazio no .env. Defina-o antes."; exit 1; }

echo "Instalando timers para $APP_URL ..."

criar_unidade() {
  local nome="$1" rota="$2" agenda="$3" descricao="$4"

  cat > "/etc/systemd/system/discipular-${nome}.service" <<UNIT
[Unit]
Description=Discipular CRON — ${descricao}
After=network-online.target

[Service]
Type=oneshot
# --fail: status HTTP != 2xx vira erro; --max-time: nunca pendura.
ExecStart=/usr/bin/curl -fsS --max-time 120 -X POST "${APP_URL}${rota}" -H "x-cron-secret: ${CRON_SECRET}"
UNIT

  cat > "/etc/systemd/system/discipular-${nome}.timer" <<UNIT
[Unit]
Description=Agenda do Discipular CRON — ${descricao}

[Timer]
${agenda}
Persistent=true

[Install]
WantedBy=timers.target
UNIT

  systemctl enable --now "discipular-${nome}.timer"
  echo "  ✓ discipular-${nome}.timer"
}

# Aniversário: todo dia às 09:00 (horário do servidor).
criar_unidade "aniversarios" "/api/cron/aniversarios" "OnCalendar=*-*-* 09:00:00" "felicitação de aniversário"

# Boas-vindas: a cada 5 minutos (pega quem cadastrou há ~15 min).
criar_unidade "boas-vindas" "/api/cron/boas-vindas" "OnCalendar=*:0/5" "boas-vindas ao visitante"

# Convite de retorno: todo dia às 10:00.
criar_unidade "convite-retorno" "/api/cron/convite-retorno" "OnCalendar=*-*-* 10:00:00" "convite de retorno"

# Disparos agendados da Secretaria: de minuto em minuto (envia os que venceram).
criar_unidade "disparos-agendados" "/api/cron/disparos-agendados" "OnCalendar=*:0/1" "disparos agendados da secretaria"

systemctl daemon-reload
echo
echo "Pronto. Timers ativos:"
systemctl list-timers 'discipular-*' --no-pager || true
echo
echo "Testar um agora:  sudo systemctl start discipular-aniversarios.service"
echo "Ver o resultado:  journalctl -u discipular-aniversarios.service -n 20 --no-pager"
