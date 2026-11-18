# gerar.sh dizia 'nada a migrar' com o banco de dev fora do ar

> tags: aprendizado, prisma, migracao, gerar.sh, harness | origem: incidente | data: 2026-11-18

## Regra
Saída vazia de um comando que falhou não é 'nada a fazer': sempre checar o código de saída antes de concluir que não há mudança.

## Contexto
Ao criar a migração da narração, o Postgres de dev estava parado; o gerar.sh escondia o erro do prisma migrate diff (2>/dev/null) e respondia 'Nada a migrar', como se o schema já estivesse sincronizado.

## O que estava errado
Engolir o stderr e tratar saída vazia do diff como 'sem mudanças'.

## O que é correto
O gerar.sh agora checa o código de saída do diff e para com a mensagem do Prisma quando ele falha. Antes de gerar, confira que o banco de dev está no ar (docker ps).
