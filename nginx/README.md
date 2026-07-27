# Nginx — colocar uma igreja no ar

Guia operacional do proxy reverso do Discipular. Tudo aqui pressupõe Ubuntu
22.04/24.04, nginx do repositório oficial e o app rodando em `127.0.0.1:3000`.

Arquivo de configuração: `nginx/discipular.conf` deste repositório, instalado
em `/etc/nginx/conf.d/discipular.conf`.

---

## 0. Instalação inicial (uma vez por servidor)

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx python3-certbot-dns-cloudflare

# Diretório do desafio HTTP-01 usado pelos blocos ^~ /.well-known/acme-challenge/
sudo mkdir -p /var/www/certbot
sudo chown -R www-data:www-data /var/www/certbot

# Instala a configuração
sudo cp nginx/discipular.conf /etc/nginx/conf.d/discipular.conf

# O default site do Ubuntu também declara um default_server na porta 80 e
# conflita com o nosso bloco 444. Tem que sair.
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
```

Confira que o `nginx.conf` principal tem `include /etc/nginx/conf.d/*.conf;`
dentro do bloco `http` (o padrão do Ubuntu tem).

---

## 1. Conceito: dois caminhos para um tenant

| Caminho | Exemplo | Certificado |
|---|---|---|
| Subdomínio da plataforma | `betel.discipular.app` | wildcard `*.discipular.app` (bloco 3) |
| Domínio próprio da igreja | `igrejabetel.com.br` | certificado próprio (bloco 4) |

O subdomínio funciona **automaticamente** assim que o tenant é criado: o
wildcard já cobre o TLS e o bloco 3 já cobre o `server_name`. **Não precisa
mexer no nginx para cada igreja nova que usa subdomínio.**

Domínio próprio exige os passos da seção 3.

> Em qualquer um dos dois casos, o host precisa estar cadastrado e com status
> `VERIFICADO` na tabela `tenant_domains`. O nginx entregar a requisição não
> concede acesso a dado nenhum — quem decide é `src/lib/tenant/resolve.ts`.

---

## 2. Certificado wildcard (`*.discipular.app`) — DNS-01

Wildcard **só** pode ser emitido pelo desafio DNS-01. O HTTP-01 não serve:
não existe um "arquivo" para colocar em um domínio que ainda não existe.

O DNS-01 funciona assim: o certbot pede que você crie um registro TXT em
`_acme-challenge.discipular.app` com um valor que ele fornece. A Let's Encrypt
consulta esse TXT para confirmar que você controla a zona DNS.

### 2.1 Modo automático (recomendado — renova sozinho)

Precisa de um provedor de DNS com API. Exemplo com Cloudflare:

```bash
# Credencial da API. Crie um token com escopo MÍNIMO:
#   Zone > DNS > Edit, restrito à zona discipular.app.
# Um token global de conta aqui seria capaz de sequestrar todos os seus domínios.
sudo mkdir -p /etc/letsencrypt/segredos
sudo tee /etc/letsencrypt/segredos/cloudflare.ini >/dev/null <<'EOF'
dns_cloudflare_api_token = COLE_O_TOKEN_AQUI
EOF

# O certbot RECUSA rodar se o arquivo estiver legível por outros usuários.
sudo chmod 600 /etc/letsencrypt/segredos/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/segredos/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 60 \
  -d 'discipular.app' -d '*.discipular.app' \
  --agree-tos -m ops@discipular.app --no-eff-email
```

`--dns-cloudflare-propagation-seconds 60` existe porque a validação falha se a
Let's Encrypt consultar o TXT antes de ele propagar. Se falhar, aumente.

### 2.2 Modo manual (só para emergência)

```bash
sudo certbot certonly --manual --preferred-challenges dns \
  -d 'discipular.app' -d '*.discipular.app' \
  --agree-tos -m ops@discipular.app
```

O certbot pausa e mostra o valor do TXT. Crie o registro, **espere propagar**
(confira antes de apertar Enter) e só então continue:

```bash
dig +short TXT _acme-challenge.discipular.app @1.1.1.1
```

> **Certificado emitido em modo manual NÃO renova sozinho.** Em 90 dias o site
> cai. Use o modo manual apenas para destravar uma emergência e migre para o
> modo automático no mesmo dia.

### 2.3 Aplicar

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Os caminhos do bloco 3 (`/etc/letsencrypt/live/discipular.app/...`) já apontam
para o certificado recém-emitido — não precisa editar nada.

---

## 3. Adicionar o domínio próprio de uma igreja nova

Exemplo: a Igreja Betel quer usar `igrejabetel.com.br`.

### Passo 1 — DNS (a igreja faz, você confere)

Peça dois registros apontando para o IP da VPS:

```
igrejabetel.com.br.        A     203.0.113.10
www.igrejabetel.com.br.    A     203.0.113.10
```

Confira **antes** de continuar. Certbot com DNS errado consome tentativa do
limite de emissão da Let's Encrypt (5 falhas por hora por conta):

```bash
dig +short igrejabetel.com.br @1.1.1.1
dig +short www.igrejabetel.com.br @1.1.1.1
```

### Passo 2 — cadastrar o domínio na aplicação

No painel da plataforma (`/plataforma`), cadastre o hostname para o tenant e
conclua a verificação. Sem isso, `resolverTenantPorHost` devolve `null` e o
visitante recebe 404 mesmo com nginx e TLS perfeitos. Isso é proposital: se
bastasse editar o nginx para servir um domínio, quem tivesse acesso ao
servidor poderia apontar o domínio de uma igreja para os dados de outra.

### Passo 3 — liberar o host no nginx (HTTP, para o certbot conseguir validar)

Edite `/etc/nginx/conf.d/discipular.conf` e acrescente os dois nomes ao
`server_name` do **bloco 2** (o de redirecionamento HTTP → HTTPS):

```nginx
server_name discipular.app *.discipular.app
            igrejaexemplo.com.br www.igrejaexemplo.com.br
            igrejabetel.com.br www.igrejabetel.com.br;   # <-- novo
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Sem este passo o certbot bate no `default_server`, leva 444 e o desafio
HTTP-01 falha com "Invalid response".

### Passo 4 — emitir o certificado

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d igrejabetel.com.br -d www.igrejabetel.com.br \
  --agree-tos -m ops@discipular.app --no-eff-email
```

Usamos `--webroot`, não `--nginx`: o plugin `--nginx` reescreve o arquivo de
configuração sozinho e desfaz o bloco 444, os limites de rate e os headers de
proxy. O `--webroot` só grava um arquivo em `/var/www/certbot` e não toca em
nada.

### Passo 5 — criar o server block HTTPS

Copie o **bloco 4** inteiro do `discipular.conf`, cole no fim do arquivo e
troque três coisas:

```nginx
server_name igrejabetel.com.br www.igrejabetel.com.br;

ssl_certificate         /etc/letsencrypt/live/igrejabetel.com.br/fullchain.pem;
ssl_certificate_key     /etc/letsencrypt/live/igrejabetel.com.br/privkey.pem;
ssl_trusted_certificate /etc/letsencrypt/live/igrejabetel.com.br/chain.pem;
```

O nome do diretório em `live/` é o **primeiro** `-d` passado ao certbot.
Confira com `sudo certbot certificates`.

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Passo 6 — validar

```bash
# 1. O site responde e serve o tenant certo
curl -sI https://igrejabetel.com.br | head -n 1

# 2. HTTP redireciona
curl -sI http://igrejabetel.com.br | grep -i '^location'

# 3. Host forjado é rejeitado (deve fechar a conexão — "Empty reply"/exit 52)
curl -sI https://igrejabetel.com.br --resolve nao-existe.tld:443:203.0.113.10 \
     -H 'Host: nao-existe.tld' ; echo "exit=$?"

# 4. /.git bloqueado
curl -so /dev/null -w '%{http_code}\n' https://igrejabetel.com.br/.git/config   # 404

# 5. Limite de corpo (deve dar 413)
head -c 8M /dev/zero | curl -so /dev/null -w '%{http_code}\n' \
     -X POST --data-binary @- https://igrejabetel.com.br/api/publico/formularios/contato
```

---

## 4. Renovação automática

O pacote do certbot já instala o timer `certbot.timer`. Confira e adicione o
reload do nginx como hook — sem ele o certificado é renovado no disco mas o
nginx continua servindo o antigo em memória, e o site expira mesmo com o
certbot "funcionando":

```bash
systemctl list-timers certbot.timer

sudo tee /etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
set -e
/usr/sbin/nginx -t && /bin/systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/10-reload-nginx.sh

# Ensaio da renovação, sem consumir limite da Let's Encrypt
sudo certbot renew --dry-run
```

Coloque no calendário um lembrete trimestral para rodar o `--dry-run`. É o
mesmo princípio do backup: renovação que nunca foi testada não é renovação.

---

## 5. Remover uma igreja

Ordem importa — tirar o DNS primeiro deixa o certbot falhando para sempre em
um domínio que não existe mais.

```bash
# 1. Apaga o server block do domínio em /etc/nginx/conf.d/discipular.conf
#    e retira os nomes do server_name do bloco 2.
sudo nginx -t && sudo systemctl reload nginx

# 2. Aposenta o certificado (para o timer de renovação de reclamar todo dia)
sudo certbot delete --cert-name igrejabetel.com.br

# 3. Só então: remover os registros DNS.
```

Depois, marque o tenant como `CANCELADO` no painel da plataforma. Os dados
continuam no banco (e nos backups) até a rotina de exclusão rodar — retenção
de dado pessoal tem prazo e responsável definidos na política de privacidade.

---

## 6. Diagnóstico rápido

| Sintoma | Causa quase sempre |
|---|---|
| `curl` retorna vazio / exit 52 | Host não está em nenhum `server_name`: caiu no 444 do bloco 1. Correto para host forjado, erro de digitação se for domínio legítimo. |
| Alerta de certificado inválido | O `server_name` bate no bloco 3 (wildcard) mas o domínio é próprio: falta criar o bloco 4. |
| 404 em todas as páginas, TLS ok | O host não está `VERIFICADO` em `tenant_domains`. Problema de aplicação, não de nginx. |
| 502 Bad Gateway | O container `app` caiu. `docker compose ps` e `docker compose logs app`. |
| 413 | Upload acima de 6 MB — `client_max_body_size`. Confira também `MAX_UPLOAD_BYTES`. |
| 429 | Rate limit. `grep limiting /var/log/nginx/error.log` mostra a zona e o IP. |
| Certbot: "Invalid response ... 404" | Faltou o passo 3 (host ausente do bloco 2) ou `/var/www/certbot` sem permissão. |
| Renovou mas o navegador vê cert velho | Faltou o hook de reload da seção 4. |
