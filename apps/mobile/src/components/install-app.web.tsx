import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius } from '@folks/shared';
import { canPromptInstall, isStandalone, onInstallAvailable, promptInstall } from '@/lib/pwa';
import { Button, Text } from './ui';

/**
 * Convite para instalar o Universo Folks na tela inicial (PWA), enquanto o app não está nas lojas.
 * - Android/Chrome: botão "Instalar" abre o convite do próprio navegador.
 * - iPhone/iPad (Safari): o iOS não tem convite; o cartão mostra o caminho Compartilhar → Adicionar à Tela de Início.
 * Some quando o app já está instalado ou se a pessoa tocar em "Agora não" (volta depois de 14 dias).
 */
const KEY = 'folks.install.dismissed';
const DAYS = 14;

function dismissedRecently() {
  try { const t = Number(globalThis.localStorage?.getItem(KEY) ?? 0); return Date.now() - t < DAYS * 86_400_000; } catch { return false; }
}
const isIos = () => typeof navigator !== 'undefined' && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function InstallApp({ compact }: { compact?: boolean }) {
  const [hidden, setHidden] = useState(() => isStandalone() || dismissedRecently());
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  useEffect(() => onInstallAvailable(() => setCanPrompt(canPromptInstall())), []);

  const ios = isIos();
  if (hidden || (!canPrompt && !ios)) return null;

  function dismiss() {
    try { globalThis.localStorage?.setItem(KEY, String(Date.now())); } catch { /* sem armazenamento */ }
    setHidden(true);
  }

  return (
    <View accessibilityRole="summary" style={{ marginTop: compact ? 0 : 16, marginBottom: compact ? 12 : 0, padding: 14, borderRadius: radius.lg, backgroundColor: `${colors.purple}1f`, borderWidth: 1, borderColor: `${colors.purple}66`, gap: 8 }}>
      <Text weight="black" size={16}>📲 Instale o Universo Folks</Text>
      {ios ? (
        <Text tone="muted" size={14} style={{ lineHeight: 21 }}>
          No Safari, toque em <Text weight="black" size={14}>Compartilhar</Text> (o quadrado com a seta ⬆) e depois em <Text weight="black" size={14}>Adicionar à Tela de Início</Text>. O app abre em tela cheia, como os outros.
        </Text>
      ) : (
        <Text tone="muted" size={14} style={{ lineHeight: 21 }}>Fica na tela inicial e abre em tela cheia, como um app. Não ocupa quase nada de espaço.</Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
        {!ios && <Button title="Instalar" onPress={async () => { if (await promptInstall()) setHidden(true); }} style={{ paddingVertical: 10, paddingHorizontal: 18 }} />}
        <Pressable onPress={dismiss} accessibilityRole="button" hitSlop={8}><Text tone="dim" weight="bold" size={13}>Agora não</Text></Pressable>
      </View>
    </View>
  );
}
