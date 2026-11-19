# docker compose lê o .env e trata o $ da chave do Asaas como variável

> tags: aprendizado, docker, compose, env, segredos, asaas | origem: incidente | data: 2026-11-19

## Regra
Comandos docker compose em pastas com .env de segredos usam --env-file /dev/null (ou o .env próprio); segredo com $ no env do compose vai entre aspas simples; vazou, avisa e rotaciona.

## Contexto
Ao rodar o banco-teste.sh (docker compose exec), o compose carregou o backend/.env para interpolação; a ASAAS_API_KEY começa com $aact_ e virou uma 'variável não definida', e o aviso imprimiu boa parte da chave do sandbox na saída.

## O que estava errado
Rodar docker compose num diretório com .env que tem segredos começando com $, sem --env-file /dev/null, e escrever a chave sem aspas no deploy/.env.

## O que é correto
banco-teste.sh usa docker compose --env-file /dev/null. No deploy/.env (compose), segredo com $ vai entre aspas simples. Se um segredo aparecer em log/saída, avisar o usuário e recomendar trocar a chave.
