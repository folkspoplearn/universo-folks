import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedbackSpeech, narrationFor, questionSpeech, slideSpeech, speakable } from '../src/narration';

test('tela: usa o say; sem ele, título + texto (sem repetir o título)', () => {
  assert.equal(slideSpeech({ heading: 'A de abelha', text: 'Esta é a letra A.', say: 'Esta é a letra á, de abelha!' }), 'Esta é a letra á, de abelha!');
  assert.equal(slideSpeech({ heading: 'Toque e conte', text: 'Toque em cada figura.' }), 'Toque e conte. Toque em cada figura.');
  assert.equal(slideSpeech({ heading: 'Toque', text: 'Toque em cada figura.' }), 'Toque em cada figura.');
  assert.equal(slideSpeech({ heading: 'Partes', text: '', textParts: ['Primeiro.', 'Depois.'] }), 'Partes. Primeiro. Depois.');
});

test('pergunta: usa o say; sem ele, o enunciado', () => {
  assert.equal(questionSpeech({ prompt: 'Qual figura começa com A?', say: 'Qual figura começa com a letra á?' }), 'Qual figura começa com a letra á?');
  assert.equal(questionSpeech({ prompt: 'Quantos são?' }), 'Quantos são?');
});

test('a voz não lê HTML nem markdown', () => {
  assert.equal(speakable('You <b class="gapb">___</b> **happy**.'), 'You … happy.');
});

test('retorno de acerto e erro', () => {
  assert.equal(feedbackSpeech(true, 'São 3.'), 'Isso! São 3.');
  assert.equal(feedbackSpeech(false, 'ABELHA começa com A.'), 'Quase! ABELHA começa com A.');
  assert.equal(feedbackSpeech(true), 'Isso! Você acertou.');
});

test('narração só com curso narrado e preferência ligada', () => {
  assert.equal(narrationFor('auto', true), 'auto');
  assert.equal(narrationFor('auto', undefined), 'auto', 'preferência ainda carregando: vale o curso');
  assert.equal(narrationFor('auto', false), null, 'desligou nos Ajustes: nem o automático fala');
  assert.equal(narrationFor(null, true), null);
  assert.equal(narrationFor('button', true), 'button');
});
