#!/usr/bin/env bash
# =============================================================================
# Ativa HTTPS (Let's Encrypt) para a gaveta SAAS-DISCIPULAR.
#
# Roda NA VPS, como root, DEPOIS que o DNS do domínio já aponta para este IP.
#
#   bash ativar-https.sh SEU_DOMINIO.com.br seu-email@exemplo.com [--com-curinga]
#
# Sem --com-curinga: emite para o domínio e o www (validação HTTP, automática).
# Com  --com-curinga: emite também para *.dominio (necessário para o SaaS por
#   subdomínio); exige validação DNS manual (o certbot mostra um registro TXT
#   para você criar no painel do domínio).
# =============================================================================
set -euo pipefail

DOMINIO="${1:-}"; EMAIL="${2:-}"; MODO="${3:-}"
if [[ $EUID -ne 0 ]]; then echo "Rode como root."; exit 1; fi
if [[ -z "$DOMINIO" || -z "$EMAIL" ]]; then
  echo "Uso: bash ativar-https.sh SEU_DOMINIO.com.br seu-email@exemplo.com [--com-curinga]"; exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "Instalando certbot..."
  apt-get update -y && apt-get install -y certbot python3-certbot-nginx
fi

if [[ "$MODO" == "--com-curinga" ]]; then
  echo "Emitindo certificado curinga (*.$DOMINIO). Siga a instrução de registro TXT que o certbot mostrar."
  certbot certonly --manual --preferred-challenges dns \
    -d "$DOMINIO" -d "*.$DOMINIO" \
    --agree-tos -m "$EMAIL" --no-eff-email
  echo ""
  echo "Certificado curinga emitido. Agora aponte o nginx para ele (o bloco da gaveta)"
  echo "e rode: nginx -t && systemctl reload nginx"
else
  # Modo simples: o plugin do nginx configura tudo (inclusive o redirect 80->443).
  certbot --nginx -d "$DOMINIO" -d "www.$DOMINIO" \
    --agree-tos -m "$EMAIL" --no-eff-email --redirect
  echo "HTTPS ativo para https://$DOMINIO"
fi

# Renovação automática já vem via timer do systemd (certbot.timer). Confirma:
systemctl list-timers 2>/dev/null | grep -q certbot && echo "Renovação automática: ativa." || \
  echo "Atenção: verifique 'systemctl enable --now certbot.timer' para renovação automática."
