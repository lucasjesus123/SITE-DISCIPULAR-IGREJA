# Gaveta SAAS-DISCIPULAR — como instalar na sua VPS

Este sistema (site + app + gestão) vai morar numa **gaveta isolada** chamada
`saas-discipular` dentro da sua VPS, **sem tocar nos outros sites** que já
rodam ali. Ele roda em Docker e conversa com o nginx que você já usa.

> **Servidor de destino:** Hostinger KVM 1 · Ubuntu 24.04 · IP `179.197.78.218`
> (1 núcleo / 4 GB). Serve para lançar. Quando crescer, é só "Fazer upgrade" de
> CPU no painel — sem reinstalar nada.

---

## O que você precisa antes de começar

1. **Acesso à VPS como root** — pelo terminal SSH, ou pelo **Browser terminal**
   do painel da Hostinger (já entra como root, não precisa instalar nada).
2. **Um domínio** e acesso ao painel de DNS dele.

Eu **não instalo por você** (não tenho acesso ao seu servidor daqui). Você vai
**colar um comando** e o script faz todo o resto sozinho.

---

## Passo 1 — Apontar o domínio para a VPS

No painel do seu domínio, crie estes registros **A** apontando para o IP da VPS:

| Tipo | Nome | Valor |
|------|------|-------|
| A | `@` (ou o domínio) | `179.197.78.218` |
| A | `*` (curinga) | `179.197.78.218` |

O curinga (`*`) é o que permite cada igreja ter o seu subdomínio
(`igreja1.seudominio.com.br`, `igreja2...`). Pode levar de minutos a algumas
horas para propagar.

---

## Passo 2 — Colar UM comando na VPS

Abra o terminal da VPS (como root) e cole o bloco abaixo, **trocando duas
coisas**: `SEU_DOMINIO` pelo seu domínio, e o endereço do repositório se o seu
for diferente.

```bash
# 1) troque pelo SEU domínio:
DOMINIO="SEU_DOMINIO.com.br"

# 2) instala git, baixa o sistema para a gaveta e roda a instalação:
apt-get update -y && apt-get install -y git
git clone https://github.com/lucasjesus123/site-discipular-igreja.git /var/www/saas-discipular \
  || (cd /var/www/saas-discipular && git pull)
cd /var/www/saas-discipular
git checkout claude/saas-church-system-3tayab
SEMEAR=1 bash deploy/gaveta-saas-discipular/instalar-na-vps.sh "$DOMINIO"
```

> Se o repositório for **privado**, o `git clone` vai pedir usuário/senha do
> GitHub (use um *token* de acesso pessoal como senha). Se preferir, me avise e
> eu te passo o comando com o token embutido, ou deixamos o repositório público.

O que o script faz (leva alguns minutos na 1ª vez):

- cria a memória de troca (swap) — necessária para compilar num servidor de 4 GB;
- instala o Docker (se faltar);
- gera senhas e segredos fortes automaticamente (você não digita nada);
- sobe o app + o banco em Docker, isolados;
- aplica as migrações do banco;
- `SEMEAR=1` cria 2 igrejas de demonstração e um usuário admin — **anote as
  senhas que aparecem no final** (aparecem uma única vez);
- instala o bloco nginx da gaveta **ao lado** dos seus outros sites e recarrega
  o nginx só se o teste passar (seus outros sites nunca ficam fora do ar).

Ao final ele imprime um resumo e os próximos passos.

---

## Passo 3 — Ligar o HTTPS (cadeado)

Depois que o DNS já estiver apontando (teste abrindo `http://SEU_DOMINIO` e
vendo o site), rode na VPS:

```bash
# HTTPS para o domínio + www (simples, automático):
bash /var/www/saas-discipular/deploy/ativar-https.sh SEU_DOMINIO.com.br seu-email@exemplo.com

# Para o SaaS por subdomínio (igreja1.seudominio...), o certificado curinga:
bash /var/www/saas-discipular/deploy/ativar-https.sh SEU_DOMINIO.com.br seu-email@exemplo.com --com-curinga
```

O modo curinga vai te mostrar um registro **TXT** para criar no painel do
domínio — é normal, faz parte da validação.

---

## Depois de instalado

Tudo roda dentro de `/var/www/saas-discipular`. Comandos úteis (rode lá dentro):

```bash
C="docker compose -f docker-compose.yml -f deploy/gaveta-saas-discipular/docker-compose.override.yml"

$C logs -f app          # ver o que está acontecendo
$C restart app          # reiniciar
$C ps                   # ver se está no ar
git pull && $C up -d --build   # atualizar o sistema quando eu mandar novidades
```

- **Super admin (você):** `https://SEU_DOMINIO/plataforma` — cadastra as igrejas.
- **Painel de uma igreja:** `https://(subdomínio da igreja)/painel`.
- **App dos membros:** `.../app` · **Site público:** `.../`.

---

## Como remover a gaveta (se um dia precisar)

Isso remove só este sistema, sem afetar os outros sites:

```bash
cd /var/www/saas-discipular
docker compose -f docker-compose.yml -f deploy/gaveta-saas-discipular/docker-compose.override.yml down
rm -f /etc/nginx/sites-enabled/saas-discipular.conf /etc/nginx/sites-available/saas-discipular.conf
nginx -t && systemctl reload nginx
# os dados ficam no volume Docker 'discipular_pgdata' até você removê-lo de propósito.
```
