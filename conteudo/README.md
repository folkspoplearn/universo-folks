# Conteúdo criado no Claude (protótipo Universo Folks)

Esta pasta é a entrega de conteúdo que o João aprova no protótipo. Toda atualização chega aqui por pull request, e quem revisa e aprova é o Kewen.

| Arquivo ou pasta | O que é |
|---|---|
| `folks-content.json` | Todos os planetas, cursos, aulas e práticas, já conferidos com o `packages/content-ingest` (0 erros). É este arquivo que se importa na plataforma. |
| `LEIAME.md` | Histórico de cada lote: o que mudou, os formatos novos e o que falta desenvolver no app. A seção mais recente fica no fim. |
| `personagens/` | SVGs dos 9 personagens adultos em 4 expressões (`<personagem>-<expressão>.svg`). |
| `prototipo/index.html` | O protótipo completo, para comparar o visual. Abra no navegador. A voz embutida fica em `tts.js`. |
| `prototipo/img/` e `prototipo/vid/` | Fotos e vídeos usados nos cursos: Mecânica (`mec`), Violão (`gtr`) e Corpo humano (`corpo`). No JSON, uma imagem `corpo/coracao` aponta para `img/corpo/coracao.jpg`, e os vídeos já vêm com o caminho completo (`vid/corpo/coracao.mp4`). |

## Como conferir antes de importar
```bash
npm --prefix packages/content-ingest run build
node -e "const I=require('./packages/content-ingest/dist');const r=I.ingest({content:require('./conteudo/folks-content.json')});console.log('erros',r.errors,'avisos',r.warnings)"
```
Os avisos que aparecem são o que ainda falta desenvolver no app: widgets de aula, metodologias de gerador e simuladores. A lista está no `LEIAME.md`.
