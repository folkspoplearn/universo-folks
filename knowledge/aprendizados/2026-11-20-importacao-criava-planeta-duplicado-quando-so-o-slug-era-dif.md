# Importação criava planeta duplicado quando só o slug era diferente

> tags: aprendizado, importação, planeta, duplicado, em breve, slug | origem: usuario | data: 2026-11-20

## Regra
Ao importar, um nome igual na mesma categoria é o mesmo planeta: nunca criar duplicata silenciosa

## Contexto
Trilha importada para um planeta que já existe como 'Em breve' no catálogo, com outro slug (gestao-de-tempo x tempo)

## O que estava errado
Casar planeta só pelo slug: nascia um segundo 'Gestão de Tempo' em rascunho e o aluno continuava vendo o 'Em breve'

## O que é correto
Sem o mesmo slug, casar pelo nome/nome curto na mesma categoria (fora arquivados) e preencher o existente (targetSlug); com dois de mesmo nome, bloquear pedindo o slug
