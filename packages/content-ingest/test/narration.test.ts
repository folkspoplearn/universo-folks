import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingest, publicQuestion, toStorage, looksPortuguese, type ChoiceQuestion } from '../src';

const opts = [{ text: 'SAPO', isCorrect: false }, { text: 'ABELHA', isCorrect: true }];
const planet = (category: string, grade: string | number | undefined, course: Record<string, unknown>) => ({
  schemaVersion: 'folks.content/v1',
  planets: [{ key: 'p', slug: 'p', name: 'Planeta', category, accessTier: 'FREE', ...(grade !== undefined ? { grade } : {}), courses: [{
    key: 'p.c', slug: 'c', title: 'Curso', hasCertificate: false, units: [{ title: 'Unidade 1', lessons: [
      { type: 'LESSON', title: 'Aula', slides: [{ heading: 'Toque e conte', text: 'Toque em cada figura.', say: 'Toque em cada figura para contar.' }] },
      { type: 'PRACTICE', title: 'Prática', questions: [
        { type: 'SINGLE_CHOICE', prompt: 'Qual figura começa com A?', speakAfterAnswer: { lang: 'en-US', text: 'Qual figura começa com a letra á?' }, options: opts },
        { type: 'SINGLE_CHOICE', prompt: 'Complete a frase.', speakAfterAnswer: { lang: 'en-US', text: 'You are happy.' }, options: opts },
      ] },
    ] }],
    ...course,
  }] }],
});
const courseOf = (r: ReturnType<typeof ingest>) => r.bundle.planets[0].courses[0];
const lessonsOf = (r: ReturnType<typeof ingest>) => courseOf(r).units[0].lessons as any[];

test('Escola: fala em português marcada como en-US vira a narração da pergunta (say)', () => {
  const r = ingest({ content: planet('para-a-escola', 1, {}) });
  const [q1, q2] = lessonsOf(r)[1].questions;
  assert.equal(q1.say, 'Qual figura começa com a letra á?');
  assert.equal(q1.speakAfterAnswer, undefined, 'a fala não fica mais como "depois da resposta"');
  assert.deepEqual(q2.speakAfterAnswer, { lang: 'en-US', text: 'You are happy.' }, 'frase em inglês de verdade continua');
  assert.ok(r.issues.some((i) => i.code === 'narration.lang_fixed' && /1 fala/.test(i.message)), 'o relatório avisa a correção');
});

test('Escola 1º ano: narração automática; outras séries: pelo botão', () => {
  assert.equal(courseOf(ingest({ content: planet('para-a-escola', 1, {}) })).narration, 'auto');
  assert.equal(courseOf(ingest({ content: planet('para-a-escola', 'm3', {}) })).narration, 'button');
  assert.equal(courseOf(ingest({ content: planet('para-a-escola', 8, { narr: 'auto' }) })).narration, 'auto', 'narr do arquivo vale');
  assert.equal(ingest({ content: planet('para-a-escola', 8, {}) }).bundle.planets[0].grade, '8');
});

test('fora da Escola nada muda: sem narração e speakAfterAnswer mantido', () => {
  const r = ingest({ content: planet('para-a-vida', undefined, {}) });
  assert.equal(courseOf(r).narration, undefined);
  assert.equal(lessonsOf(r)[1].questions[0].speakAfterAnswer.lang, 'en-US');
  assert.equal(lessonsOf(r)[1].questions[0].say, undefined);
});

test('say da tela e da questão chega ao banco e ao aluno', () => {
  const r = ingest({ content: planet('para-a-escola', 1, {}) });
  assert.equal(lessonsOf(r)[0].slides[0].say, 'Toque em cada figura para contar.');
  const q = lessonsOf(r)[1].questions[0] as ChoiceQuestion;
  const st = toStorage(q);
  assert.equal((st.media as any).say, 'Qual figura começa com a letra á?');
  const pub = publicQuestion({ id: 'q1', type: st.type, prompt: st.prompt, explanation: st.explanation, points: 1, media: st.media, data: st.data, options: st.options.map((o, i) => ({ id: `o${i}`, ...o })) } as any);
  assert.equal((pub as any).say, 'Qual figura começa com a letra á?');
});

test('apelidos: falar/narracao no slide e narracao "automática" no curso', () => {
  const raw = planet('para-a-escola', 3, { narracao: 'automática' }) as any;
  raw.planets[0].courses[0].units[0].lessons[0].slides[0] = { titulo: 'Oi', texto: 'Olá', falar: 'Olá, vamos começar!' };
  const r = ingest({ content: raw });
  assert.equal(courseOf(r).narration, 'auto');
  assert.equal(lessonsOf(r)[0].slides[0].say, 'Olá, vamos começar!');
});

test('looksPortuguese separa português de inglês', () => {
  assert.equal(looksPortuguese('Conte as figuras. Quantas são?'), true);
  assert.equal(looksPortuguese('Toque na figura: sapo.'), true);
  assert.equal(looksPortuguese('You are happy.'), false);
  assert.equal(looksPortuguese('What is your name?'), false);
});
