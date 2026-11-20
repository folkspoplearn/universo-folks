# Publicar o planeta não publicava os cursos importados

> tags: aprendizado, conteúdo, publicação, importação, em breve, catálogo | origem: usuario | data: 2026-11-20

## Regra
Ao mudar a situação de um pai (planeta), conferir o que o aluno realmente vê: a visibilidade depende também da situação dos filhos

## Contexto
Planeta criado pela importação ou pelo MCP (cursos nascem DRAFT) e depois publicado pelo MASTER no seletor de situação

## O que estava errado
Mudar só o status do planeta: o catálogo do aluno só conta cursos PUBLISHED, então o planeta publicado aparecia 'Em breve'

## O que é correto
Publicar o planeta publica junto, na mesma transação, os cursos DRAFT com unidades (ContentService.updatePlanet); cursos COMING_SOON e ARCHIVED ficam como estão
