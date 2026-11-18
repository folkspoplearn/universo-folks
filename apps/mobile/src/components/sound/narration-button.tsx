import { Pressable, View } from 'react-native';
import { colors } from '@folks/shared';
import { Text } from '@/components/ui';
import { SoundBars } from './sound-button';
import type { useNarrator } from '@/lib/narrator';

/** Alto-falante da narração: toca para ouvir (ou repetir); tocando de novo, para. */
export function NarrationButton({ narrator, text }: { narrator: ReturnType<typeof useNarrator>; text: string }) {
  if (!narrator.mode || !text) return null;
  const on = narrator.speaking;
  return (
    <Pressable
      onPress={() => (on ? narrator.stop() : void narrator.say(text))}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Parar a narração' : 'Ouvir em voz alta'}
      hitSlop={10}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99,
        backgroundColor: on ? `${colors.amber}33` : 'rgba(255,255,255,0.06)',
        borderWidth: 1, borderColor: on ? colors.amber : colors.cardBorder, opacity: pressed ? 0.8 : 1,
      })}>
      {on ? <SoundBars on /> : <Text size={16}>🔊</Text>}
      <View><Text weight="black" size={13} style={{ color: on ? colors.amber : colors.ink }}>{on ? 'Parar' : 'Ouvir'}</Text></View>
    </Pressable>
  );
}
