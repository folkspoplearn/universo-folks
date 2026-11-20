import { useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { colors } from '@folks/shared';

/** iOS/Android: o "puxe para atualizar" nativo (RefreshControl). Na web/PWA: pull-refresh.web.tsx. */
export function RefreshableScroll({ children, onRefresh, contentContainerStyle }: { children: React.ReactNode; onRefresh?: () => Promise<unknown>; contentContainerStyle?: object }) {
  const [busy, setBusy] = useState(false);
  const refresh = onRefresh
    ? () => {
        setBusy(true);
        void onRefresh().finally(() => setBusy(false));
      }
    : undefined;
  return (
    <ScrollView contentContainerStyle={contentContainerStyle} refreshControl={refresh ? <RefreshControl refreshing={busy} onRefresh={refresh} tintColor={colors.amber} colors={[colors.amber]} /> : undefined}>
      {children}
    </ScrollView>
  );
}
