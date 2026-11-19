# Decisões do cliente (registro datado)

> tags: decisões, cliente, histórico, regras | fonte: conversas com o cliente e protótipo

Toda decisão do cliente entra aqui com data. Quando uma decisão contradiz o arquitetura.md ou o protótipo, **vale a mais recente**.

| Data | Decisão | Impacto |
|---|---|---|
| 2026-11-09 | Stack: Node.js + TypeScript + PostgreSQL. | NestJS + Prisma na API. |
| 2026-11-09 | O protótipo do cliente é a base de **regras, telas e conteúdo**; o código back-end dele não é usado. | Catálogo real em `content/catalog.json`; ver `knowledge/prototipo/`. |
| 2026-11-09 | **Uma pessoa só pode estar em uma empresa.** | ADR 0003; garantido no banco (`one_company_key`). |
| 2026-11-09 | Gateway de pagamento: **Asaas** (conta em análise). | ADR 0006; Premium web + contratos B2B. |
| 2026-11-09 | Integração com o **Vimeo** já. | Token, pastas, ligar vídeos às lições, embed restrito. |
| 2026-11-09 | O MASTER parametriza por empresa a **quantidade limite de colaboradores e de administradores** (cotas separadas). | ADR 0004. |
| 2026-11-09 | Reconstruir com uma **estrutura de desenvolvimento assistido por IA** (agentes, skills, harness, RAG, feedback). | Este repositório. |
| 2026-11-09 | **Conexão do Claude com a plataforma: só para o MASTER, e só para criar e editar conteúdo** (planeta, cursos, trilhas). O MASTER conecta o Claude à plataforma web e pede pelo chat. | ADR 0007: MCP remoto com OAuth (conector do claude.ai), escopo restrito a conteúdo, sem relatórios nem dados de pessoas/financeiro. |

| 2026-11-10 | Primeiro lote real do Claude do cliente (`folks-content.json`: Dinheiro, Fotografia, Inglês, Mecânica e Feedback). Ele segue o `folks.content/v1` com campos a mais: 6 tipos de questão novos, widgets de aula, confere rapidinho, texto em partes, imagens, áudio, tempo, metodologia e geradores com dados. | ADR 0011; `knowledge/produto/tipos-de-questao-e-widgets.md`. |
| 2026-11-10 | Planeta `FREEMIUM`: parte grátis, parte Premium, definido por `isFree` na unidade (as 2 primeiras de cada curso). | Planeta `FREE` + unidade `accessTier` FREE/PREMIUM. |
| 2026-11-10 | Curso com progresso que precisa de trilha nova: **arquivar o antigo e criar o novo** (aplicado ao Fundamentos do Feedback). | O curso arquivado sai do casamento da importação; matrículas, progresso e certificados ficam. |
| 2026-11-10 | Reflexão (widget `REFLECT`) é **privada do aluno**: nunca aparece para o ADM da empresa. | Armazenamento ainda não existe (pendência na ADR 0011). |

| 2026-11-11 | **App mobile em React Native com Expo** (não Capacitor). Stack da web a nosso critério. | ADR 0012: web em Next.js, app em Expo e núcleo `@folks/shared`. O app é a área de estudo; os painéis do MASTER e da empresa ficam na web. |
| 2026-11-13 | **Planos do aluno por galáxia**: Básico (só cursos gratuitos), Premium (gratuito + Para a vida + Para o trabalho) e Premium Plus (todas as galáxias). O MASTER acrescenta galáxias a cada plano. | ADR 0014; regras-de-negocio §4.1; menu Planos. Empresas seguem pelo contrato. Preço do Premium Plus ainda não definido. |
| 2026-11-13 | Criar planeta pode partir de uma **pasta do Vimeo com subpastas**: pasta = planeta, subpasta = curso (módulo), vídeo = unidade. | importacao-de-conteudo.md; MCP `vimeo_folder_tree` e `get_vimeo_transcript`. |
| 2026-11-13 | O MASTER precisa **organizar os vídeos** para corrigir equívocos do Claude na criação. | Tela Conteúdo › planeta › Organizar vídeos; API `/master/content/planets/:id/video-board`; MCP `review_planet_videos` / `organize_planet_videos`. |
| 2026-11-13 | Cursos "Para a vida" de **violão** (e, no futuro, canto e fotografia) usam **som em vez de vídeo**: notas e tons (grave/agudo), prática de ouvido e prática com **microfone** (tocar ou cantar a nota). | ADR 0015; aula de som (`audioDemos`), `listen_choose`, `mic_pitch` / `play_or_sing_note`, geradores `pitch`…`sing`; modelo de trilha `som-e-pratica`. Fotografia com câmera ainda em breve. |
| 2026-11-16 | **Primeiro deploy no Supabase (banco) e na Vercel (API e web)**, plano Hobby da Vercel por enquanto. | ADR 0016; guia `deploy/vercel-supabase.md`. Limitações: 4,5 MB por requisição, SCORM só com Supabase Storage, cron 1x/dia. VPS com Docker (`deploy/README.md`) fica para depois. |
| 2026-11-18 | **Narração em voz alta na Escola**: lê a tela, a pergunta e o retorno. No 1º ano lê sozinha; nos outros anos, pelo botão de alto-falante. Recomendações do cliente: voz do aparelho em pt-BR para textos que mudam, voz neural pré-gerada para textos fixos, tocar no silencioso do iPhone, não usar a voz do navegador em WebView, botão para repetir, opção para desligar e parar ao avançar. Privacidade: só fala, não grava. | ADR 0017. Voz do aparelho agora; voz neural depois (precisa de provedor pago e Supabase Storage; menos de US$ 1 para a Escola atual). Export do cliente corrigido na importação (403 falas pt marcadas en-US). |
| 2026-11-18 | **PWA do app por enquanto**: o app roda pelo navegador e pode ser instalado na tela inicial até a publicação nas lojas, que vem em breve. | ADR 0018. Export web do próprio app Expo (projeto 3 da Vercel, raiz `apps/mobile`), com service worker e convite para instalar (Android: botão; iPhone: Compartilhar → Adicionar à Tela de Início). Sem compras nas lojas nem push no PWA. |
| 2026-11-18 | **Premium pelo Asaas**: testar primeiro no sandbox. Formas de pagamento: Pix, cartão e boleto (o aluno escolhe na fatura). Ciclos mensal e anual para Premium e Premium Plus, com preço definido depois pelo MASTER no menu Planos. | ADR 0019. Web e PWA pagam pelo Asaas; o app das lojas, pela RevenueCat. Troca para plano maior: a antiga é cancelada quando a nova é paga. Descer de plano: cancelar antes. |

## Herdado do protótipo (aceito)
- Plano grátis: unidades 1 e 2 de cada curso; 1 rodada/dia de prática infinita (12 exercícios); 1 jam/dia.
- Anúncio com recompensa só para **adultos**, nunca no meio da lição, nunca em empresa nem no Premium.
- Premium nas lojas via **RevenueCat**.
- Engajamento = pessoa que fez pelo menos uma atividade no dia (fuso de São Paulo).
- Nota mínima da prova final: padrão **80%**, configurável por empresa.

## Em aberto (perguntar ao cliente)
- Suspender automaticamente uma empresa com boleto vencido há N dias?
- Preços e product ids dos planos Premium e Premium Plus.
- Regras detalhadas do B2G.
- URLs do Vimeo dos vídeos do Feedback (serão ligadas pela pasta quando houver token).
- Regra de acerto de cada simulador (`saldo`, `juros`, `reserva`, câmera...) para corrigir no servidor.
