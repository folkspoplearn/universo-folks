# Deploy no Supabase + Vercel (primeiro momento)

| Peça | Onde | Pasta do repositório |
|---|---|---|
| Banco PostgreSQL | **Supabase** | `backend/prisma` (migrações) |
| API (NestJS, MCP, webhooks, cron) | **Vercel**, projeto 1 (função serverless) | `backend/` |
| Web (painéis e área de estudo) | **Vercel**, projeto 2 (Next.js) | `apps/web/` |
| App como **PWA** (enquanto não está nas lojas) | **Vercel**, projeto 3 (site estático) | `apps/mobile/` |
| App nas lojas (depois) | EAS, apontando para a mesma API | `apps/mobile/` |

Os três projetos da Vercel usam o mesmo repositório GitHub, cada um com uma **Root Directory** diferente. A configuração de cada um está no `vercel.json` da própria pasta. A região é `gru1` (São Paulo); crie o Supabase em **South America (São Paulo)** para o banco ficar perto da API.

> Plano Hobby da Vercel: o cron roda 1 vez por dia, e os termos da Vercel não permitem uso comercial no Hobby. Para vender, passe para o Pro antes de abrir ao público.

## 1. Supabase
1. Crie o projeto (região São Paulo) e guarde a senha do banco.
2. **Desligue a Data API** em Project Settings → Data API: a plataforma não usa. Como reforço, a migração `supabase_bloquear_data_api` liga o RLS em todas as tabelas e tira o acesso dos papéis `anon` e `authenticated`, inclusive nas tabelas futuras.
3. Em **Connect**, copie duas strings:
   - **Transaction pooler** (porta **6543**). Vira o `DATABASE_URL` da API, com `?pgbouncer=true&connection_limit=1` no fim.
   - **Session pooler** (porta **5432**). Vira o `DIRECT_URL`, usado só para migrar. Não use a "Direct connection" (`db.<ref>.supabase.co`): ela só tem IPv6, e o build da Vercel não alcança.

## 2. Primeira carga do banco (na sua máquina, uma vez)
Na pasta `backend`, com as strings do Supabase. Elas ficam só no seu terminal: não cole em arquivo nem no chat.
```bash
cd backend
DATABASE_URL="<session pooler>" npx prisma migrate deploy
DATABASE_URL="<session pooler>" NODE_ENV=production SEED_MASTER_EMAIL="<email do master>" SEED_MASTER_PASSWORD="<senha forte>" npm run db:seed
```
O seed cria as categorias, o primeiro MASTER, o catálogo do protótipo, os templates e os planos. Ele é idempotente e, em produção, recusa a senha de exemplo e os dados de demonstração. Depois do primeiro acesso, troque a senha do MASTER no painel.

## 3. Vercel: projeto da API
New Project → importar `folkspoplearn/universo-folks` → **Root Directory: `backend`**. Deixe "Include files outside the Root Directory" ligado, porque a API usa `packages/content-ingest`. O resto vem do `backend/vercel.json`.

**Environment Variables** (Production):
| Variável | Valor |
|---|---|
| `DATABASE_URL` | transaction pooler (6543) + `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | session pooler (5432); com ela, o deploy de produção aplica as migrações pendentes |
| `JWT_ACCESS_SECRET` | `openssl rand -hex 32` |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL_DAYS` | `15m` / `30` |
| `CRON_SECRET` | `openssl rand -hex 32` (o Vercel Cron envia como `Authorization: Bearer`) |
| `APP_URL` | `https://<projeto-api>.vercel.app` (ou o domínio da API) |
| `PUBLIC_APP_URL` | `https://<projeto-web>.vercel.app` (ou o domínio da web) |
| `CORS_ORIGINS` | o mesmo endereço da web (mais de um: separe por vírgula) |
| `VIMEO_ACCESS_TOKEN`, `VIMEO_EMBED_DOMAINS` | token do Vimeo e domínio da web |
| `RESEND_API_KEY`, `EMAIL_FROM` | e-mail transacional (vazio = não envia) |
| `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_ACCEPT_SANDBOX` | quando ligar as lojas |
| `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` | quando ligar o Asaas |

A API **não sobe** se faltar alguma obrigatória, se um segredo for fraco ou estiver com o valor de exemplo, se faltar o `CRON_SECRET` ou se o pooler 6543 estiver sem `pgbouncer=true`. Nesse caso ela responde 503, e o motivo aparece nos logs da função.

**Conferir:** `https://<projeto-api>.vercel.app/health` → `{"status":"ok"}`.

## 4. Vercel: projeto da web
New Project → mesmo repositório → **Root Directory: `apps/web`**. A instalação e o build usam os workspaces da raiz, conforme o `apps/web/vercel.json`.

**Environment Variables:**
| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<projeto-api>.vercel.app/api` (entra no build: mudou, faça redeploy) |
| `API_URL` | o mesmo endereço (usado pelas rotas `/api/sessao` do servidor) |

Depois do primeiro deploy da web, confira se `PUBLIC_APP_URL` e `CORS_ORIGINS` da API batem com o endereço final da web. Se mudar, faça redeploy da API.

## 4b. Vercel: projeto do PWA (o app no celular, por enquanto)
New Project → mesmo repositório → **Root Directory: `apps/mobile`**. Deixe "Include files outside the Root Directory" ligado, porque o app usa `packages/shared`. A instalação, o build (`expo export -p web`), o fallback de SPA e os cabeçalhos do service worker vêm do `apps/mobile/vercel.json`.

**Environment Variables:**
| Variável | Valor |
|---|---|
| `EXPO_PUBLIC_API_URL` | `https://<projeto-api>.vercel.app/api` (entra no build: mudou, faça redeploy) |

**Na API**, acrescente o endereço do PWA em `CORS_ORIGINS`, separado por vírgula. Exemplo: `https://<projeto-web>.vercel.app,https://<projeto-pwa>.vercel.app`. Depois, faça redeploy da API.

**Como o aluno instala:**
- **Android (Chrome):** abre o endereço e toca em **Instalar** no cartão "Instale o Universo Folks", ou usa o menu ⋮ → Instalar app.
- **iPhone (Safari):** abre o endereço, toca em **Compartilhar** e depois em **Adicionar à Tela de Início**.

O app abre em tela cheia e com o ícone do planeta. A tela inicial abre mesmo sem internet; as aulas precisam de conexão.

**Antes de divulgar:** troque os ícones em `apps/mobile/public/icons/` pela arte final, se o cliente mandar. Os atuais são o planeta roxo do app.

## 5. Endereços para os painéis externos
| Onde | Valor |
|---|---|
| Claude (MCP do MASTER) | `https://<api>/mcp`, com o token gerado em Integrações |
| RevenueCat → webhook | `https://<api>/api/billing/webhooks/revenuecat` |
| Asaas → webhook | `https://<api>/api/billing/webhooks/asaas` |
| PWA e app (EAS) | `EXPO_PUBLIC_API_URL=https://<api>/api` |

## 6. Limitações neste primeiro momento (e como resolver depois)
| O quê | Por quê | Saída |
|---|---|---|
| Requisição de no máximo **4,5 MB** | limite das funções da Vercel | lotes grandes de conteúdo do Claude vão em partes (a importação aceita vários envios) |
| **Pacotes SCORM/xAPI** respondem "ainda não disponível" | o disco da função não persiste | driver de storage no Supabase Storage com upload direto (URL assinada) |
| **Cron 1x por dia** (expirar assinaturas às 6h UTC) | plano Hobby | no Pro, voltar para de hora em hora e ligar o lembrete diário (`/api/cron/daily-reminder`) quando o push existir |
| Limite de tentativas de login por instância | memória de cada função | aceitável no início; depois, um Redis (Upstash) |
| Função com até 60 s | `maxDuration` no `vercel.json` | sobe até 300 s no Hobby se o MCP precisar |

O deploy em VPS com Docker (`deploy/README.md`) continua pronto para quando sair da Vercel.

## 7. Atualizações
Cada push na `main` gera deploy de produção dos dois projetos. No da API, `scripts/vercel-migrate.mjs` aplica as migrações pendentes com o `DIRECT_URL`. Isso só acontece em produção: os deploys de preview nunca mexem no banco. `prisma migrate deploy` nunca apaga dados.
