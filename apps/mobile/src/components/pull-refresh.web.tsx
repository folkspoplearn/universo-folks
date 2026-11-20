import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { colors } from '@folks/shared';

const TRIGGER = 64; // px puxados (já com a resistência) para atualizar
const MAX = 96;

/**
 * Web/PWA: "puxe para atualizar" feito à mão. A página trava a rolagem do navegador
 * (overscroll-behavior: none, para o app instalado não "quicar"), então o gesto nativo do
 * navegador não existe e o react-native-web não implementa o RefreshControl.
 * Só age com o dedo (touch), com a lista no topo e puxando para baixo.
 */
export function RefreshableScroll({ children, onRefresh, contentContainerStyle }: { children: React.ReactNode; onRefresh?: () => Promise<unknown>; contentContainerStyle?: object }) {
  const ref = useRef<ScrollViewInstance>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  });
  const enabled = !!onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const node = (ref.current as unknown as { getScrollableNode?: () => HTMLElement })?.getScrollableNode?.();
    if (!node) return;
    let startY: number | null = null;
    let dist = 0;
    const run = async () => {
      busyRef.current = true;
      setBusy(true);
      setPull(TRIGGER);
      const started = Date.now();
      try {
        await refreshRef.current?.();
      } catch {
        /* a tela mostra o erro da própria consulta */
      }
      // o indicador fica pelo menos 0,5 s, para a pessoa ver que atualizou
      await new Promise((r) => setTimeout(r, Math.max(0, 500 - (Date.now() - started))));
      busyRef.current = false;
      setBusy(false);
      setPull(0);
    };
    const start = (e: TouchEvent) => {
      startY = node.scrollTop <= 0 && !busyRef.current && e.touches.length === 1 ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || node.scrollTop > 0) {
        if (dist) setPull((dist = 0));
        return;
      }
      dist = Math.min(MAX, dy * 0.5);
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // segura a página enquanto puxa
    };
    const end = () => {
      if (startY == null) return;
      startY = null;
      if (dist >= TRIGGER) void run();
      else setPull(0);
      dist = 0;
    };
    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', end);
    node.addEventListener('touchcancel', end);
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
    };
  }, [enabled]);

  const ready = pull >= TRIGGER;
  return (
    <View style={{ flex: 1 }}>
      <View
        accessibilityLiveRegion="polite"
        style={{ height: pull, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: pull ? 10 : 0 }}
      >
        {pull > 8 ? (
          busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={colors.amber} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>Atualizando…</Text>
            </View>
          ) : (
            <Text style={{ color: ready ? colors.amber : colors.muted, fontSize: 13 }}>
              {ready ? '↻ Solte para atualizar' : '↓ Puxe para atualizar'}
            </Text>
          )
        ) : null}
      </View>
      <ScrollView ref={ref} style={{ flex: 1 }} contentContainerStyle={contentContainerStyle}>
        {children}
      </ScrollView>
    </View>
  );
}
