// e2e: planeta importado (cursos nascem em rascunho) e depois publicado pelo MASTER não pode ficar "Em breve" para o aluno.
// Publicar o planeta publica junto os cursos em rascunho que têm trilha; curso "Em breve" (sem trilha) continua "Em breve".
// Rode contra um banco DE TESTE (skill testes-e2e):
//   bash ../skills/testes-e2e/banco-teste.sh criar publicar
//   PORT=3011 DATABASE_URL=...universo_folks_test_publicar node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/publicar-planeta.mjs
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

const slug = `publicar-e2e-${RUN}`;
const aula = (t) => ({ type: 'LESSON', title: t, slides: [{ heading: t, text: 'Conteúdo da aula.' }] });
const bundle = {
  schemaVersion: 'folks.content/v1',
  planets: [{
    key: slug, slug, name: `Publicar E2E ${RUN}`, category: 'para-a-vida', accessTier: 'FREE',
    courses: [
      { key: `${slug}.a`, slug: `curso-a-${RUN}`, title: 'Curso A', hasCertificate: false, units: [{ title: 'U1', lessons: [aula('Aula A1')] }, { title: 'U2', lessons: [aula('Aula A2')] }] },
      { key: `${slug}.b`, slug: `curso-b-${RUN}`, title: 'Curso B', hasCertificate: false, units: [{ title: 'U1', lessons: [aula('Aula B1')] }] },
      { key: `${slug}.c`, slug: `curso-c-${RUN}`, title: 'Curso C (em produção)', status: 'COMING_SOON', hasCertificate: false, units: [] },
    ],
  }],
};
const up = await call('POST', '/master/content/imports', M, { content: JSON.stringify(bundle), filename: 'publicar.json', label: 'e2e publicar planeta' });
ok(up.status === 201 && up.body.status === 'VALIDATED', 'lote validado', { status: up.status, st: up.body.status, errors: up.body.errors });
await call('POST', `/master/content/imports/${up.body.id}/plan`, M, {});
const ap = await call('POST', `/master/content/imports/${up.body.id}/apply`, M, {});
ok(ap.body.status === 'APPLIED', 'lote gravado sem publicar (como a importação faz por padrão)', ap.body.status ?? ap.body.message);

const planet = (await call('GET', '/master/content/planets', M, undefined)).body.find((p) => p.slug === slug);
const tree = async () => (await call('GET', `/master/content/planets/${planet.id}/tree`, M)).body;
const t0 = await tree();
ok(planet.status === 'DRAFT' && t0.courses.filter((c) => c.status === 'DRAFT').length === 2, 'planeta e cursos com trilha nascem em rascunho', t0.courses.map((c) => `${c.title}:${c.status}`));

const reg = await call('POST', '/auth/register', null, { name: 'Aluno Publicar', email: `publicar-${RUN}@teste.example`, password: `Senha${RUN}1`, birthDate: '1995-03-10' });
const T = reg.body.accessToken;
const card = async () => (await call('GET', '/catalog/planets', T)).body.find?.((p) => p.slug === slug) ?? (await call('GET', '/catalog/planets', T)).body.items?.find((p) => p.slug === slug);
ok(!(await card()), 'planeta em rascunho não aparece para o aluno');

// ---- o MASTER publica só o planeta (é o que o painel faz no seletor de situação)
const pub = await call('PATCH', `/master/content/planets/${planet.id}`, M, { status: 'PUBLISHED' });
ok(pub.status === 200 && pub.body.publishedCourses === 2, 'publicar o planeta publica junto os 2 cursos em rascunho', { status: pub.status, publishedCourses: pub.body.publishedCourses });
const t1 = await tree();
const st = Object.fromEntries(t1.courses.map((c) => [c.title, c.status]));
ok(st['Curso A'] === 'PUBLISHED' && st['Curso B'] === 'PUBLISHED' && st['Curso C (em produção)'] === 'COMING_SOON', 'curso "Em breve" (sem trilha) continua "Em breve"', st);

const c1 = await card();
ok(c1 && c1.comingSoon === false && !c1.badges.includes('EM_BREVE') && c1.courseCount === 2, 'para o aluno o planeta deixa de ser "Em breve" e mostra os 2 cursos', c1 && { comingSoon: c1.comingSoon, badges: c1.badges, courseCount: c1.courseCount });
const det = (await call('GET', `/catalog/planets/${slug}`, T)).body;
const curA = det.courses?.find((c) => c.title === 'Curso A');
ok(curA && !curA.locked, 'o aluno abre o planeta e o Curso A está liberado', curA && { locked: curA.locked, reason: curA.reason });

// ---- publicar de novo não mexe em curso que o MASTER voltou para rascunho? Mexe: publicar = colocar no ar o que tem trilha.
await call('PATCH', `/master/content/courses/${t1.courses.find((c) => c.title === 'Curso B').id}`, M, { status: 'DRAFT' });
const again = await call('PATCH', `/master/content/planets/${planet.id}`, M, { status: 'PUBLISHED' });
ok(again.body.publishedCourses === 1, 'publicar o planeta de novo coloca no ar o curso que estava em rascunho', again.body.publishedCourses);

// ---- outras mudanças do planeta não publicam nada
await call('PATCH', `/master/content/courses/${t1.courses.find((c) => c.title === 'Curso B').id}`, M, { status: 'DRAFT' });
const rename = await call('PATCH', `/master/content/planets/${planet.id}`, M, { name: `Publicar E2E ${RUN} (novo nome)` });
const t2 = await tree();
ok(rename.body.publishedCourses === 0 && t2.courses.find((c) => c.title === 'Curso B').status === 'DRAFT', 'renomear o planeta não publica curso em rascunho');

console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
