# ADR 0017 — Narração em voz alta nos cursos da Escola

> tags: adr, narração, narrador, voz, fala, tts, text-to-speech, expo-speech, pt-BR, escola, 1º ano, alfabetização, say, narr, narration, speakAfterAnswer, alto-falante, acessibilidade, voz neural, polly, azure, google tts | status: aceita | data: 2026-11-18

## Contexto
Nos cursos da aba **Escola**, um narrador lê em voz alta a tela, a pergunta e o retorno. No 1º ano isso é essencial, porque a criança ainda não lê. Nos outros anos, só lê quando a pessoa toca no alto-falante. As recomendações do cliente estão em 2026-11-18, em `decisoes-do-cliente`:
- voz do aparelho em pt-BR para textos que mudam;
- voz neural pré-gerada para textos fixos;
- tocar no silencioso do iPhone;
- não usar a voz do navegador em WebView;
- botão para repetir, opção para desligar, e parar a fala ao avançar.

O export do protótipo (`folks-content.json`, lotes 15 a 17) não segue o próprio LEIAME:
- **403 falas em português** vieram como `speakAfterAnswer` com `lang: "en-US"`. Seriam lidas com voz de inglês e só depois da resposta.
- Não há `narr: "auto"`, `slide.say` nem `question.say`. Só as rodadas dos widgets têm `say`/`fb`.

## Decisão
- **Formato (`folks.content/v1`):**
  - `say` na tela: lido ao abrir. Sem ele, lê título + texto.
  - `say` na questão: lido **antes** de responder. Sem ele, lê o enunciado.
  - `narration: "auto" | "button"` no curso.
  - `grade` no planeta: `1`–`9` ou `m1`–`m3`.
  - `speakAfterAnswer` fica só para a frase em outro idioma falada **depois** da resposta (inglês).
- **Importação (adaptador tolerante):**
  - Em planeta `para-a-escola`, todo `speakAfterAnswer` com lang `en*` e texto em português (`looksPortuguese`) vira `say` em pt-BR.
  - O relatório avisa a correção (`narration.lang_fixed`).
  - Curso da Escola sem `narration`: o 1º ano (`grade: 1`) fica `auto` e as outras séries ficam `button`.
  - Apelidos aceitos: `narr`, `narracao`, `falar`, `fala`.
- **Banco:** `courses.narration` (texto, nulo = sem narração) e `user_preferences.narration` (padrão ligado), na migração `narracao_em_voz_alta`. O `say` da questão fica em `media.say`, e o da tela no JSON da aula.
- **API:**
  - `GET /learning/lessons/:id` traz `narration`;
  - as questões trazem `say`;
  - `PATCH /me/preferences {narration}`;
  - painel e MCP aceitam `narration` no curso e `say` na tela.
- **App:**
  - Voz do aparelho em pt-BR pelo `expo-speech` (Android TextToSpeech, iOS AVSpeechSynthesizer), nunca o `speechSynthesis` de WebView.
  - Modo de áudio "toca no silencioso".
  - Uma fala por vez: avançar, tocar outro som ou sair da tela para a fala anterior.
  - Botão 🔊 Ouvir/Parar na tela e na pergunta.
  - No `auto`, lê sozinho:
    - a tela: o `say` ou o título + cada parte do texto conforme aparece;
    - a pergunta;
    - o resultado da rodada.
  - Chave "Narração em voz alta" nos Ajustes: desligada, nem o automático fala.
- **Regras do texto em um lugar só:** `@folks/shared/narration` (`slideSpeech`, `questionSpeech`, `feedbackSpeech`, `speakable`, `narrationFor`).

## Alternativas descartadas
- **Voz neural pré-gerada já agora:** exige conta paga num provedor e o Supabase Storage, que ainda não está ligado (ADR 0016). Fica para depois. O formato atual já serve: basta acrescentar a URL do áudio por hash do texto.
- **Ler a resposta a cada pergunta na prática do banco:** a correção é feita no servidor, no fim da rodada (ADR 0011). O app lê o resultado da rodada.
- **Corrigir o en-US em qualquer categoria:** fora da Escola, o `speakAfterAnswer` em inglês é intencional (cursos de inglês).

## Consequências
- Os 4 cursos da Escola do lote atual entram com narração. Os 2 do 1º ano ficam automáticos.
- **Ainda sem narração:** as rodadas dos widgets do 1º ano (`say`/`fb` em `KTAP`, `KSEQ`…). O app ainda não desenha esses widgets.
- A web não tem narração (só o app).
- A voz depende do aparelho: varia entre celulares e, sem voz pt-BR instalada, pode não sair som.
- **Custo estimado da voz neural** (US$ 16 por milhão de caracteres, uma vez por frase, com cache por hash):
  - Escola atual: cerca de 57 mil caracteres, menos de US$ 1;
  - catálogo inteiro: cerca de 600 mil caracteres, cerca de US$ 10.

## Pendências
- Escolher o provedor da voz neural e criar o gerador com cache por hash, depois do Supabase Storage.
- Narração nos widgets do 1º ano, quando forem implementados.
- Pedir ao cliente para corrigir o export: `say` em vez de `speakAfterAnswer` em en-US, `narr`, e as figuras das opções (`h`/`pic`, que vieram só com texto).
