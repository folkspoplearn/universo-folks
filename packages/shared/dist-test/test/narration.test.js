"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const narration_1 = require("../src/narration");
(0, node_test_1.test)('tela: usa o say; sem ele, título + texto (sem repetir o título)', () => {
    strict_1.default.equal((0, narration_1.slideSpeech)({ heading: 'A de abelha', text: 'Esta é a letra A.', say: 'Esta é a letra á, de abelha!' }), 'Esta é a letra á, de abelha!');
    strict_1.default.equal((0, narration_1.slideSpeech)({ heading: 'Toque e conte', text: 'Toque em cada figura.' }), 'Toque e conte. Toque em cada figura.');
    strict_1.default.equal((0, narration_1.slideSpeech)({ heading: 'Toque', text: 'Toque em cada figura.' }), 'Toque em cada figura.');
    strict_1.default.equal((0, narration_1.slideSpeech)({ heading: 'Partes', text: '', textParts: ['Primeiro.', 'Depois.'] }), 'Partes. Primeiro. Depois.');
});
(0, node_test_1.test)('pergunta: usa o say; sem ele, o enunciado', () => {
    strict_1.default.equal((0, narration_1.questionSpeech)({ prompt: 'Qual figura começa com A?', say: 'Qual figura começa com a letra á?' }), 'Qual figura começa com a letra á?');
    strict_1.default.equal((0, narration_1.questionSpeech)({ prompt: 'Quantos são?' }), 'Quantos são?');
});
(0, node_test_1.test)('a voz não lê HTML nem markdown', () => {
    strict_1.default.equal((0, narration_1.speakable)('You <b class="gapb">___</b> **happy**.'), 'You … happy.');
});
(0, node_test_1.test)('retorno de acerto e erro', () => {
    strict_1.default.equal((0, narration_1.feedbackSpeech)(true, 'São 3.'), 'Isso! São 3.');
    strict_1.default.equal((0, narration_1.feedbackSpeech)(false, 'ABELHA começa com A.'), 'Quase! ABELHA começa com A.');
    strict_1.default.equal((0, narration_1.feedbackSpeech)(true), 'Isso! Você acertou.');
});
(0, node_test_1.test)('narração só com curso narrado e preferência ligada', () => {
    strict_1.default.equal((0, narration_1.narrationFor)('auto', true), 'auto');
    strict_1.default.equal((0, narration_1.narrationFor)('auto', undefined), 'auto', 'preferência ainda carregando: vale o curso');
    strict_1.default.equal((0, narration_1.narrationFor)('auto', false), null, 'desligou nos Ajustes: nem o automático fala');
    strict_1.default.equal((0, narration_1.narrationFor)(null, true), null);
    strict_1.default.equal((0, narration_1.narrationFor)('button', true), 'button');
});
