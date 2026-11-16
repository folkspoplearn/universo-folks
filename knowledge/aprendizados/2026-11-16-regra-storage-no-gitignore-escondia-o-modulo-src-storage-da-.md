# Regra storage/ no .gitignore escondia o módulo src/storage da API

> tags: aprendizado, git, gitignore, dockerignore, deploy, build | origem: incidente | data: 2026-11-16

## Regra
Padrão de ignore de pasta de dados é sempre ancorado (/pasta/); antes de enviar ao GitHub, rode git status --ignored e confira que nada de src/ ficou de fora. O build Docker a partir de um clone limpo é a prova.

## Contexto
O build Docker de produção falhou: backend/src/storage/storage.service.ts nunca entrou no git, porque 'storage/' (sem barra no início) no .gitignore casa com qualquer pasta storage, inclusive a do código. O repositório no GitHub não compilava.

## O que estava errado
Usar 'storage/' (ou '**/storage') para ignorar a pasta de arquivos enviados.

## O que é correto
Ancorar o padrão na raiz (/backend/storage/ ou /storage/ no .gitignore da API) e conferir com git status --ignored que nenhum arquivo de src/ está ignorado.
