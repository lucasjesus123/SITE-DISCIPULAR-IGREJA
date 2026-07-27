# Primeiros passos — preparando a VPS

Checklist de hardening e provisionamento para colocar o Discipular no ar em uma
VPS nova. Referência: **Ubuntu 24.04 LTS, 4 vCPU, 8 GB RAM, 80 GB SSD**,
dimensionada para ~30 igrejas e ~90 usuários simultâneos.

Faça na ordem. Cada seção depende da anterior.

> **Regra de ouro:** enquanto o servidor não estiver com as seções 1 a 5
> concluídas, ele não recebe dado de igreja nenhuma. Bot de varredura encontra
> uma VPS nova e começa a tentar senha de SSH em menos de dez minutos.

---

## 0. Antes de tocar no servidor

- [ ] DNS do domínio raiz (`discipular.app`) apontando para o IP da VPS
- [ ] Registro `A` wildcard `*.discipular.app` para o mesmo IP
- [ ] Acesso à API do provedor de DNS (necessário para o certificado wildcard)
- [ ] Snapshot/backup automático habilitado no painel do provedor da VPS
- [ ] Um gerenciador de senhas para guardar o que vai ser gerado na seção 6

---

## 1. Usuário não-root

Trabalhar como `root` significa que qualquer erro de digitação é irreversível e
que qualquer processo comprometido já nasce dono da máquina.

```bash
# Como root, no primeiro acesso:
adduser --gecos "" opsdiscipular
usermod -aG sudo opsdiscipular

# Copia a chave SSH que você já usou para entrar como root
rsync --archive --chown=opsdiscipular:opsdiscipular /root/.ssh /home/opsdiscipular/
```

**Antes de fechar esta sessão**, abra um SEGUNDO terminal e confirme que
`ssh opsdiscipular@IP` funciona e que `sudo -v` aceita a senha. Fechar a sessão
root sem testar é o jeito mais comum de perder acesso a um servidor novo.

Crie também o usuário de sistema da aplicação (só necessário na instalação via
systemd; com Docker, o container já roda como uid 1001):

```bash
sudo useradd --system --home /opt/discipular --shell /usr/sbin/nologin discipular
```

`--shell /usr/sbin/nologin`: se um dia alguém conseguir executar comando como
`discipular`, não ganha um shell interativo de brinde.

---

## 2. Chave SSH e fim do login por senha

```bash
# NA SUA MÁQUINA, não no servidor:
ssh-keygen -t ed25519 -C "opsdiscipular@discipular" -f ~/.ssh/discipular_ed25519
ssh-copy-id -i ~/.ssh/discipular_ed25519.pub opsdiscipular@IP
```

Ed25519 em vez de RSA: chave menor, verificação mais rápida e sem o risco de
alguém gerar um RSA de 1024 bits "porque foi o padrão".

Teste o login com a chave **em outro terminal** e só então:

```bash
sudo tee /etc/ssh/sshd_config.d/99-discipular.conf >/dev/null <<'EOF'
# Sem senha: elimina de uma vez força bruta e credential stuffing no SSH.
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no

# root não loga, nem com chave. Administração é sempre por usuário nominal
# com sudo — é o que dá rastreabilidade de quem fez o quê.
PermitRootLogin no

# Só quem precisa entrar.
AllowUsers opsdiscipular

# Reduz a janela para conexões pela metade abertas segurando slot.
LoginGraceTime 20
MaxAuthTries 3
MaxSessions 5

# Encaminhamentos que este servidor não usa. Cada um é um túnel a menos
# disponível para quem comprometer uma conta.
AllowAgentForwarding no
AllowTcpForwarding no
X11Forwarding no
PermitTunnel no

# Derruba sessão pendurada (notebook que fechou) em ~5 min.
ClientAliveInterval 60
ClientAliveCountMax 5
EOF

sudo sshd -t && sudo systemctl restart ssh
```

`sshd -t` antes do restart: valida a sintaxe. Sem isso, um typo derruba o SSH e
você fica de fora do servidor.

- [ ] Testado: login com chave funciona
- [ ] Testado: `ssh -o PubkeyAuthentication=no opsdiscipular@IP` é **recusado**

---

## 3. Firewall (ufw)

Política padrão de negar tudo na entrada. Só três portas abertas — o Postgres
**nunca** entra nesta lista: ele é acessível apenas pela rede interna do Docker
ou pelo loopback.

```bash
sudo apt install -y ufw

sudo ufw default deny incoming
sudo ufw default allow outgoing

sudo ufw limit 22/tcp comment 'SSH com rate limit'
sudo ufw allow 80/tcp  comment 'HTTP (redirect + ACME)'
sudo ufw allow 443/tcp comment 'HTTPS'

sudo ufw --force enable
sudo ufw status verbose
```

`limit` em vez de `allow` no SSH: o ufw bloqueia o IP que abrir mais de 6
conexões em 30 segundos.

> **Atenção com Docker:** o Docker escreve direto no iptables e pode publicar
> portas passando por cima do ufw. É por isso que o `docker-compose.yml`
> publica a aplicação como `127.0.0.1:3000:3000` e o Postgres não publica porta
> nenhuma. Confira depois de subir tudo, de FORA do servidor:
> ```bash
> nmap -Pn -p 22,80,443,3000,5432 SEU_IP    # 3000 e 5432 têm que aparecer fechadas
> ```

---

## 4. fail2ban

O ufw limita conexões; o fail2ban lê os logs e bane quem insiste.

```bash
sudo apt install -y fail2ban

sudo tee /etc/fail2ban/jail.d/discipular.conf >/dev/null <<'EOF'
[DEFAULT]
# 1h de banimento, contando 5 falhas em 10 min.
bantime  = 1h
findtime = 10m
maxretry = 5
# Reincidente é banido por mais tempo, progressivamente.
bantime.increment = true
bantime.factor    = 2
bantime.maxtime   = 1w
backend = systemd
# NÃO se auto-banir ao testar de dentro do servidor.
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = 22
maxretry = 3

# Enxurrada de 4xx: varredura procurando /.env, /wp-admin, /.git/config.
[nginx-http-auth]
enabled  = true

[nginx-limit-req]
# Quem bate no limit_req do nginx repetidamente não é usuário distraído.
enabled  = true
maxretry = 20
findtime = 5m
bantime  = 2h
EOF

sudo systemctl enable --now fail2ban
sudo fail2ban-client status
```

Com login por senha desabilitado (seção 2), o jail do sshd captura pouca coisa
— o que é exatamente o objetivo. Ele fica ligado como rede de segurança para o
dia em que alguém "temporariamente" reabilitar senha.

---

## 5. Atualizações automáticas de segurança

```bash
sudo apt install -y unattended-upgrades apt-listchanges

sudo tee /etc/apt/apt.conf.d/51discipular-unattended >/dev/null <<'EOF'
// Só o canal de SEGURANÇA. Atualizar tudo automaticamente traria mudança de
// comportamento sem janela de manutenção — e um domingo de manhã não é hora
// de descobrir que o nginx mudou um padrão.
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";

// Reinicia sozinho só de madrugada, e só quando for realmente necessário
// (atualização de kernel/libc). Fora disso o serviço fica no ar.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-WithUsers "false";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";

Unattended-Upgrade::Mail "ops@discipular.app";
Unattended-Upgrade::MailReport "on-change";
EOF

sudo systemctl enable --now unattended-upgrades

# Ensaio, sem aplicar nada:
sudo unattended-upgrade --dry-run --debug
```

Instale também o `needrestart` para não ficar com biblioteca antiga carregada em
processo antigo depois de uma atualização:

```bash
sudo apt install -y needrestart
```

- [ ] `systemctl status unattended-upgrades` ativo
- [ ] Reinício automático agendado fora do horário de culto

---

## 6. Gerar os segredos

Três segredos **distintos** — o `src/lib/env.ts` recusa subir em produção se
dois forem iguais. A razão é simples: se um vazar, os outros dois continuam
protegendo o que protegem.

```bash
# SESSION_SECRET (48 bytes) — deriva o hash dos tokens de sessão.
#   Trocar este valor desloga TODO MUNDO. É o botão de pânico de sessão.
openssl rand -base64 48

# ENCRYPTION_KEY (32 bytes) — AES-256-GCM dos segredos por tenant no banco.
#   PERDER ESTA CHAVE TORNA OS DADOS CIFRADOS ILEGÍVEIS PARA SEMPRE.
#   Guarde uma cópia no gerenciador de senhas ANTES de subir o sistema.
openssl rand -base64 32

# CSRF_SECRET (32 bytes) — assinatura do token double-submit.
openssl rand -base64 32

# Senhas dos usuários do Postgres (sem caracteres que quebrem a URL de conexão)
openssl rand -hex 24    # discipular_app
openssl rand -hex 24    # discipular_migrator
openssl rand -hex 24    # discipular_backup
openssl rand -hex 24    # admin de bootstrap
```

`-hex` para as senhas do banco de propósito: base64 gera `+`, `/` e `=`, que
precisam de escape dentro de `postgresql://usuario:senha@host/banco` e produzem
falhas de autenticação difíceis de diagnosticar.

**Nunca**: colar segredo em chat, commitar `.env`, gerar com um site de "senhas
aleatórias online", ou reaproveitar entre ambientes. Guarde tudo no gerenciador
de senhas antes de seguir.

---

## 7. Os DOIS usuários do Postgres

Esta é uma decisão de arquitetura de segurança, não burocracia.

| Usuário | Usado por | Pode DDL? | Papel |
|---|---|---|---|
| `discipular_migrator` | `prisma migrate deploy`, no deploy | **sim** | dono do schema |
| `discipular_app` | a aplicação em runtime, 24h por dia | **não** | só DML |
| `discipular_backup` | `deploy/backup.sh` | não | só leitura |

O processo que atende a internet é o mais exposto do sistema. Se ele tiver DDL,
uma injeção de SQL ou um RCE vira `DROP TABLE pessoas` — perda total. Sem DDL,
o pior caso continua sendo grave, mas é recuperável e auditável.

Isso também faz a **RLS** funcionar: o dono da tabela ignora as políticas de
row-level security por padrão. Como `discipular_app` **não** é dono, as
políticas de isolamento por tenant valem para ele — que é justamente quem
precisa ser contido.

### Criar (uma vez, como admin de bootstrap)

Com Docker: `docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d discipular`

```sql
-- ---------------------------------------------------------------------------
-- Papéis
-- ---------------------------------------------------------------------------
CREATE ROLE discipular_migrator LOGIN PASSWORD 'SENHA_DO_MIGRATOR';
CREATE ROLE discipular_app      LOGIN PASSWORD 'SENHA_DO_APP';
CREATE ROLE discipular_backup   LOGIN PASSWORD 'SENHA_DO_BACKUP';

-- Nenhum deles cria banco, cria papel nem ignora RLS.
ALTER ROLE discipular_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE discipular_app      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
ALTER ROLE discipular_backup   NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- Um teto de conexões por papel. Impede que o backup ou um script solto
-- consuma todos os slots e derrube o login das igrejas.
ALTER ROLE discipular_app      CONNECTION LIMIT 40;
ALTER ROLE discipular_migrator CONNECTION LIMIT 5;
ALTER ROLE discipular_backup   CONNECTION LIMIT 3;

-- ---------------------------------------------------------------------------
-- O schema pertence ao migrator
-- ---------------------------------------------------------------------------
ALTER DATABASE discipular OWNER TO discipular_migrator;
ALTER SCHEMA public OWNER TO discipular_migrator;

-- No PostgreSQL <= 14 QUALQUER usuário podia criar objeto no schema public.
-- No 15+ isso já vem revogado, mas repetimos porque é barato e porque
-- servidor restaurado de dump antigo pode voltar com o comportamento velho.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE discipular FROM PUBLIC;

GRANT CONNECT ON DATABASE discipular TO discipular_app, discipular_backup;
GRANT USAGE   ON SCHEMA public       TO discipular_app, discipular_backup;
-- CREATE só para o migrator: é a linha que impede o app de criar tabela.
GRANT CREATE  ON SCHEMA public       TO discipular_migrator;
```

### Conceder as permissões de dados (repetir DEPOIS de cada migração)

```sql
-- DML nas tabelas que já existem.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO discipular_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO discipular_app;

-- Leitura para o backup (pg_read_all_data existe do PostgreSQL 14 em diante).
GRANT pg_read_all_data TO discipular_backup;

-- E, o mais importante: privilégios PADRÃO para as tabelas do FUTURO.
-- Sem este bloco, toda migração que cria tabela nova deixa o app com
-- "permission denied for table X" — e o erro só aparece na primeira vez que
-- alguém usa a funcionalidade nova, tipicamente em produção.
ALTER DEFAULT PRIVILEGES FOR ROLE discipular_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO discipular_app;
ALTER DEFAULT PRIVILEGES FOR ROLE discipular_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO discipular_app;
ALTER DEFAULT PRIVILEGES FOR ROLE discipular_migrator IN SCHEMA public
    GRANT SELECT ON TABLES TO discipular_backup;
```

### Conferir que a separação funciona de verdade

```bash
# Como discipular_app: DEVE falhar.
PGPASSWORD=SENHA_DO_APP psql -h 127.0.0.1 -U discipular_app -d discipular \
  -c 'CREATE TABLE teste_ddl (id int);'
#   -> ERROR: permission denied for schema public   <-- resultado esperado

# Como discipular_app: DEVE funcionar.
PGPASSWORD=SENHA_DO_APP psql -h 127.0.0.1 -U discipular_app -d discipular \
  -c 'SELECT count(*) FROM tenants;'
```

Se o `CREATE TABLE` acima **passar**, pare tudo e revise os GRANTs. A separação
não está valendo.

- [ ] `CREATE TABLE` como `discipular_app` foi recusado
- [ ] `SELECT` como `discipular_app` funcionou
- [ ] Senhas guardadas no gerenciador de senhas

---

## 8. Docker

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Rotação global de log: sem isto, um container falando muito enche o disco e
# derruba o Postgres junto.
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "3" },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF
sudo systemctl restart docker
```

> Adicionar seu usuário ao grupo `docker` equivale a dar root sem senha (o
> socket do Docker permite montar `/` em um container). Se fizer isso por
> conveniência, saiba exatamente o que está aceitando; o mais seguro é
> continuar usando `sudo docker`.

---

## 9. Diretórios e o `.env`

```bash
sudo mkdir -p /opt/discipular /var/backups/discipular /var/lib/discipular/storage
sudo chown -R opsdiscipular:opsdiscipular /opt/discipular

# uid 1001 = usuário `discipular` dentro da imagem da aplicação.
sudo chown -R 1001:1001 /var/lib/discipular/storage

# uid 70 = usuário `postgres` dentro da imagem postgres:16-alpine, que é quem
# roda o deploy/backup.sh no container de backup. Sem este chown, o pg_dump
# falha com "Permission denied" ao gravar em /backups.
sudo chown -R 70:70 /var/backups/discipular
# Dump é dado pessoal de milhares de membros: ninguém mais lê este diretório.
sudo chmod 700 /var/backups/discipular

cd /opt/discipular
git clone SEU_REPOSITORIO .

cp .env.example .env
chmod 600 .env      # segredo não é legível por outros usuários do host
```

Preencha o `.env` com os valores gerados na seção 6. Pontos de atenção:

```ini
NODE_ENV="production"
APP_URL="https://discipular.app"          # tem que ser https, o env.ts exige
ROOT_DOMAIN="discipular.app"
TRUSTED_PROXY_HOPS="1"                    # 1 = só o nginx na frente

# COM DOCKER, o host do banco é o nome do serviço, NÃO localhost:
DATABASE_URL="postgresql://discipular_app:SENHA@postgres:5432/discipular?schema=public&connection_limit=10&pool_timeout=20"
DIRECT_DATABASE_URL="postgresql://discipular_migrator:SENHA@postgres:5432/discipular?schema=public"

# Usados apenas pelo docker-compose.yml (não pela aplicação):
POSTGRES_ADMIN_USER="discipular_admin"
POSTGRES_ADMIN_PASSWORD="SENHA_DO_ADMIN"
POSTGRES_DB="discipular"
BACKUP_DB_USER="discipular_backup"
BACKUP_DB_PASSWORD="SENHA_DO_BACKUP"
BACKUP_RETENCAO_DIAS="14"
TZ="America/Sao_Paulo"
```

Errar `TRUSTED_PROXY_HOPS` permite forjar o IP de origem e escapar do rate
limit da aplicação. Com o nginx deste repositório, o valor correto é `1`.

- [ ] `.env` com permissão `600`
- [ ] `git status` **não** mostra o `.env`

---

## 10. Subir o sistema

```bash
cd /opt/discipular

# 1. Banco primeiro, sozinho, para criar os papéis da seção 7.
sudo docker compose up -d postgres
sudo docker compose exec postgres psql -U discipular_admin -d discipular
# (cole aqui o SQL da seção 7)

# 2. Migrações, com o usuário que tem DDL.
sudo docker compose --profile migracao run --rm migrador

# 3. Aplicar os GRANTs de dados (segundo bloco da seção 7) — as tabelas
#    acabaram de nascer.

# 4. Aplicação.
sudo docker compose up -d --build app

sudo docker compose ps          # ambos devem estar "healthy"
sudo docker compose logs -f app
```

Depois configure o nginx e o TLS seguindo **`nginx/README.md`**.

---

## 11. Backups

```bash
# Ensaio manual antes de agendar
sudo docker compose --profile backup run --rm backup

sudo crontab -e
```

```cron
# Backup diário às 03:10
10 3 * * * cd /opt/discipular && docker compose --profile backup run --rm backup >> /var/log/discipular-backup.log 2>&1

# Renovação de certificado às 03:40 (o timer do certbot já cobre, este é o cinto reserva)
40 3 * * * /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

Configure ainda:

- [ ] Cópia dos dumps para **fora da VPS** (rclone/restic para S3 com
      versionamento e object lock). Backup só local não protege contra a VPS
      ser apagada, invadida ou o provedor sumir — e a credencial de escrita do
      destino remoto não pode ficar neste servidor.
- [ ] **Ensaio de restore no primeiro dia útil de cada mês.** Procedimento
      completo no topo de `deploy/backup.sh`. Backup que nunca foi restaurado
      não é backup.
- [ ] Alerta quando o backup falhar (o cron manda e-mail em saída != 0; garanta
      que o `MAILTO` do crontab aponta para alguém que lê).

---

## 12. Verificação final

De **fora** do servidor:

```bash
nmap -Pn -p 22,80,443,3000,5432 SEU_IP     # só 22, 80 e 443 abertas
curl -sI https://discipular.app | head -1  # 200
curl -sI http://discipular.app | grep -i location   # 301 para https

# Host forjado: a conexão tem que ser FECHADA (exit 52), não respondida
curl -sI https://discipular.app -H 'Host: invasor.com' \
     --resolve invasor.com:443:SEU_IP; echo "exit=$?"

# Cabeçalhos de segurança
curl -sI https://discipular.app | grep -iE 'strict-transport|content-security|x-frame|x-content-type'
```

Checklist de encerramento:

- [ ] Login por senha no SSH desabilitado e testado
- [ ] `ufw` ativo, portas 3000 e 5432 inacessíveis de fora
- [ ] `fail2ban` ativo
- [ ] `unattended-upgrades` ativo
- [ ] `discipular_app` **não** consegue rodar DDL
- [ ] Postgres sem porta publicada no host
- [ ] `.env` com permissão 600 e fora do Git
- [ ] TLS A/A+ no SSL Labs, HSTS presente
- [ ] Host forjado recebe 444
- [ ] Backup rodou, foi verificado **e foi restaurado** em banco de ensaio
- [ ] `ENCRYPTION_KEY` guardada em local seguro **fora** do servidor
- [ ] Snapshot do provedor habilitado

---

## 13. Rotina periódica

| Quando | O quê |
|---|---|
| Diário | Conferir que o backup da madrugada gerou arquivo e passou na verificação |
| Semanal | `docker compose logs --since 168h app \| grep -i erro`; `fail2ban-client status` |
| Mensal | **Ensaio de restore**; `npm audit`; `sudo apt list --upgradable` |
| Trimestral | `certbot renew --dry-run`; revisar quem tem acesso SSH; rotacionar `CSRF_SECRET` |
| Anual | Rotacionar `SESSION_SECRET` (desloga todo mundo — avise as igrejas antes) |
