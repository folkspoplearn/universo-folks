"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NARRATION_LANG = void 0;
exports.speakable = speakable;
exports.slideSpeech = slideSpeech;
exports.questionSpeech = questionSpeech;
exports.feedbackSpeech = feedbackSpeech;
exports.narrationFor = narrationFor;
exports.NARRATION_LANG = 'pt-BR';
/** HTML/markdown leve fora, espaços normalizados (a voz não lê "<b>" nem "**"). */
function speakable(text) {
    return (text ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/_{2,}/g, '…') // lacuna "___" vira uma pausa
        .replace(/[*`#>]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
/** Tela de aula: `say` ou título + texto. */
function slideSpeech(s) {
    if (s.say)
        return speakable(s.say);
    const body = s.text || s.textParts?.join(' ') || '';
    const parts = [s.heading, body].map(speakable).filter(Boolean);
    // título que já é o começo do texto não é lido duas vezes
    if (parts.length === 2 && parts[1].toLowerCase().startsWith(parts[0].toLowerCase()))
        return parts[1];
    return parts.map((p) => (/[.!?…:]$/.test(p) ? p : `${p}.`)).join(' ');
}
/** Pergunta: `say` ou o enunciado. */
function questionSpeech(q) {
    return speakable(q.say || q.prompt);
}
/** Retorno depois da resposta: acerto = "Isso!" + explicação; erro = o porquê da opção (ou a explicação). */
function feedbackSpeech(correct, why) {
    const w = speakable(why);
    if (correct)
        return w ? `Isso! ${w}` : 'Isso! Você acertou.';
    return w ? `Quase! ${w}` : 'Quase! Vamos tentar a próxima.';
}
/** A narração vale para esta etapa? (curso com narração E aluno com a preferência ligada) */
function narrationFor(courseNarration, prefOn) {
    if (!courseNarration || prefOn === false)
        return null;
    return courseNarration;
}
