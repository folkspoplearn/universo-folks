// e2e: narração em voz alta (cursos da Escola): importação corrige a fala em pt marcada como en-US,
// 1º ano fica automático, o app recebe narration + say, e o aluno pode desligar nas preferências.
// Rode contra um banco DE TESTE (skill testes-e2e):
//   bash ../skills/testes-e2e/banco-teste.sh criar narr
//   PORT=3011 DATABASE_URL=...universo_folks_test_narr node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/narracao.mjs
const API = process.env.API_URL ?? 'http://localhost:3011/api';
const RUN = Date.now().toString(36);
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 260) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};
const M = (await call('POST', '/auth/login', null, { email: process.env.MASTER_EMAIL ?? 'master@folks.com.br', password: process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123' })).body.accessToken;
ok(!!M, 'MASTER faz login');

// ---- lote no formato do cliente: Escola 1º ano com a fala em pt marcada como en-US
const opts = [{ text: 'SAPO', isCorrect: false, feedback: 'ABELHA começa com A.' }, { text: 'ABELHA', isCorrect: true }];
const escola = `escola-e2e-${RUN}`;
const bundle = {
  schemaVersion: 'folks.content/v1',
  planets: [
    { key: escola, slug: escola, name: `Escola E2E ${RUN}`, category: 'para-a-escola', grade: 1, accessTier: 'FREE', courses: [{
      key: `${escola}.letras`, slug: `letras-${RUN}`, title: 'Letras E2E', hasCertificate: false, units: [{ title: 'Vogais', lessons: [
        { type: 'LESSON', title: 'Aula: vogais', slides: [{ heading: 'A de abelha', text: 'Esta é a letra A.', say: 'Esta é a letra á, de abelha!' }, { heading: 'E de elefante', text: 'Esta é a letra E.' }] },
        { type: 'PRACTICE', title: 'Qual começa com A?', questions: [
          { type: 'SINGLE_CHOICE', methodology: 'pick_image', prompt: 'Qual figura começa com A?', speakAfterAnswer: { lang: 'en-US', text: 'Qual figura começa com a letra á?' }, options: opts },
          { type: 'SINGLE_CHOICE', prompt: 'Qual é a vogal?', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] },
        ] },
      ] }],
    }] },
  ],
};
const up = await call('POST', '/master/content/imports', M, { content: JSON.stringify(bundle), filename: 'escola.json', label: 'e2e narração' });
ok(up.status === 201 && up.body.status === 'VALIDATED', 'lote da Escola é validado', { status: up.status, st: up.body.status, errors: up.body.errors });
const detail = (await call('GET', `/master/content/imports/${up.body.id}`, M)).body;
const fixedMsg = (detail.issues ?? []).find((i) => i.code === 'narration.lang_fixed');
ok(fixedMsg?.severity === 'warning' && /1 fala/.test(fixedMsg.message), 'o relatório avisa que a fala em português marcada como en-US foi corrigida', fixedMsg?.message);
await call('POST', `/master/content/imports/${up.body.id}/plan`, M, {});
const ap = await call('POST', `/master/content/imports/${up.body.id}/apply`, M, { publish: true });
ok(ap.body.status === 'APPLIED', 'lote gravado', ap.body.status ?? ap.body.message);

// ---- curso pelo painel/MCP com narração pelo botão; e um curso sem narração
const planets = (await call('GET', '/master/content/planets', M)).body;
const pEscola = planets.find((p) => p.slug === escola);
const bad = await call('POST', `/master/content/planets/${pEscola.id}/import/course`, M, { title: 'Ruim', slug: `ruim-${RUN}`, narration: 'sempre', status: 'PUBLISHED', accessTier: 'FREE', units: [{ title: 'U', lessons: [{ type: 'LESSON', title: 'Aula', content: { slides: [{ heading: 'a', text: 'b' }] } }] }] });
ok(bad.status === 400, 'narração inválida ("sempre") é recusada', bad.body?.issues?.[0]?.message ?? bad.status);
const btn = await call('POST', `/master/content/planets/${pEscola.id}/import/course`, M, {
  title: 'Ciências E2E', slug: `ciencias-${RUN}`, narration: 'button', status: 'PUBLISHED', accessTier: 'FREE',
  units: [{ title: 'U1', lessons: [{ type: 'LESSON', title: 'Aula com fala', content: { slides: [{ heading: 'Circuito', text: 'A pilha empurra a corrente.', say: 'A pilha empurra a corrente elétrica.' }] } }] }],
});
ok(btn.status === 201 || btn.status === 200, 'curso com narração pelo botão criado pelo painel/MCP', btn.body?.issues ?? btn.status);
const vida = planets.find((p) => p.slug === 'musica') ?? planets.find((p) => p.slug !== escola);
const semNarr = await call('POST', `/master/content/planets/${vida.id}/import/course`, M, { title: 'Sem narração E2E', slug: `sem-narr-${RUN}`, status: 'PUBLISHED', accessTier: 'FREE', units: [{ title: 'U1', lessons: [{ type: 'LESSON', title: 'Aula', content: { slides: [{ heading: 'Oi', text: 'Olá' }] } }] }] });
ok(semNarr.status === 201 || semNarr.status === 200, 'curso sem narração criado', semNarr.status);

// ---- aluno
const reg = await call('POST', '/auth/register', null, { name: 'Aluna Escola', email: `narr-${RUN}@teste.example`, password: `Senha${RUN}1`, birthDate: '2010-03-10' });
const T = reg.body.accessToken;
ok(!!T, 'aluna cadastrada');
const lessonsOf = async (planetSlug, courseSlug) => {
  const cat = (await call('GET', `/catalog/planets/${planetSlug}`, T)).body;
  const c = cat.courses.find((x) => x.slug === courseSlug);
  return (await call('GET', `/learning/courses/${c.id}/trail`, T)).body.units.flatMap((u) => u.lessons);
};
const [aula, pratica] = await lessonsOf(escola, `letras-${RUN}`);
const l1 = (await call('GET', `/learning/lessons/${aula.id}`, T)).body;
ok(l1.narration === 'auto', '1º ano: a aula chega com narração automática', l1.narration);
ok(l1.content?.slides?.[0]?.say === 'Esta é a letra á, de abelha!' && l1.content.slides[1].say === undefined, 'a tela traz o "say" (e a que não tem fica sem, para ler título + texto)', l1.content?.slides?.map((s) => s.say));
await call('POST', `/learning/lessons/${aula.id}/complete`, T);
const p1 = (await call('GET', `/learning/lessons/${pratica.id}`, T)).body;
const q1 = p1.questions.find((q) => q.prompt === 'Qual figura começa com A?');
ok(p1.narration === 'auto' && q1?.say === 'Qual figura começa com a letra á?', 'a pergunta chega com a narração em português (say)', { narration: p1.narration, say: q1?.say });
ok(!JSON.stringify(q1).includes('speakAfterAnswer') && !JSON.stringify(q1).includes('isCorrect'), 'sem a fala "depois da resposta" e sem a resposta certa');

const [aulaBtn] = await lessonsOf(escola, `ciencias-${RUN}`);
const l2 = (await call('GET', `/learning/lessons/${aulaBtn.id}`, T)).body;
ok(l2.narration === 'button' && l2.content?.slides?.[0]?.say === 'A pilha empurra a corrente elétrica.', 'curso do painel: narração pelo botão e "say" da tela', { n: l2.narration, say: l2.content?.slides?.[0]?.say });
const [aulaSem] = await lessonsOf(vida.slug, `sem-narr-${RUN}`);
const l3 = (await call('GET', `/learning/lessons/${aulaSem.id}`, T)).body;
ok(l3.narration === null, 'curso fora da Escola, sem narração: narration null', l3.narration);

// ---- preferência do aluno
const pr0 = (await call('GET', '/me/preferences', T)).body;
ok(pr0.narration === true, 'narração vem ligada por padrão', pr0.narration);
const pr1 = await call('PATCH', '/me/preferences', T, { narration: false });
ok(pr1.status < 300 && (await call('GET', '/me/preferences', T)).body.narration === false, 'aluno desliga a narração e a preferência fica salva');
ok((await call('PATCH', '/me/preferences', T, { narration: 'nao' })).status === 400, 'valor inválido para a preferência é recusado');

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
