# Sem acesso aos binários do Prisma, gerar o cliente e rodar a API pelo motor wasm

> tags: aprendizado, prisma, ambiente, rede, testes, e2e, wasm | origem: teste | data: 2026-11-26

## Regra
Rede bloqueada não é motivo para entregar sem testar: use os motores locais (wasm) e diga no PR o que não pôde ser verificado

## Contexto
Ambiente de agente com rede restrita: binaries.prisma.sh bloqueado (prisma generate, validate e migrate falham com 403)

## O que estava errado
Desistir de checar tipos e de rodar os testes e2e porque o Prisma não baixa o schema-engine e o query-engine

## O que é correto
Gerar com PRISMA_QUERY_ENGINE_LIBRARY e PRISMA_SCHEMA_ENGINE_BINARY apontando para arquivos vazios (o generate usa o validador wasm embutido); para rodar a API, gerar uma cópia do schema com engineType client e driverAdapters e usar @prisma/adapter-pg só localmente (npm i --no-save), sem commitar; aplicar as migrações com psql. O migrate diff continua indisponível: avisar no PR
