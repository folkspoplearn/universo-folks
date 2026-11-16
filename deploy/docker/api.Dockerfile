# API (NestJS + Prisma). Contexto do build = raiz do repositório:
#   docker build -f deploy/docker/api.Dockerfile .
# Alvos:
#   build   -> tem as dependências de desenvolvimento: roda migração (prisma migrate deploy) e seed
#   runtime -> imagem enxuta que serve a API (padrão)

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------- build
FROM base AS build
# @folks/content-ingest vem do workspace da raiz (lockfile da raiz)
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/content-ingest/package.json packages/content-ingest/
RUN npm ci -w @folks/content-ingest --ignore-scripts --no-audit --no-fund
COPY packages/content-ingest packages/content-ingest
RUN npm run build -w @folks/content-ingest

# a API tem lockfile próprio e usa o content-ingest por file:
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --no-audit --no-fund
COPY backend backend
RUN cd backend && npx prisma generate && npx nest build
WORKDIR /app/backend

# ---------------------------------------------------------------- runtime
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/content-ingest/package.json packages/content-ingest/
RUN npm ci -w @folks/content-ingest --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=build /app/packages/content-ingest/dist packages/content-ingest/dist

COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
# cliente do Prisma gerado no build (o CLI do prisma fica só na imagem de build)
COPY --from=build /app/backend/node_modules/.prisma backend/node_modules/.prisma
COPY --from=build /app/backend/dist backend/dist
COPY backend/prisma/schema.prisma backend/prisma/schema.prisma

WORKDIR /app/backend
RUN mkdir -p storage && chown -R node:node storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
