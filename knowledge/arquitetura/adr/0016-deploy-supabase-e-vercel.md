# ADR 0016 — Primeiro deploy: banco no Supabase, API e web na Vercel

> tags: adr, deploy, produção, hospedagem, infraestrutura, supabase, vercel, serverless, pooler, pgbouncer, supavisor, direct_url, cron, vercel cron, cron_secret, rls, data api, postgrest, hobby, vps, docker | status: aceita | data: 2026-11-16

## Contexto
A visão técnica previa uma VPS com Docker Compose e Caddy. Esse deploy foi montado e testado em `deploy/`. Para o primeiro momento, o cliente decidiu usar **Supabase e Vercel**, no plano **Hobby** da Vercel por enquanto.

A API NestJS foi feita para rodar sempre ligada, e isso entra em conflito com a função serverless da Vercel em quatro pontos:
- tarefas agendadas pelo `@nestjs/schedule` (expirar assinaturas de hora em hora; lembrete diário a cada minuto);
- arquivos gravados em disco (pacotes SCORM/xAPI, até 500 MB);
- corpo de requisição de até 25 MB (importação de conteúdo), contra o limite de **4,5 MB** das funções da Vercel;
- conexões com o banco abertas por instância.

O Supabase expõe as tabelas do schema `public` pela Data API (PostgREST) para quem tem a chave `anon`.

## Decisão
- **Banco:** Supabase (São Paulo).
  - A API usa o **transaction pooler** (6543) com `pgbouncer=true&connection_limit=1`.
  - As migrações usam o **session pooler** (`DIRECT_URL`, 5432). A conexão direta só tem IPv6.
- **API:** projeto da Vercel com Root Directory `backend`.
  - Função única: `api/index.js`, que chama `dist/serverless.js`. Todas as rotas são reescritas para ela.
  - `createApp()` (`app.factory.ts`) monta a app tanto para o servidor (`main.ts`) quanto para a função.
  - A instalação passa pelo workspace da raiz, para o `content-ingest` ter o `zod`.
  - Região `gru1`. `maxDuration` de 60 s.
- **Web:** projeto da Vercel com Root Directory `apps/web`.
  - Instala e compila pelos workspaces da raiz.
  - `standalone` só no Docker (`NEXT_OUTPUT`).
- **Tarefas agendadas:** na Vercel o `ScheduleModule` fica desligado (`VERCEL` definido).
  - O **Vercel Cron** chama `GET /api/cron/:job` com `Authorization: Bearer CRON_SECRET`.
  - Tarefas: `expire-subscriptions` e `daily-reminder`.
  - No Hobby: só `expire-subscriptions`, 1x por dia às 6h UTC.
- **Migrações:** rodam no build **só de produção** (`scripts/vercel-migrate.mjs`, com o `DIRECT_URL`). Os previews não mexem no banco.
- **Supabase fechado:** a migração `supabase_bloquear_data_api` liga o RLS em todas as tabelas e revoga o acesso dos papéis `anon` e `authenticated`, inclusive nas tabelas futuras (default privileges). O Prisma conecta como dono das tabelas e ignora o RLS. O guia manda desligar a Data API.
- **Travas na Vercel** (`production-check.ts`): a API exige o `CRON_SECRET` e o `pgbouncer=true` no pooler 6543. Se a configuração estiver inválida, a função responde 503 e escreve o motivo no log.

## Alternativas descartadas
- **API num servidor sempre ligado** (Render, Railway, Fly ou a VPS): sem as limitações abaixo, mas o cliente pediu Supabase + Vercel para começar. O Docker de `deploy/` continua pronto.
- **NestJS "zero-config" da Vercel** (entrada `src/main.ts` com `listen`): o build fica fora do nosso controle (decorators, Prisma generate, pacote do monorepo). A função explícita sobre o `dist/` compilado pelo `nest build` é previsível e foi testada localmente.
- **Supabase client/Data API no app:** quebraria o isolamento multi-tenant, que hoje vive inteiro na API (ADR 0001).

## Consequências
- Requisições acima de **4,5 MB** falham (413). Lotes grandes de conteúdo vão em partes.
- **SCORM/xAPI indisponível** na Vercel: o envio responde 503 com uma mensagem clara, antes de gravar qualquer coisa no banco.
- **Rate limit por instância** (memória da função): mais fraco que num servidor único.
- **Hobby não permite uso comercial:** passar para o Pro antes de vender.
- Toda tabela nova já nasce sem acesso para `anon`/`authenticated`, mas o RLS precisa ser ligado na migração que cria a tabela (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).
- O Docker/VPS continua funcionando, com cron pelo `@nestjs/schedule` e disco local.

## Pendências
- Driver de storage no **Supabase Storage**, com upload direto por URL assinada, para liberar o SCORM/xAPI e os PDFs.
- No Pro: cron de hora em hora e o lembrete diário quando o push (FCM/Expo) existir.
- Rate limit compartilhado (Upstash Redis) se o tráfego crescer.
- Domínios próprios (app./api.) apontados para a Vercel.
- Ainda **não houve deploy real**: validado com uma simulação local (handler serverless contra um Postgres com os papéis do Supabase, e build limpo da web).
