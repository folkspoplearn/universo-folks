/* Service worker do PWA do Universo Folks.
 * - Abre offline: a "casca" do app (index.html + scripts) fica em cache.
 * - Navegação: rede primeiro (sempre a versão nova), cache só sem internet.
 * - Scripts e imagens com hash no nome (/_expo/static, /assets): cache primeiro (nunca mudam).
 * - NUNCA guarda respostas da API nem de outros sites (dados do aluno, tokens, Vimeo).
 */
const VERSION = 'folks-pwa-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    // os scripts do app (com hash) citados no index.html: offline já na primeira visita
    try {
      const html = await (await fetch('/index.html', { cache: 'no-cache' })).text();
      const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).filter((s) => s.startsWith('/'));
      await c.addAll(scripts);
    } catch { /* sem rede na instalação: os scripts entram no cache na próxima abertura */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const immutable = (url) => url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/');

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API, Vimeo, fontes externas: direto na rede

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  if (immutable(url)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // demais arquivos do próprio site (ícones, manifesto): cache e atualiza em segundo plano
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
