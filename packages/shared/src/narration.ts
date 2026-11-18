/**
 * Narração em voz alta (cursos da Escola): o que falar em cada momento. Fonte única para o app e a web.
 * - "auto": lê sozinho ao abrir cada tela e pergunta (1º ano: a criança ainda não lê)
 * - "button": só quando a pessoa toca no alto-falante
 * Retorno de acerto/erro: lido depois da resposta, em qualquer modo, se a narração estiver ligada.
 */
export type Narration = 'auto' | 'button';
export const NARRATION_LANG = 'pt-BR';

/** HTML/markdown leve fora, espaços normalizados (a voz não lê "<b>" nem "**"). */
export function speakable(text: string | null | undefined): string {
  return (text ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/_{2,}/g, '…') // lacuna "___" vira uma pausa
    .replace(/[*`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tela de aula: `say` ou título + texto. */
export function slideSpeech(s: { heading?: string; text?: string; textParts?: string[]; say?: string }): string {
  if (s.say) return speakable(s.say);
  const body = s.text || s.textParts?.join(' ') || '';
  const parts = [s.heading, body].map(speakable).filter(Boolean);
  // título que já é o começo do texto não é lido duas vezes
  if (parts.length === 2 && parts[1].toLowerCase().startsWith(parts[0].toLowerCase())) return parts[1];
  return parts.map((p) => (/[.!?…:]$/.test(p) ? p : `${p}.`)).join(' ');
}

/** Pergunta: `say` ou o enunciado. */
export function questionSpeech(q: { prompt: string; say?: string }): string {
  return speakable(q.say || q.prompt);
}

/** Retorno depois da resposta: acerto = "Isso!" + explicação; erro = o porquê da opção (ou a explicação). */
export function feedbackSpeech(correct: boolean, why?: string | null): string {
  const w = speakable(why);
  if (correct) return w ? `Isso! ${w}` : 'Isso! Você acertou.';
  return w ? `Quase! ${w}` : 'Quase! Vamos tentar a próxima.';
}

/** A narração vale para esta etapa? (curso com narração E aluno com a preferência ligada) */
export function narrationFor(courseNarration: Narration | null | undefined, prefOn: boolean | undefined): Narration | null {
  if (!courseNarration || prefOn === false) return null;
  return courseNarration;
}
