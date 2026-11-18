# Deploy na VPS (produção)

> **Primeiro momento: Supabase + Vercel.** O guia atual é [vercel-supabase.md](vercel-supabase.md) (ADR 0016). Este guia de VPS com Docker fica pronto para quando a plataforma sair da Vercel.

Pilha: **Docker Compose** com Postgres 16, API (NestJS), web (Next.js) e **Caddy** (HTTPS automático pelo Let's Encrypt).

| Serviço | O que faz | Acesso |
|---|---|---|
| `postgres` | banco (volume `pgdata`) | só rede interna |
| `migrate` | roda `prisma migrate deploy` a cada `up` e sai | — |
| `api` | API, MCP do Claude, webhooks (volume `storage`) | `https://API_DOMAIN` |
| `web` | painéis do MASTER e da empresa, área de estudo | `https://WEB_DOMAIN` |
| `caddy` | HTTPS e proxy | portas 80 e 443 |

## 1. Antes de começar
- VPS Linux com **Docker** e **Docker Compose v2**. Mínimo recomendado: 2 vCPU, 4 GB de RAM e 40 GB de disco. O build da web usa bastante memória; com 2 GB, crie swap.
- **DNS:** dois registros `A` (e `AAAA`, se houver IPv6) apontando para o IP da VPS. Por exemplo `app.folkspoplearning.com.br` (web) e `api.folkspoplearning.com.br` (API).
- **Firewall:** liberar 22, 80 e 443 (TCP) e 443 (UDP).

## 2. Primeira instalação
```bash
git clone https://github.com/folkspoplearn/universo-folks.git /opt/universo-folks
cd /opt/universo-folks
cp deploy/.env.example deploy/.env
nano deploy/.env        # domínios, senhas (openssl rand -hex 32), MASTER, integrações
docker compose -f deploy/docker-compose.yml up -d --build
```
O primeiro build leva alguns minutos. Na ordem, sobem: banco → migrações → API → web → Caddy, que emite os certificados.

**Primeiro MASTER e catálogo** (só uma vez; o seed é idempotente):
```bash
docker compose -f deploy/docker-compose.yml run --rm migrate npm run db:seed
```
Em produção, o seed recusa a senha de exemplo e o `SEED_DEMO`. Entre no painel com o MASTER e troque a senha.

**Conferir:**
```bash
docker compose -f deploy/docker-compose.yml ps                 # todos "healthy"
curl https://API_DOMAIN/health                                  # {"status":"ok",...}
docker compose -f deploy/docker-compose.yml logs -f api         # logs da API
```

## 3. Atualizar (nova versão)
```bash
cd /opt/universo-folks
git pull
docker compose -f deploy/docker-compose.yml up -d --build
```
As migrações novas rodam sozinhas antes da API subir. Se falharem, a API antiga continua no ar: veja `logs migrate`.

Trocou `API_DOMAIN`? Refaça o build: o endereço da API entra no JavaScript da web na hora do build.

## 4. Travas de produção
A API **não sobe** com `NODE_ENV=production` quando:
- `JWT_ACCESS_SECRET` tem menos de 32 caracteres ou o valor de exemplo;
- algum token de webhook, a senha do seed ou a URL do banco está com o valor "troque…";
- falta alguma variável obrigatória;
- a URL não é `https://`;
- `CORS_ORIGINS` é `*`.

O motivo aparece em `logs api`. O Swagger (`/docs`) fica desligado; para ligar, use `SWAGGER_ENABLED=true`.

## 5. Integrações (endereços para configurar nos painéis)
| Onde | Valor |
|---|---|
| Claude (MCP do MASTER) | `https://API_DOMAIN/mcp`, com o token gerado em **Integrações** no painel |
| RevenueCat → webhook | `https://API_DOMAIN/api/billing/webhooks/revenuecat`, header Authorization = `REVENUECAT_WEBHOOK_AUTH` |
| Asaas → webhook | `https://API_DOMAIN/api/billing/webhooks/asaas`, token = `ASAAS_WEBHOOK_TOKEN` |
| Vimeo → domínios do embed | `VIMEO_EMBED_DOMAINS` = domínio da web |
| App (EAS build) | `EXPO_PUBLIC_API_URL=https://API_DOMAIN/api` |

## 6. Backup
`deploy/scripts/backup.sh` faz o dump do banco (`pg_dump -Fc`) e um `.tar.gz` dos arquivos enviados, ambos em `backups/`. Também apaga os backups com mais de `BACKUP_KEEP_DAYS` dias e, se `BACKUP_RCLONE_REMOTE` estiver preenchido, copia para fora da VPS com o rclone (R2, S3, Drive…).
```bash
crontab -e
# 0 3 * * * cd /opt/universo-folks && bash deploy/scripts/backup.sh >> /var/log/folks-backup.log 2>&1
```
**Backup que fica só na VPS some junto com ela.** Configure o `BACKUP_RCLONE_REMOTE`.

**Restaurar** (substitui os dados do banco; faça só com certeza, de preferência num servidor novo):
```bash
docker compose -f deploy/docker-compose.yml stop api web
docker compose -f deploy/docker-compose.yml exec -T postgres pg_restore -U folks -d universo_folks --clean --if-exists < backups/db-AAAAMMDD-HHMM.dump
docker compose -f deploy/docker-compose.yml start api web
```

## 7. Cuidados
- **Nunca** rode `docker compose down -v`: o `-v` apaga os volumes, ou seja, o banco e os arquivos. Para parar, use `docker compose -f deploy/docker-compose.yml down`, sem `-v`.
- O `deploy/.env` fica só na VPS. Ele não vai para o git (`.gitignore`) nem para as imagens (`.dockerignore`).
- O banco não expõe porta. Para consultar, use `docker compose -f deploy/docker-compose.yml exec postgres psql -U folks universo_folks`.
