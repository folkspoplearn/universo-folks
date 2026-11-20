/**
 * PWA (versão web do app, até a publicação nas lojas):
 * - registra o service worker (/sw.js) no build de produção (nunca no `expo start --web`);
 * - guarda o convite de instalação do Android/Chrome (beforeinstallprompt) para o botão "Instalar";
 * - iPhone/Safari só toca som e voz depois de um toque: o primeiro toque "destrava" os dois,
 *   para a narração automática e os sons das aulas funcionarem.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
let started = false;

export function setupPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;

  if ('serviceWorker' in navigator && !__DEV__) {
    const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // o app mostra o próprio convite
    deferred = e as InstallEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => { deferred = null; listeners.forEach((l) => l()); });

  const unlock = () => {
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis?.speak(u);
    } catch { /* sem voz no navegador */ }
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ac = new Ctx();
        const src = ac.createBufferSource();
        src.buffer = ac.createBuffer(1, 1, 22050);
        src.connect(ac.destination);
        src.start(0);
        void ac.resume().finally(() => setTimeout(() => void ac.close().catch(() => undefined), 500));
      }
    } catch { /* sem Web Audio */ }
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('touchend', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchend', unlock, true);
}

/** Aberto pelo ícone da tela inicial (já instalado)? */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function canPromptInstall() { return !!deferred; }

/** Abre o convite nativo do Android/Chrome. true = a pessoa instalou. */
export async function promptInstall() {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  listeners.forEach((l) => l());
  return outcome === 'accepted';
}

export function onInstallAvailable(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * "Puxe para atualizar": confere se saiu uma versão nova do app (deploy novo na Vercel).
 * Se saiu, espera o service worker novo assumir e recarrega a página. true = vai recarregar.
 */
export async function checkAppUpdate(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || __DEV__) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update();
    if (!reg.installing && !reg.waiting) return false;
    // o sw.js novo faz skipWaiting + clients.claim: espera ele assumir (até 4 s) e recarrega
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 4000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(t); resolve(); }, { once: true });
    });
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}
