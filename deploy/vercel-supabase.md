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

> **Os endereços já se sabem antes do deploy.** O endereço de produção de um projeto da Vercel é `https://<nome-do-projeto>.vercel.app`, e o nome é você que escolhe ao criar o projeto. Por isso:
> 1. Escolha os três nomes antes de começar, por exemplo `folks-api`, `folks-web` e `folks-pwa`. Assim `APP_URL` = `https://folks-api.vercel.app`, `PUBLIC_APP_URL` = `https://folks-web.vercel.app` e `CORS_ORIGINS` = `https://folks-web.vercel.app,https://folks-pwa.vercel.app`.
> 2. Depois do primeiro deploy, confira em **Settings → Domains** de cada projeto. Se o nome já existia, a Vercel acrescenta um sufixo ao endereço. Se ficou diferente, corrija as variáveis e faça **Redeploy**.
>
> `APP_URL` é o endereço da própria API, usado nos links de verificação de certificado e nos vídeos interativos. `PUBLIC_APP_URL` é o endereço da web, usado nos links dos e-mails (convite, nova senha).

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
| `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN` | Premium na web/PWA e contratos de empresa (seção 5b) |

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

## 5b. Asaas (Premium na web/PWA e contratos de empresa)
1. **Sandbox primeiro.** Crie a conta em **sandbox.asaas.com**, que é separada da conta real. Lá os pagamentos são simulados.
2. Em **Integrações → Chave de API**, gere a chave. Na Vercel (projeto da API), configure:
   - `ASAAS_API_KEY` = a chave (no sandbox começa com `$aact_hmlg_`);
   - `ASAAS_API_URL` = `https://api-sandbox.asaas.com/v3`;
   - `ASAAS_WEBHOOK_TOKEN` = `openssl rand -hex 32`. O Asaas exige de 32 a 255 caracteres, sem espaço.
   Coloque o mesmo token no `backend/.env` local, porque o script do passo 3 o lê de lá. Depois faça redeploy da API.
3. **Webhook** (o Asaas avisa a API quando a cobrança é paga, vence, é estornada ou a assinatura é encerrada). Com a API já publicada, rode na sua máquina:
   ```bash
   cd backend
   node scripts/asaas-webhook.mjs configurar --api https://<api>.vercel.app --email <e-mail do financeiro>
   ```
   - Antes de cadastrar, o script confere que a API responde e usa o mesmo token. Se o token for diferente do da Vercel, ele para sem cadastrar nada.
   - Cadastra o webhook "Universo Folks - API" com a URL `https://<api>/api/billing/webhooks/asaas`, envio sequencial, API v3 e os eventos que a API trata: `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED`.
   - Rodar de novo atualiza o mesmo webhook, sem duplicar. Use isso ao trocar o endereço da API ou o token.
   - `node scripts/asaas-webhook.mjs status` mostra se o webhook está ativo, se a fila está rodando e quantas entregas falharam.
   - O Asaas só conta como entregue a resposta HTTP 200. Depois de 15 falhas seguidas, ele **interrompe a fila** e avisa por e-mail. Corrija a causa (API fora do ar, token diferente) e rode `node scripts/asaas-webhook.mjs reativar`. Os eventos pendentes são reenviados, desde que tenham menos de 14 dias.
   - Sem o script: em **Integrações → Webhooks** no painel do Asaas, com os mesmos dados.
4. No painel da plataforma, como MASTER, abra o **menu Planos**, defina o preço do Premium e do Premium Plus (mensal e anual) e **ative**. Preço zero aparece como "Preço em breve".
5. **Teste:** entre no PWA com uma conta de aluno, assine e pague a fatura do sandbox. No sandbox, o Pix tem a opção de simular o pagamento. O plano deve ser liberado em segundos (pelo webhook ou pelo "Já paguei").
6. **Produção:** troque a `ASAAS_API_KEY` pela chave da conta real e a `ASAAS_API_URL` por `https://api.asaas.com/v3`. Faça redeploy da API e rode o `configurar` de novo com a chave de produção no `backend/.env`: o webhook é por conta, e a conta real é outra.

A chave nunca vai para o git nem para o chat. Para testar na sua máquina, coloque as três variáveis no `backend/.env`.

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
