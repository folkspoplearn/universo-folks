"use strict";
// Conta do aluno/colaborador no app e na web: Hangar, preferências, progresso, empresa e planos.
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPANY_STATUS_LABEL = exports.DAILY_GOALS = exports.HANGAR_SLOTS = void 0;
exports.outfitOf = outfitOf;
exports.maskDocument = maskDocument;
/** Abas do Hangar, na ordem e com os nomes do protótipo. */
exports.HANGAR_SLOTS = [
    { slot: 'SUIT', label: 'Traje' },
    { slot: 'DETAILS', label: 'Detalhes' },
    { slot: 'VISOR', label: 'Viseira' },
    { slot: 'HEAD', label: 'Cabeça' },
    { slot: 'BACK', label: 'Costas' },
];
const OUTFIT_KEY = { SUIT: 'suit', DETAILS: 'accent', VISOR: 'visor', HEAD: 'head', BACK: 'back' };
/** Itens equipados (ou um item que está sendo experimentado) viram a roupa do astronauta. */
function outfitOf(h, preview) {
    const out = {};
    for (const s of h?.slots ?? []) {
        const it = s.items.find((i) => i.equipped);
        if (it)
            out[OUTFIT_KEY[s.slot]] = it.key;
    }
    if (preview)
        out[OUTFIT_KEY[preview.slot]] = preview.key;
    return out;
}
exports.DAILY_GOALS = [20, 50, 100, 150];
/** CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00) enquanto a pessoa digita. */
function maskDocument(raw) {
    const d = raw.replace(/\D/g, '').slice(0, 14);
    if (d.length <= 11)
        return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}
/** Situação do colaborador na empresa (GET /me/company → status). */
exports.COMPANY_STATUS_LABEL = {
    INVITED: 'Convite enviado',
    ON_TRACK: 'Em dia',
    LATE: 'Atrasado',
    NOT_STARTED: 'Não começou',
    DONE: 'Concluiu',
};
