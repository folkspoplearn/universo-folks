import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Refresh token no Keychain (iOS) / Keystore (Android). ADR 0012.
 * Web (PWA, ADR 0018): não há SecureStore. Fica no localStorage para a sessão sobreviver a fechar
 * e abrir o app instalado (no sessionStorage, o iPhone pedia login a cada abertura). Mitigações:
 * refresh com rotação (cada uso troca o token), access token curto e só em memória, nenhum script
 * de terceiros na página (o Vimeo roda em iframe isolado) e "Sair" apaga o token.
 */
const KEY = 'folks.refresh';
const web = Platform.OS === 'web';

function webStore(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export const refreshStore = {
  get: async () => {
    if (!web) return SecureStore.getItemAsync(KEY);
    const s = webStore();
    // sessão aberta antes do PWA (sessionStorage): migra uma vez
    const legacy = globalThis.sessionStorage?.getItem(KEY);
    if (legacy && s && !s.getItem(KEY)) { s.setItem(KEY, legacy); globalThis.sessionStorage?.removeItem(KEY); }
    return s?.getItem(KEY) ?? null;
  },
  set: async (v: string) => (web ? webStore()?.setItem(KEY, v) : SecureStore.setItemAsync(KEY, v)),
  clear: async () => {
    if (!web) return SecureStore.deleteItemAsync(KEY);
    webStore()?.removeItem(KEY);
    globalThis.sessionStorage?.removeItem(KEY);
  },
};
