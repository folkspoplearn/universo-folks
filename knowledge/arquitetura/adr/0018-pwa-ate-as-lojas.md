# ADR 0018 — PWA do app enquanto ele não está nas lojas

> tags: adr, pwa, progressive web app, instalar, tela inicial, adicionar à tela de início, service worker, offline, manifesto, manifest, ícone, expo export web, vercel, ios, safari, android, chrome, localStorage, refresh token, sessão | status: aceita | data: 2026-11-18

## Contexto
O app (Expo, `apps/mobile`) ainda não foi publicado na App Store e no Google Play. O cliente quer que alunos e colaboradores já usem o app pelo celular até a publicação. O Expo gera a versão web do mesmo código (`expo export -p web`, saída "single"). As partes da web já existiam:
- microfone: `mic.web.ts`;
- som: `sound-file.web.ts`;
- vídeo: `video-frame.web.tsx`.

Faltava o que torna a versão web instalável e utilizável como app: manifesto, ícones, service worker, sessão persistente e o convite para instalar.

## Decisão
- **PWA = export web do próprio app**, sem código separado. É o projeto 3 da Vercel, com raiz em `apps/mobile` (`vercel.json`):
  - instala o `@folks/shared` pelo workspace da raiz;
  - fallback de SPA para `index.html`;
  - `sw.js` sem cache;
  - `/_expo/static` com cache imutável.
- **`public/index.html`** (modelo do Expo): `lang="pt-BR"`, manifesto, `theme-color`, tags `apple-mobile-web-app-*`, `apple-touch-icon` e `viewport-fit=cover`.
- **`manifest.webmanifest`:** `display: standalone`, retrato, cores do app (`#03040f`), ícones 192/512 e maskable 512 em `public/icons/`.
  - Os ícones mostram o planeta roxo do `PlanetOrb`.
  - O ícone padrão do modelo do Expo (`assets/images/icon.png`) **não** é a marca: ainda precisa ser trocado para as lojas.
- **Service worker (`public/sw.js`):**
  - navegação: rede primeiro e, sem internet, o `index.html` em cache;
  - scripts com hash: cache primeiro;
  - na instalação, guarda os scripts citados no `index.html`, para abrir offline já na primeira visita;
  - **nunca guarda respostas da API** nem de outros sites;
  - registrado só no build de produção (`!__DEV__`, `lib/pwa.web.ts`).
- **Convite para instalar** (`components/install-app.web.tsx`), na tela de entrar e no Início:
  - Android/Chrome: botão "Instalar" (`beforeinstallprompt`);
  - iPhone: instrução "Compartilhar → Adicionar à Tela de Início";
  - some quando o app já está instalado ou por 14 dias depois de "Agora não".
- **iPhone/Safari só toca som e voz depois de um toque:** o primeiro toque destrava a voz (`speechSynthesis`) e o áudio (Web Audio). Assim a narração automática (ADR 0017) e os sons das aulas funcionam.
- **Puxe para atualizar** (2026-11-20): a página trava a rolagem do navegador (`overscroll-behavior: none`) e o react-native-web não implementa o `RefreshControl`, então o PWA não tinha como atualizar.
  - `RefreshableScroll` (`pull-refresh.web.tsx`): gesto com o dedo, com a lista no topo ("Puxe…", "Solte…", "Atualizando…"). No iOS/Android nativo usa o `RefreshControl`.
  - Está em todo `Screen` com rolagem. Fica desligado no login, no cadastro e no player da etapa (`refresh={false}`).
  - Ao soltar: busca de novo as consultas da tela e confere se saiu versão nova do app (`checkAppUpdate`): se saiu, espera o service worker novo e recarrega a página.
- **Sessão na web:** o refresh token vai para o `localStorage` (antes era o `sessionStorage`, e o iPhone pedia login a cada abertura do app instalado). O que existia no `sessionStorage` é migrado uma vez. Mitigações:
  - rotação do refresh a cada uso;
  - access token curto e só em memória;
  - nenhum script de terceiros na página (o Vimeo roda em iframe);
  - "Sair" apaga o token.

## Alternativas descartadas
- **Usar a web Next (`/estudar`) como PWA:** é outra interface. O app Expo é o que vai para as lojas, e o PWA testa exatamente a mesma experiência.
- **Refresh em cookie httpOnly da API:** o PWA e a API ficam em domínios diferentes. O cookie seria de terceiros e o Safari (ITP) bloqueia. Fica para quando houver domínio próprio comum (ex.: `app.` e `api.` do mesmo domínio).
- **Workbox/next-pwa:** é dependência a mais para um service worker de 60 linhas, com regras simples e testadas.

## Consequências
- O aluno instala pelo navegador. Os recursos nativos no PWA:
  - compras nas lojas (RevenueCat) não existem: a aba Premium explica que a assinatura chega na versão das lojas;
  - push não existe.
- A voz da narração no PWA é a do navegador: varia por aparelho e, no iPhone, só depois do primeiro toque.
- O token na web fica no `localStorage`: um XSS na página poderia lê-lo. A sessão continua revogável pela rotação e pelo "Sair".
- O CORS da API precisa incluir o endereço do PWA.
- Quando o app for para as lojas, o PWA pode continuar como opção ou ser desligado (remover o projeto 3 da Vercel).

## Pendências
- Ícone e splash definitivos da marca (os do PWA são provisórios, e os do app nativo ainda são do modelo do Expo).
- Domínio próprio para o PWA, a web e a API (permite o cookie httpOnly no lugar do `localStorage`).
- Testar num iPhone e num Android reais: instalar, som no silencioso, microfone e narração.
