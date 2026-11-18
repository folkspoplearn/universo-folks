import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NARRATION_LANG, narrationFor, type Narration } from '@folks/shared';
import { useSession } from './session';
import { playSound, stopSound } from './sound';

/**
 * Narrador (cursos da Escola): voz do próprio aparelho em pt-BR (Android TextToSpeech, iOS
 * AVSpeechSynthesizer, pelo expo-speech). Não usa a voz do navegador dentro de WebView.
 * - Uma fala por vez: falar de novo, tocar outro som ou sair da tela para a fala anterior.
 * - iPhone: o modo de áudio "toca no silencioso" é ligado antes (playSound -> audioMode).
 * - Respeita a preferência "Narração em voz alta" dos Ajustes (desligada = nem o automático fala).
 * Nada é gravado: o app só fala.
 */
export function useNarrator(courseNarration: Narration | null | undefined) {
  const { api } = useSession();
  const prefs = useQuery({ queryKey: ['me', 'preferences'], queryFn: () => api.me.preferences(), staleTime: 5 * 60_000 });
  const mode = narrationFor(courseNarration, prefs.data?.narration);
  const [speaking, setSpeaking] = useState(false);
  const alive = useRef(true);
  const seq = useRef(0);

  useEffect(() => () => { alive.current = false; stopSound(); }, []);

  const say = useCallback(async (text: string) => {
    if (!text) return;
    const my = ++seq.current;
    setSpeaking(true);
    try { await playSound({ kind: 'TTS', lang: NARRATION_LANG, text }); }
    finally { if (alive.current && my === seq.current) setSpeaking(false); }
  }, []);

  const stop = useCallback(() => { seq.current++; stopSound(); setSpeaking(false); }, []);

  return { mode, speaking, say, stop };
}

/**
 * Modo automático: fala `text` sempre que `key` muda (nova tela, nova pergunta). Um pequeno atraso
 * deixa a tela trocar antes; trocar de novo antes disso cancela a fala anterior.
 */
export function useAutoSpeak(n: ReturnType<typeof useNarrator>, key: string, text: string) {
  const { mode, say } = n;
  useEffect(() => {
    if (mode !== 'auto' || !text) return;
    const t = setTimeout(() => { void say(text); }, 350);
    return () => clearTimeout(t);
    // fala só quando a tela muda, não a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, key]);
}
