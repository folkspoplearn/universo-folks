# Visão técnica

> tags: arquitetura, stack, monorepo, módulos, camadas | ver também: adr/

## Stack
- **API:** Node.js 22+, TypeScript, NestJS 11, Prisma 6, PostgreSQL 16, Zod (schemas compartilhados com o MCP) e class-validator (DTOs).
- **Web:** Next.js 16 (App Router) + Tailwind 4 + TanStack Query, com o visual do protótipo (ADR 0012).
- **App:** React Native com Expo SDK 58 + Expo Router, publicado na App Store e no Google Play via EAS (ADR 0012).
- **Infra:** VPS com Docker Compose + Caddy (HTTPS) + backup diário fora da VPS. Storage S3/R2 + CDN em produção.

## Deploy (produção)
Guia passo a passo em `deploy/README.md`.
- **`deploy/docker-compose.yml`:** `postgres` (sem porta exposta), `migrate`, `api`, `web` e `caddy`.
  - `migrate` roda `prisma migrate deploy` a cada `up`, antes da API.
  - O seed é manual: `run --rm migrate npm run db:seed`.
- **Dois domínios:** `WEB_DOMAIN` (web) e `API_DOMAIN` (API, `/mcp`, webhooks).
  - A web tem as próprias rotas `/api/sessao`, por isso a API não pode ficar no mesmo domínio em `/api`.
  - `NEXT_PUBLIC_API_URL` entra no build da web: trocou o domínio, refaça a imagem.
- **Imagens:** `deploy/docker/api.Dockerfile` (alvo `build` para migração e seed; `runtime` enxuto) e `web.Dockerfile` (Next `output: 'standalone'`). O contexto do build é a raiz do repositório.
- **Travas de produção** (`backend/src/config/production-check.ts`). Com `NODE_ENV=production`, a API não sobe se:
  - `JWT_ACCESS_SECRET` tiver menos de 32 caracteres;
  - algum valor ainda for "troque…" do exemplo;
  - a URL não for https;
  - `CORS_ORIGINS` for `*`.

  O Swagger fica desligado por padrão. O seed recusa a senha de exemplo e o `SEED_DEMO`.
- **Backup:** `deploy/scripts/backup.sh`, com `pg_dump -Fc` e o tar do volume `storage`, retenção em dias e cópia opcional pelo rclone.
- **CI:** `.github/workflows/ci.yml` roda typecheck, lint e testes de cada pacote e o build das duas imagens.

## Monorepo
```
apps/api        NestJS (módulos por domínio)
apps/web        Next.js: /master, /empresa, /estudar + BFF de sessão (/api/sessao)
apps/mobile     Expo (instalação isolada, fora dos workspaces da raiz)
packages/shared cliente da API, sessão/perfis (areaFor), tokens de design, formatação, tipos das questões
packages/content-ingest  importação de conteúdo (folks.content/v1) e correção por tipo de questão
```

## Módulos da API (por domínio)
| Módulo | Responsabilidade |
|---|---|
| access | Isolamento multi-tenant (`resolveTenant`), regra de acesso a conteúdo, entitlements (plano), cotas de licença, regra de uma empresa por pessoa |
| auth | Login, refresh com rotação, troca de contexto, convite, nova senha, "ver como" |
| master | MASTERs, tenants e parametrização, usuários B2C, configurações gerais |
| companies | Departamentos, pessoas, convites, liberação de planetas, trilhas obrigatórias, engajamento, CSV |
| content | CRUD de conteúdo, builder transacional, importador do catálogo do protótipo |
| catalog | Telas do aluno (início, planetas, busca, trilhas obrigatórias) |
| learning | Trilha, aula, vídeo (anti-pulo), prática (banco ou gerada), infinita, jogos, desafio final |
| certificates | Emissão, templates, verificação pública |
| gamification | XP com teto, nível, jornada, hangar, eventos de engajamento |
| billing | Planos, RevenueCat, Asaas, AdMob SSV, lançamentos manuais |
| dashboards | MASTER, empresa e aluno |
| interactive | SCORM/xAPI/cmi5 + LRS embutido |
| vimeo | Conta, pastas, metadados, privacidade do embed |
| mcp | Servidor MCP (HTTP `/mcp` + stdio) para o Claude criar conteúdo |
| notifications | Lembrete diário (push) |
| email | Resend: convite, nova senha, lembrete |

## Padrões transversais
- **Guards globais:** throttler → JWT (revalida usuário e vínculo a cada request; bloqueia escrita no "ver como") → papéis (`@Roles`).
- **Erros:** mensagens em pt-BR prontas para o usuário; códigos de negócio em `error` (`daily_limit`, `other_company`, `license_limit`, `PREMIUM_REQUIRED`).
- **Auditoria:** `AuditService.log` em toda ação administrativa, com `via` api/mcp.
- **Idempotência:** webhooks gravam `WebhookEvent(provider, externalId)` antes de processar.
- **Transações:** builders de conteúdo e importações são transacionais; I/O externo (Vimeo) acontece **antes** da transação.
