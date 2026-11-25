# folks-content.json: o que mudou em relação ao exemplo do Kewen

O arquivo segue o `folks.content/v1` que ele mandou: planets → courses → units → lessons (LESSON / PRACTICE) → exam com `questionSource: "BANK"`.
O que está no exemplo dele foi mantido igual. Para os cursos funcionarem como no protótipo, foram precisos alguns **campos a mais**.
Todos são opcionais: quem ainda não usa um campo pode ignorá-lo.

## Campos novos
| Onde | Campo | Para quê |
|---|---|---|
| unit | `isFree` | No plano grátis, as unidades com `true` ficam liberadas (as 2 primeiras de cada curso). |
| unit | `color` | Cor da unidade na trilha. |
| planet | `accessTier: "FREEMIUM"` | Planeta de Para a vida: parte é grátis, parte é premium (por `isFree`). |
| course | `badge` | Insígnia que o aluno ganha ao concluir o curso. |
| slide | `textParts` | O texto já dividido em partes. A tela mostra uma parte por vez, nunca tudo de uma vez. |
| slide | `widget` | Elemento interativo da aula (lista abaixo). |
| slide | `check` | Pergunta "confere rapidinho" depois do slide, no mesmo formato das questões. |
| question | `options[].feedback` | Por que aquela opção está errada. Toda resposta errada explica o motivo. |
| question | `visual` / `visualAfterAnswer` | Imagem (SVG) mostrada na pergunta ou depois da resposta. |
| question | `audio` | Áudio da pergunta, falado pela voz do próprio aparelho: `{kind:"TTS", lang:"en-US", text}`. |
| question | `timeLimitMs` | Tempo da questão. |
| question | `methodology` | De qual formato/gerador a questão saiu. |
| practice | `questionsPerRound` | Quantas questões cada rodada tem. |
| practice | `generators` | Os dados que geram questões sem fim (prática infinita). `questions` traz um banco já gerado, para começar sem gerador. |

## Personagens e cenários (novo)
- `characters`: os 9 personagens aprovados (Thaís, Marcos, Júlia, Rafael, Ana, Pedro, Samira, Dona Isabel e Thiago). Cada um vem com 4 expressões em SVG: `neutral`, `happy`, `unsure` e `upset`.
- `scenes`: os cenários disponíveis (`cafe`, `sala`, `reuniao`).
- Na conversa simulada (`widget.type: "CHAT"`), `dlg.cast` diz qual personagem aparece e `dlg.scene` diz o cenário. `dlg.tts: true` manda falar as falas em inglês, `pt` em cada fala é a tradução mostrada embaixo, e `dlg.end` traz os textos de encerramento daquela conversa.
- Dentro das perguntas e das aulas, o rosto do personagem não vai desenhado: vai só a referência `<use data-character="thais" data-expression="neutral"/>`. O app troca essa referência pelo desenho que está em `characters`. Isso deixou o arquivo bem menor.
- A expressão muda conforme a qualidade da resposta: `g` → happy, `m` → unsure, `b` → upset. Antes da primeira resposta, o personagem fica neutral.

## Tipos de questão (além de SINGLE_CHOICE)
- `TRUE_FALSE`: mito ou verdade (2 opções).
- `NUMBER`: o aluno digita o número; o campo `answer` traz a resposta.
- `ORDER`: colocar os passos em ordem; `pieces` chega embaralhado e `answer` é a ordem certa.
- `BUILD_SENTENCE`: montar a frase com blocos; pode ter uma peça a mais.
- `MATCH_PAIRS`: ligar as colunas `left` e `right`. Itens com o mesmo texto do lado direito podem ser trocados entre si.
- `CLASSIFY`: colocar cada item no grupo certo.
- `SIMULATOR`: desafio com sliders. A regra de acerto de cada simulador ainda precisa ser programada.

## Widgets de aula
`EXPLORE` (ilustração tocável), `STEPS` (passo a passo), `FLIP` (cartões antes e depois), `CHAT` (conversa simulada ramificada), `REFLECT` (reflexão aberta, privada do aluno, que nunca aparece para o ADM da empresa), `SORTG` (classificar), `SIM` (simulador), `MODES`, `PRON`, `PHRASE`, `MAO` (mão animada no violão mostrando o movimento: com palheta, sem palheta, abafado, polegar e dedos; `m` diz qual) e `GROOVE` (tocar junto: `p` é a batida, com 6, 8 ou 16 posições, `bpm`, `prog` os acordes e `ramp0` liga o modo que acelera a cada volta).
O que cada um faz está descrito em detalhe no `folks-cursos.json` (seção `formats`).

## Atualização de 11/11: cursos antigos de Música e Matemática
O arquivo agora tem os 29 cursos do protótipo, em 10 planetas. Entraram: Entendendo o violão, Cifras e acordes, Teclado do zero, Como tocar violão de ouvido, Estúdio de ritmos, Campo harmônico no violão, Entendendo a porcentagem e Tabuadas.

### Tipos de questão novos (só nos cursos de Música)
| type | O que o aluno faz | Campos |
|---|---|---|
| `BUILD_CHORD` | Monta o acorde tocando nas casas do braço do violão. | `chord`, `shape` (casas e dedos de cada corda) |
| `TAP_FRETBOARD` | Toca em uma casa do braço. | `string` (1 a 6), `fret`, `label` |
| `TAP_KEYBOARD` | Toca uma tecla ou um acorde no teclado da tela. | `mode`, `pitchClass` (0 = Dó … 11 = Si), `rangeMidi`, `markMidi` |

### Som (campo `sound`)
Questões de ouvido trazem `sound: {kind:"SYNTH", sequence:[...]}`. O app toca a sequência antes de mostrar as opções:
- `NOTE`: uma nota, em `midi`.
- `CHORD`: um acorde, com `rootMidi` e `quality`.
- `PROGRESSION`: uma progressão, com `keyMidi` (tom) e `degrees` (graus do campo harmônico, 0 = I).
No protótipo o som é gerado no próprio aparelho com Web Audio (sem arquivos de áudio). O código está em `frontend/universo-folks.html`.

### Aulas de tocar junto (`playAlong: true`)
São aulas em que o aluno toca no violão de verdade acompanhando a batida. Cada slide tem `widget.type: "GROOVE"` com o padrão (`p`: D = para baixo, U = para cima, X = abafado, - = pausa), `bpm` e a progressão de acordes.

### Cursos especiais (campo `special`, sem `units`)
- `RHYTHM_STUDIO` (Estúdio de ritmos): lista de estilos em `styles`, cada um com suas batidas. É Premium.
- `EMBEDDED_GAME` (Campo harmônico): jogo pronto no arquivo `frontend/campo-harmonico.html`, aberto dentro do app.

### Unidades
Nos cursos antigos, `isFree` segue a mesma regra: as 2 primeiras unidades são grátis.

## Atualização de 12/11
- O arquivo tem 47 cursos em 11 planetas. Entrou o planeta **Meu Negócio** (6 cursos de empreendedorismo) e novos cursos em Português, Inglês, Matemática e Dinheiro.
- Alguns geradores e slides trazem o campo `note` com o aviso de que limites e taxas são de 2026. Esses cursos (principalmente "Abrindo a sua empresa" e "Impostos sem susto") precisam de revisão anual.
- Não há tipos de questão novos: tudo usa os formatos que já existiam.

## Atualização de 12/11 (tarde): vídeo dentro da aula
- O curso **Fundamentos do Feedback** foi refeito em 10 unidades, uma por vídeo.
- O primeiro slide de cada unidade tem `widget.type: "VIDEO"` com o campo `vimeo` no formato `id/hash` (ex.: `1246364597/9b31587cc2`). O endereço do player é `https://player.vimeo.com/video/{id}?h={hash}`.
- No protótipo, o slide só libera a pergunta depois que o player avisa que o vídeo chegou perto do fim.
- O mesmo código gera um pacote SCORM 1.2 por curso (`tools/scorm.py`). No pacote, a trilha é sequencial e o progresso vai em `cmi.suspend_data`.

## Simulador de orçamento (Organização financeira)
- Novo widget de aula `ORC` (no protótipo: `w:'orc'`) com `goal`: `montar` (≥1 entrada, ≥2 fixos, ≥2 variáveis), `cenario` (≥2 cenários com sobra diferente) ou `sobra` (sobra ≥10% das entradas).
- Dados do usuário: `{cur, cen:[{n, it:[{t:'e'|'f'|'v', n, v, c?}]}]}` (até 4 cenários; "Novo cenário" copia o atual). Salvar por usuário.
- O mesmo simulador abre sem meta no cartão "Simulador livre" da tela do curso, ao lado da Prática infinita (cursos com `lab`).
- Saíram do curso as perguntas de conta (quanto sobra, 50-30-20, calcule a reserva) e as repetições de "fixo ou variável".

## Simuladores livres (widget `LAB`)
- Slides com `widget:{type:'LAB',lab,goal}`. `lab`: `dv` (dívidas), `iv` (investimento), `ng` (números do negócio). O de orçamento continua como `ORC`.
- Todos têm cenários (até 4; "Novo cenário" copia o atual) e abrem sem meta no cartão de simulador da tela do curso.
- `dv`: dados `{pg, it:[{n,s,j}]}` (pagamento mensal; saldo e juros % ao mês). Cálculo: todo mês aplica juros em cada dívida e usa `pg` na de maior juro primeiro; limite de 600 meses = "não quita". Metas: `montar` (≥2 dívidas e quita), `cen` (2 cenários com resultado diferente).
- `iv`: dados `{ini, ap, anos, tx}`. Taxa mensal = (1+tx)^(1/12)−1, aportes mensais. Metas: `meta` (chegar a R$ 50 mil), `cen`.
- `ng`: dados `{pr, cu, qt, it:[{n,v}]}` (preço, custo por venda, vendas no mês, custos fixos). Lucro = pr·qt − cu·qt − fixos; equilíbrio = teto(fixos ÷ (pr − cu)). Metas: `montar`, `lucro`, `cen`.
- Saíram desses três cursos as práticas de conta (quanto cresce, faça a conta, quanto lucrou, qual é a margem, quanto para empatar) e a repetição de "fixo ou variável".

## Lote 14 (14/11/2026)
- Fotografia: novo curso "Foto e vídeo pelo celular" (entre Fundamentos e Modo manual).
- Novo planeta Tecnologia: "Introdução à inteligência artificial" e "Introdução à programação" (com o simulador do robô: repetir N vezes, andar A casas, virar).
- Novo planeta Vida adulta: "Seus direitos no trabalho", "Morando por conta própria" e "Seus direitos de consumidor".
- Todos usam formatos já existentes (SIM, FLIP, STEPS, SORTG, CHAT e as práticas de sempre).

## Lote 14 (14/11/2026)
- Fotografia: "Foto e vídeo pelo celular". Planeta Tecnologia: "Introdução à inteligência artificial" e "Introdução à programação". Planeta Vida adulta: "Seus direitos no trabalho", "Morando por conta própria", "Seus direitos de consumidor".

## Lote 15 · Para a escola (15/11/2026)
- Nova categoria `para-a-escola` (no protótipo: `g:'escola'`, terceira aba da tela inicial). Planetas: Letras e palavras (1º ano), Ciências (8º ano), Redação (3ª série EM).
- **Narrador**: `falar(texto)` usa a voz do aparelho em pt-BR (`speechSynthesis`, `lang='pt-BR'`). Botão de alto-falante no topo de toda aula e prática da escola. Cursos com `narr:'auto'` (1º ano) leem sozinhos a cada tela. Texto lido: `slide.say` ou título + texto; em pergunta, `question.say`.
- Perguntas com figura: opção com `h` (HTML da figura) e `pic:true` na pergunta. Metodologias novas de pergunta: `pick_image`, `listen_pick_image`.
- Widgets novos de aula (campo `w`): `kvog` (cartas das vogais), `kpick` (toque na figura; `rounds:[{L,o,ok}]`), `ksyl` (sílabas móveis e ditado; `rounds:[{k,x,dit}]`), `kmem` (jogo da memória; `pairs`), `kscene` (ache na cena; `finds`), `circ` (montar circuito), `circ2` (laboratório série x paralelo), `det` (detetive; `pistas`, `q`, `opts` com a 1ª correta), `mark` (toque na frase; `rounds:[{ask,s,ok,why,dica}]`), `prop` (montar proposta; `slots:[{n,q,o:[[texto,correta,porquê]]}]`).
- As figuras do 1º ano são SVG desenhados no código (`KART`). No app real podem ser trocadas por imagens 3D mantendo as chaves (bola, gato, pato, sapo, casa, dado, bolo, lua, abelha, estrela, ilha, ovo, uva).

## Lote 16 · 1º ano (16/11/2026)
- A aba Escola passa a ser organizada por série: planetas "1º ano", "8º ano" e "3ª série do médio" (as chaves dos planetas não mudaram).
- 1º ano · Matemática: novo curso "Brincando com números" (`esc-mat-1`). 1º ano · Português: nova unidade "Primeiras consoantes" em "Aventura das letras".
- Widgets novos (campo `w`): `kcount` (toque e conte; `rounds:[{k,n}]`), `kcmp` (mais ou menos; `rounds:[{k,a,b,ask}]`), `kadd` (juntar e tirar; `rounds:[{k,a,b,op}]`), `kseq` (sequências; `rounds:[{s,o,ok}]`), `ktap` (escute e toque; `rounds:[{say,t,o,ok,fb}]`).
- Metodologias novas de pergunta: `count_objects`, `compare_groups`, `add_objects`, `subtract_objects`, `next_in_pattern`, `number_neighbor`, `count_sides`.

## Escola: escolha da série antes dos planetas (16/11/2026)
- Em "Para a escola", a primeira tela é uma lista de séries (1º ao 9º ano e 1ª a 3ª série do médio). Séries sem conteúdo aparecem como "Em breve".
- Depois de escolher, aparecem os planetas, um por matéria. Cada planeta da escola tem `grade`: `1` a `9` para o fundamental, `m1` a `m3` para o médio.
- Planetas atuais: Língua Portuguesa e Matemática (grade 1), Ciências (grade 8), Redação (grade m3).

## Lote 17 · 1º ano · Matemática, parte 2 (16/11/2026)
- "Brincando com números" passa a ter 10 unidades: entraram Números até 100, Onde está?, Medir e comparar, Os dias da semana e Nosso dinheiro.
- `ktap` aceita `vis` (figura acima das opções) e opções com tamanho (`'bola@.38'` = figura em 38% do tamanho). `kseq` aceita `say` por rodada.
- Figuras novas em `KART`: sol, moeda de 1 real (`m1`), notas (`n2`, `n5`, `n10`, `n20`), cenas de posição (`p_cima`, `p_baixo`, `p_lado`, `p_dentro`, `p_fora`, `p_esq`, `p_dir`, `p_perto`, `p_longe`), fitas (`fita1` a `fita3`). Funções de desenho: `kTen(dezenas, unidades)` e `kBal(esquerda, direita, esquerdaMaisPesada)`.
- Metodologias novas de pergunta: `tens_and_ones`, `compare_size`, `compare_weight`, `compare_money`, `count_money`.

## Lote 18 · 1º ano, parte 3 (17/11/2026)
- "Aventura das letras" passa a ter 10 unidades: entraram O alfabeto, Mais consoantes, O meu nome, Frases, Rimas e parlendas, Listas e bilhetes.
- Novo curso 1º ano · Ciências: "Meu corpo e o mundo" (`esc-cie-1`), 5 unidades: Meu corpo, Os cinco sentidos, Cuidar do corpo, Do que é feito?, O dia e a noite.
- Widgets novos (campo `w`): `kline` (toque na ordem; `rounds:[{seq,x?,say,fb}]`), `ksort` (dois grupos; `b:[grupo1,grupo2]`, `items:[[figura,grupo,porquê,fala?]]`), `khot` (toque no desenho; `sc:'corpo'`, `rounds:[{id,t,say,fb}]`).
- Figuras novas em `KART` (corpo, frutas, objetos, materiais) com as mesmas chaves usadas nos dados.

## Narrador: voz embutida (17/11/2026)
- Quando a voz do aparelho não fala (ex.: visualizador do app do Claude), o protótipo carrega `tts.js` (meSpeak) e toca o áudio pelo `AudioContext`. A voz é robótica: no app real, usar a voz do aparelho (Android `TextToSpeech`, iOS `AVSpeechSynthesizer`) ou áudio gravado.

## Lote 22 · Mecânica com fotos reais (22/11/2026)
- "Mecânica básica: entenda o seu carro" foi refeito com as fotos ultra-realistas. Agora tem 8 unidades: Abrindo o capô, Debaixo do capô, Luzes do painel, Verificando o óleo, Água/freio/limpador, Calibrando o pneu, Trocando o pneu, A chupeta. As 2 primeiras são grátis.
- As fotos vão no arquivo `folks-imagens-mecanica.zip` (34 JPGs, 1100 px de largura). No JSON, cada foto é referenciada pelo nome sem extensão (ex.: `capo-alavanca`); o caminho no protótipo é `img/mec/<nome>.jpg`.
- Widgets novos (campo `w`):
  - `fseq` (passo a passo com foto): `steps:[[foto, texto]]`. Um passo por tela, com miniaturas dos passos já vistos.
  - `ford` (ordem com fotos): `steps:[[foto, texto]]` na ordem certa; o app embaralha. Erro mostra qual passo é a foto tocada.
  - `fhot` (pontos de toque na foto): `img`, `hs:[[chave, x%, y%]]`, `parts:{chave:[nome, texto, cor?]}`, `zoom:{chave:foto}` (foto de perto que aparece no painel), `need` (quantos tocar).
  - `fpick` (escolher a foto certa): `rounds:[{q, ok, o:[[foto, legenda, porquê]]}]`; com `img` na rodada, as opções são texto: `o:[[texto, porquê]]`.
- Metodologias novas de pergunta: `identify_on_photo` (foto de perto → nome da peça) e `pick_photo` (função → escolher a foto).
- Mecânica: práticas simplificadas. Sem "mito ou verdade" e sem revisões entre unidades (`noRev:true` no curso). Nos cursos de passo a passo (capô, óleo, calibragem, troca de pneu, chupeta), a prática é refazer a ordem com as fotos (nó de aula com `play`). Ficaram como pergunta só "Reconheça pela foto" (peças) e "Luzes do painel".

## Lote 23 · Personagens novos e revisão de metodologia (24/11/2026)
**Personagens adultos (as crianças da aba Escola não mudaram)**
- Os 9 adultos (Thaís, Marcos, Júlia, Rafael, Ana, Pedro, Samira, Dona Isabel, Thiago) foram redesenhados no estilo "geométrico expressivo": formas grossas e arredondadas, sem contorno, olhos grandes. Os SVGs estão em `folks-personagens-adultos.zip` (`<personagem>-<expressão>.svg`, viewBox 0 0 140 215).
- Expressões: `neutral` (durante a pergunta), `happy` (acerto), `unsure` (erro do aluno), `upset` (conflito dentro de um diálogo). O personagem pisca sempre e mexe a boca enquanto fala.

**Layout novo da tela de pergunta (layout A)**
- Quando a pergunta tem um personagem, ele aparece grande à esquerda (cerca de 42% da largura, recorte de busto viewBox `14 12 112 134`) e a fala fica num balão branco à direita. O astronauta pequeno some dessa tela, e quem reage ao acerto ou erro é o próprio personagem.
- No JSON, o personagem vem em `visual.speaker` (lista de chaves, ex.: `["rafael"]` ou `["pedro","ana"]`). O texto do balão é o próprio visual (contexto do diálogo em `dlgq/dlgctx` ou frase com lacuna). Sem texto, o balão mostra a frase do guia. O `parseVisual` do `@folks/shared` já repassa o `speaker` (PR #1 no GitHub).
- Os diálogos (`w:'chat'`) usam o mesmo layout: personagem à esquerda e a fala dele no balão. A resposta escolhida aparece num balão azul no lugar.

**Revisão de metodologia (todos os cursos)**
- "Mito ou verdade" só ficou onde existem mitos comuns sobre o tema, e no máximo 1 por curso: Investimento do zero, Saindo das dívidas, Direitos de consumidor, Direitos no trabalho, Como o universo funciona, Estrelas e galáxias, Conta de luz, Eletricidade do zero, Eletricidade (escola), Introdução à IA, Respeito na internet, Impostos sem susto.
- Saiu de todos os outros cursos (matemática, teoria musical, português, Meu Negócio, fotografia, feedback, convivência, programação, Morando por conta própria, redação), inclusive dos "Treinos mistos" e das revisões desses cursos.
- "Ligue os termos" (decorar nomes) saiu onde o curso não pede decoreba: Direitos no trabalho, Fundamentos da fotografia, Morando por conta própria (garantias) e Redação (falácias). Ficou 1 em Introdução à IA e 1 em Introdução à programação. As competências e os elementos da proposta na Redação continuam, porque o ENEM cobra.
- Sem revisões entre unidades (`noRev:true`) nos cursos que são de aplicar, não de decorar: Feedback, Convivência (3 cursos), Vida adulta (3 cursos), Fotografia (3 cursos) e Introdução à IA.
- Continuam com treino de repetição os cursos em que decorar é o objetivo: tabuadas, porquês, crase, acentuação, inglês, acordes, teclado e os cursos da Escola.

**Formato conferido com o importador (`packages/content-ingest`) em 24/11/2026: 0 erros**
- Montar acorde, tocar no braço do violão e tocar no teclado agora chegam como `SIMULATOR`, com `simulator.id` = `build_chord`, `tap_fretboard` ou `tap_keyboard`. Antes vinham com tipos próprios e davam 375 erros.
- Os geradores que vinham com a metodologia `auto` agora trazem a metodologia real da prática (ex.: `multiple_choice`, `calc_number`, `classify`). `single_choice` virou `multiple_choice`, que é o nome usado no catálogo.
- Na Escola, a narração da pergunta vai em `say` (pt-BR), e não mais em `speakAfterAnswer` em inglês.
- Os avisos que sobram são o que falta desenvolver no app: 62 widgets de aula, 21 metodologias de gerador (as da Escola, das fotos e dos instrumentos) e 17 simuladores.

## Lote 24 · Corpo humano e violão com fotos e vídeos reais (24/11/2026)
**Novo planeta "Corpo humano"** (galáxia Para a vida), curso "Como o corpo funciona" (`corpo-1`). São 9 unidades (as 2 primeiras grátis): O corpo em camadas, Ossos e articulações, Músculos e movimento, Coração e sangue, A respiração, A digestão, Rins e baço, Cérebro, nervos e sentidos, e Reprodução. O curso não tem revisões entre as unidades (`noRev:true`). A prática é sobre as próprias imagens.

**Violão:** as fotos e os vídeos reais entraram no lugar dos desenhos da mão (widget `mao`):
- "Ritmos no violão": palheta, batida com e sem palheta, mão solta, batida de perto, as duas mãos juntas, abafado, baixo com o polegar, polegar e dedos.
- "Entendendo o violão": nova tela de postura ("Como segurar o violão").
- "Cifras e acordes" (Trocando entre os maiores): vídeo da troca de acordes.

**Arquivos:** `folks-midia-corpo-violao.zip` traz `img/corpo/*.jpg` (30), `img/gtr/*.jpg` (14), `vid/corpo/*.mp4` (6) e `vid/gtr/*.mp4` (5). As fotos têm até 1100 px; os vídeos têm 960 px, 8 s, H.264 com som. No JSON, as imagens aparecem como `corpo/<nome>` ou `gtr/<nome>` (caminho `img/<pasta>/<nome>.jpg`), e os vídeos pelo caminho completo (`vid/...mp4`).

**Widgets novos (campo `w`):**
- `fvid`: vídeo curto em loop, sem som até a pessoa tocar no alto-falante. Campos: `src` e `cap` (legenda).
- `flayer`: camadas do corpo. Campo: `layers:[[chave, nome, texto]]`. A imagem é `corpo/<chave>-m` ou `corpo/<chave>-f`, com botões Homem e Mulher.

**Ajustes em widgets existentes:**
- `fhot`: aceita `tall:true` para imagens em pé (corpo inteiro). Nesse caso a imagem fica com 54% da altura da tela, e os pontos continuam em % da imagem.
- `fseq`: aceita `ct:true` (imagem inteira, sem cortar). Com 1 passo só, não mostra miniaturas nem contador.

**Metodologias de pergunta:**
- `identify_on_image` (já existe no app): imagem com um ponto marcado e a pergunta "Que parte é esta?". Os dados de cada imagem (pontos e nomes) vêm no gerador.
- `identify_on_photo` e `pick_photo`: as mesmas da Mecânica, agora com os órgãos.
- "O caminho do alimento" é um nó de aula com `ford` (boca → estômago → pâncreas e fígado → intestinos).

## Lote 25 · Escola 1º ano: História e Geografia (24/11/2026)
Com isso o 1º ano tem as 5 matérias: Português, Matemática, Ciências, História e Geografia.

**Novo planeta "História" (galáxia Escola, série 1),** curso "Minha história" (`esc-his-1`), com 5 unidades: Eu cresci, Minha família, Minha escola, Brincadeiras de ontem e de hoje, e O tempo passa. Insígnia "Pequeno Historiador".

**Novo planeta "Geografia" (galáxia Escola, série 1),** curso "Meus lugares" (`esc-geo-1`), com 5 unidades: Minha casa, O caminho da escola, Como está o tempo?, Os lugares do bairro, e Cuidar e respeitar. Insígnia "Pequeno Explorador".

Os dois seguem o padrão do 1º ano: narração automática, pouco texto, imagens no lugar de leitura e uma prática por unidade, com treino misto no fim.

**Widget novo (`w:'kpath'`, tipo `KPATH` no JSON):** mapa em grade com setas. A criança leva o personagem até o destino desviando dos obstáculos.
- Campos de cada rodada: `a:[x,y]` (início), `b:[x,y]` (destino), `w:[[x,y]]` (obstáculos), `to` (imagem do destino, padrão `escola`), `me` (personagem, padrão `crianca`), `ob` (obstáculo, padrão `arvore`), `g:[colunas,linhas]` (padrão 4×4), `say` (narração) e `fb` (frase ao chegar).
- Errar o movimento não tira ponto: a voz diz "aí não dá para passar".

**Também usam:** `kline`, `ktap`, `ksort` e `kcmp`, que já estavam no LP, na Matemática e em Ciências.
**Importador:** 0 erros. Os avisos dos dois cursos são os mesmos dos outros cursos do 1º ano (widgets K* e a metodologia `pick_image`, ainda por desenvolver).

## Voz gravada na Escola (24/11/2026)
O protótipo agora toca falas gravadas com uma voz neural em pt-BR (Kokoro, voz "pf_dora"), no lugar da voz robótica do motor embutido. São 5.046 frases do 1º ano, de Ciências do 8º ano e de Redação da 3ª série, em `prototipo/voz/<2 letras>.json`. Cada arquivo guarda os mp3 em base64, e a chave é o hash FNV-1a da frase.
- A fala é dividida em frases, e cada frase vira um clipe. Se faltar o clipe de alguma frase, a fala inteira vai para a voz do aparelho, como antes.
- Isso é coisa do protótipo. No app de verdade, a ADR 0017 continua valendo (voz do aparelho). Se quiserem a voz gravada também no app, dá para gerar os áudios no build a partir do JSON.
