// e2e: escola (ADR 0020) - turmas, professor, tarefas, cobrança, relatório, virada de ano,
// transferência, responsável, ofertas para menores e visão da secretaria.
// Uso: API apontando para um banco DE TESTE com seed (skill testes-e2e), nunca para o de dev:
//   bash ../skills/testes-e2e/banco-teste.sh criar escola
//   PORT=3011 DATABASE_URL=...universo_folks_test_escola node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/escola.mjs
// Cria escolas, planetas e pessoas de teste: por isso só roda em banco descartável.
const API = process.env.API_URL ?? 'http://localhost:3011/api';
let fails = 0, total = 0;
const RUN = Date.now().toString(36);
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${!c && x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 300) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j, type: r.headers.get('content-type') };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** login tem limite de 10/min por IP: espera e tenta de novo */
const login = async (email, password) => {
  for (let i = 0; i < 3; i++) {
    const r = await call('POST', '/auth/login', null, { email, password });
    if (r.status === 429) { await sleep(61_000); continue; }
    return r.body;
  }
  return {};
};
const PASS = 'SenhaE2e123!';
const day = (offset) => new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ preparação
const M = (await login(process.env.MASTER_EMAIL ?? 'master@folks.com.br', process.env.MASTER_PASSWORD ?? 'TroqueEssaSenha123')).accessToken;
ok(!!M, 'MASTER faz login');

const mkPlanet = async (name, grade) => {
  const p = await call('POST', '/master/content/planets', M, { categorySlug: 'para-a-escola', name: `${name} ${RUN}`, slug: `e2e-${grade}-${name.toLowerCase().replace(/\W+/g, '-')}-${RUN}`, status: 'PUBLISHED', accessTier: 'FREE', grade });
  const c = await call('POST', '/master/content/courses', M, { planetId: p.body.id, title: `Curso ${name}`, status: 'PUBLISHED' });
  await call('POST', '/master/content/units', M, { courseId: c.body.id, title: 'Unidade 1' });
  return { id: p.body.id, courseId: c.body.id, status: p.status, grade: p.body.grade };
};
const MAT1 = await mkPlanet('Matemática 1', '1');
const POR1 = await mkPlanet('Português 1', '1');
const MAT2 = await mkPlanet('Matemática 2', '2');
ok(MAT1.status === 201 && MAT1.grade === '1' && MAT2.grade === '2', 'MASTER cria matérias da Escola com a série', [MAT1, MAT2]);
ok((await call('POST', '/master/content/planets', M, { categorySlug: 'para-a-escola', name: 'Série errada', grade: '10' })).status === 400, 'série fora de 1-9/m1-m3 é recusada');

const mkTenant = async (tradeName, segment, adminEmail, extra = {}) => call('POST', '/master/tenants', M, {
  legalName: `${tradeName} LTDA`, tradeName, segment, ...extra,
  settings: { maxCollaborators: 20, maxAdmins: 3 },
  admin: { name: `Admin ${tradeName}`, email: adminEmail, password: PASS },
});
const net = await mkTenant(`Secretaria E2E ${RUN}`, 'SCHOOL_NETWORK', `sec.${RUN}@example.com`, { type: 'B2G' });
const A = await mkTenant(`Escola A ${RUN}`, 'SCHOOL', `admin.a.${RUN}@example.com`, { networkId: net.body.tenant?.id });
const B = await mkTenant(`Escola B ${RUN}`, 'SCHOOL', `admin.b.${RUN}@example.com`);
ok(net.status === 201 && A.status === 201 && B.status === 201 && A.body.tenant.segment === 'SCHOOL' && A.body.tenant.networkId === net.body.tenant.id, 'MASTER cadastra secretaria e escolas (uma delas na rede)', [net.status, A.status, B.status]);
ok((await call('POST', '/master/tenants', M, { legalName: 'X LTDA', tradeName: `X ${RUN}`, networkId: A.body.tenant.id })).status === 400, 'rede precisa ser uma secretaria');

const AA = (await login(`admin.a.${RUN}@example.com`, PASS)).accessToken;
const AB = (await login(`admin.b.${RUN}@example.com`, PASS)).accessToken;
ok(!!AA && !!AB, 'administradores das escolas fazem login');

// ------------------------------------------------------------ séries e turmas
const c1a = await call('POST', '/companies/me/school/classes', AA, { grade: '1', suffix: 'A' });
const c1b = await call('POST', '/companies/me/school/classes', AA, { grade: '1', suffix: 'B' });
const c2a = await call('POST', '/companies/me/school/classes', AA, { grade: '2', suffix: 'A' });
ok(c1a.status === 201 && c1a.body.name === '1º ano A' && c1a.body.kind === 'CLASS', 'cria a turma 1º ano A (e a série)', c1a.body);
ok(c1a.body.subjectsReleased >= 2 && c2a.body.subjectsReleased >= 1, 'a turma recebe as matérias da sua série', [c1a.body.subjectsReleased, c2a.body.subjectsReleased]);
ok((await call('POST', '/companies/me/school/classes', AA, { grade: '1', suffix: 'A' })).status === 409, 'turma repetida é recusada');
ok((await call('POST', '/companies/me/school/classes', AA, { grade: '13', suffix: 'A' })).status === 400, 'série inválida é recusada');
const st = (await call('GET', '/companies/me/school/structure', AA)).body;
ok(st.find((g) => g.grade === '1')?.classes.length === 2 && st.find((g) => g.grade === '2')?.classes.length === 1, 'estrutura: 1º ano com 2 turmas, 2º ano com 1', st);
ok((await call('GET', `/companies/${B.body.tenant.id}/school/structure`, AA)).status === 403, 'administrador da escola A não acessa a escola B');
const AO = (await login('admin@orbita.example', 'demo1234')).accessToken;
ok((await call('GET', '/companies/me/school/structure', AO)).status === 400, 'empresa comum não tem área de escola');
ok((await call('POST', '/companies/me/members', AO, { name: 'Prof Fora', email: `prof.fora.${RUN}@example.com`, role: 'PROFESSOR', password: PASS })).status === 400, 'papel de professor não existe em empresa');

// ------------------------------------------------------------------- pessoas
const member = (name, email, role, departmentIds) => call('POST', '/companies/me/members', AA, { name, email, role, departmentIds, password: PASS });
const prof = await member('Professora Lia', `prof.${RUN}@example.com`, 'PROFESSOR');
const s1 = await member('Aluno Um', `s1.${RUN}@example.com`, 'COLABORADOR_CLIENTE', [c1a.body.id]);
const s2 = await member('Aluna Dois', `s2.${RUN}@example.com`, 'COLABORADOR_CLIENTE', [c1a.body.id]);
const s3 = await member('Aluno Três', `s3.${RUN}@example.com`, 'COLABORADOR_CLIENTE', [c1b.body.id]);
const s4 = await member('Aluna Quatro', `s4.${RUN}@example.com`, 'COLABORADOR_CLIENTE', [c2a.body.id]);
ok(prof.status === 201 && prof.body.role === 'PROFESSOR' && s1.status === 201 && s4.status === 201, 'cadastra professora e alunos nas turmas', [prof.body, s1.status]);

const setT = await call('PUT', `/companies/me/school/teachers/${prof.body.membershipId}/teaching`, AA, { items: [{ departmentId: c1a.body.id, planetId: MAT1.id }] });
ok(setT.status === 200 && setT.body.length === 1, 'liga a professora à turma 1º ano A em Matemática 1', setT.body);
ok((await call('PUT', `/companies/me/school/teachers/${prof.body.membershipId}/teaching`, AA, { items: [{ departmentId: '00000000-0000-4000-8000-000000000000', planetId: MAT1.id }] })).status === 400, 'turma de fora da escola é recusada');
ok((await call('PUT', `/companies/me/school/teachers/${s1.body.membershipId}/teaching`, AA, { items: [] })).status === 404, 'aluno não pode receber turmas de professor');

// ------------------------------------------------------------------ professor
const profLogin = await login(`prof.${RUN}@example.com`, PASS);
const P = profLogin.accessToken;
ok(profLogin.context?.tenantRole === 'PROFESSOR', 'professora entra com o papel PROFESSOR', profLogin.context);
const cls = (await call('GET', '/teacher/classes', P)).body;
ok(Array.isArray(cls) && cls.length === 1 && cls[0].students === 2 && cls[0].subjects[0]?.id === MAT1.id, 'minhas turmas: 1º ano A, 2 alunos, Matemática 1', cls);
ok((await call('GET', '/teacher/classes', AA)).status === 403, 'administrador não usa a área do professor');
ok((await call('GET', `/teacher/classes/${c1b.body.id}/report?planetId=${MAT1.id}`, P)).status === 403, 'professora não vê turma que não é dela');
ok((await call('GET', `/teacher/classes/${c1a.body.id}/report?planetId=${POR1.id}`, P)).status === 403, 'professora não vê matéria que não dá');

const late = await call('POST', '/teacher/tasks', P, { classId: c1a.body.id, planetId: MAT1.id, kind: 'HOMEWORK', dueDate: day(-1) });
const study = await call('POST', '/teacher/tasks', P, { classId: c1a.body.id, planetId: MAT1.id, courseId: MAT1.courseId, kind: 'STUDY' });
ok(late.status === 201 && late.body.mandatory === true && study.status === 201 && study.body.mandatory === false && study.body.dueDate === null, 'passa lição de casa com prazo e estudo em aberto', [late.body, study.body]);
ok((await call('POST', '/teacher/tasks', P, { classId: c1b.body.id, planetId: MAT1.id, kind: 'HOMEWORK' })).status === 403, 'não passa tarefa para turma que não é dela');
ok((await call('POST', '/teacher/tasks', P, { classId: c1a.body.id, planetId: MAT1.id, courseId: MAT2.courseId, kind: 'STUDY' })).status === 400, 'curso de outra matéria é recusado');
ok((await call('GET', '/teacher/tasks', P)).body.length === 2, 'lista as duas tarefas');

let rep = (await call('GET', `/teacher/classes/${c1a.body.id}/report?planetId=${MAT1.id}`, P)).body;
ok(rep.students?.length === 2 && rep.tasks?.length === 2 && rep.summary.withLateTasks === 2, 'relatório: 2 alunos, 2 tarefas, os dois com lição atrasada', rep.summary);
const csv = await call('GET', `/teacher/classes/${c1a.body.id}/report.csv?planetId=${MAT1.id}`, P);
ok(csv.status === 200 && csv.type?.includes('text/csv') && String(csv.body).includes('Aluno Um') && String(csv.body).includes('atrasada'), 'relatório em CSV para o Excel');

const rem = await call('POST', '/teacher/reminders', P, { classId: c1a.body.id, message: 'Bora fazer a lição!' });
ok(rem.status === 200 && rem.body.sent === 2, 'cobra os 2 alunos com tarefa pendente', rem.body);
ok((await call('POST', '/teacher/reminders', P, { classId: c1a.body.id, membershipIds: [s3.body.membershipId] })).status === 400, 'não cobra aluno de outra turma');
const S1 = (await login(`s1.${RUN}@example.com`, PASS)).accessToken;
let inbox = (await call('GET', '/me/notices', S1)).body;
ok(inbox.unread >= 1 && inbox.items[0].title.includes('Lia') && inbox.items[0].body.includes('Bora fazer a lição!'), 'o aluno recebe o aviso no app', inbox);
await call('POST', `/me/notices/${inbox.items[0].id}/read`, S1);
ok((await call('GET', '/me/notices', S1)).body.unread === 0, 'aviso marcado como lido');

ok((await call('PATCH', `/teacher/tasks/${late.body.id}`, P, { dueDate: null })).status === 200, 'deixa a lição em aberto (sem prazo)');
rep = (await call('GET', `/teacher/classes/${c1a.body.id}/report?planetId=${MAT1.id}`, P)).body;
ok(rep.summary.withLateTasks === 0, 'sem prazo, ninguém fica atrasado', rep.summary);
const other = await call('POST', '/companies/me/assignments', AA, { targetType: 'PLANET', planetId: MAT1.id, departmentId: c1b.body.id, mandatory: true });
ok((await call('DELETE', `/teacher/tasks/${other.body.id}`, P)).status === 404, 'não apaga tarefa de turma que não é dela');

const catS3 = (await call('GET', '/catalog/planets', (await login(`s3.${RUN}@example.com`, PASS)).accessToken)).body;
const slugs = JSON.stringify(catS3);
ok(slugs.includes(MAT1.id) || slugs.includes(`Matemática 1 ${RUN}`), 'aluno do 1º ano B vê as matérias do 1º ano');
ok(!slugs.includes(`Matemática 2 ${RUN}`), 'e não vê as do 2º ano');

// ------------------------------------------------------------- virada de ano
const dry = (await call('POST', '/companies/me/school/rollover', AA, { dryRun: true, keepBack: [s2.body.membershipId] })).body;
ok(dry.dryRun === true && dry.moved === 3 && dry.kept === 1, 'simulação: 3 sobem, 1 repete', dry);
const roll = (await call('POST', '/companies/me/school/rollover', AA, { keepBack: [s2.body.membershipId] })).body;
ok(roll.dryRun === false && roll.createdClasses?.includes('2º ano B') && roll.createdClasses?.includes('3º ano A'), 'vira o ano e cria as turmas que faltam', roll);
const st2 = (await call('GET', '/companies/me/school/structure', AA)).body;
const n = (name) => st2.flatMap((g) => g.classes).find((c) => c.name === name)?.students;
ok(n('1º ano A') === 1 && n('2º ano A') === 1 && n('2º ano B') === 1 && n('3º ano A') === 1, 'cada aluno na turma certa (quem repete ficou)', st2);
ok((await call('GET', '/teacher/classes', P)).body[0]?.name === '1º ano A', 'a professora continua na turma de origem');

// ------------------------------------------------------------- transferência
ok((await call('POST', '/companies/me/school/transfers', AB, { email: `nao.existe.${RUN}@example.com` })).status === 404, 'transferência de e-mail sem conta é recusada');
const tr = await call('POST', '/companies/me/school/transfers', AB, { email: `s1.${RUN}@example.com` });
ok(tr.status === 200 && /^TRANSF-/.test(tr.body.code), 'escola B pede a transferência do aluno', tr.body);
ok((await call('POST', '/me/school-transfer/accept', P, { code: tr.body.code })).status === 400, 'outra pessoa não usa o código');
const acc = await call('POST', '/me/school-transfer/accept', S1, { code: tr.body.code });
ok(acc.status === 200 && acc.body.tenantId === B.body.tenant.id && acc.body.session?.context?.tenantId === B.body.tenant.id, 'o aluno aceita e já recebe a sessão na escola B', acc.body);
const S1B = acc.body.session?.accessToken;
ok((await call('POST', '/me/school-transfer/accept', S1B, { code: tr.body.code })).status === 400, 'o código só vale uma vez');
const ctx = (await call('GET', '/auth/contexts', S1B)).body;
ok(ctx.some((c) => c.tenantId === B.body.tenant.id) && !ctx.some((c) => c.tenantId === A.body.tenant.id), 'o aluno está só na escola B agora', ctx);
ok((await call('POST', '/companies/me/school/transfers', AB, { email: `s1.${RUN}@example.com` })).status === 409, 'quem já está na escola não é transferido de novo');

// ---------------------------------------------------------------- responsável
const reg = async (name, email, birthDate) => {
  const r = await call('POST', '/auth/register', null, { name, email, password: PASS, birthDate });
  return r.body.accessToken ?? (await login(email, PASS)).accessToken;
};
const PAI = await reg('Pai E2E', `pai.${RUN}@example.com`, '1985-03-10');
ok(!!PAI, 'responsável cria a conta');
ok((await call('POST', '/guardian/children', PAI, { name: 'Filho', email: `filho.${RUN}@example.com`, password: PASS, birthDate: '2017-06-01', consent: false })).status === 400, 'sem aceitar o termo não cria a conta do filho');
const child = await call('POST', '/guardian/children', PAI, { name: 'Filho E2E', email: `filho.${RUN}@example.com`, password: PASS, birthDate: '2017-06-01', consent: true });
ok(child.status === 201 && !!child.body.consentVersion, 'cria a conta do filho com o consentimento registrado', child.body);
ok((await call('POST', '/guardian/children', PAI, { name: 'Adulto', email: `adulto.${RUN}@example.com`, password: PASS, birthDate: '1990-01-01', consent: true })).status === 400, 'conta de filho é só para menor de 18');
const code = await call('POST', `/companies/me/school/students/${s2.body.membershipId}/guardian-code`, AA);
ok(code.status === 201 && /^RESP-/.test(code.body.code), 'a escola gera o código do responsável', code.body);
const link = await call('POST', '/guardian/links', PAI, { code: code.body.code, consent: true });
ok(link.status === 201, 'o responsável se liga à aluna da escola pelo código', link.body);
const kids = (await call('GET', '/guardian/children', PAI)).body;
const k2 = kids.find((k) => k.studentId === link.body.studentId);
ok(kids.length === 2 && k2?.school?.name === `Escola A ${RUN}` && k2.school.classes.includes('1º ano A'), 'vê os dois filhos, com a escola e a turma', kids);
ok(k2?.tasks?.length >= 1, 'vê as tarefas da filha', k2?.tasks);
const STRANGER = await reg('Outro Adulto', `outro.${RUN}@example.com`, '1980-01-01');
ok((await call('GET', `/guardian/children/${link.body.studentId}`, STRANGER)).status === 404, 'outro adulto não vê a aluna');
const TEEN = await reg('Adolescente', `teen.${RUN}@example.com`, '2012-02-02');
ok((await call('POST', '/guardian/children', TEEN, { name: 'Xavier', email: `x.${RUN}@example.com`, password: PASS, birthDate: '2018-01-01', consent: true })).status === 403, 'menor de idade não pode ser responsável');
ok((await call('DELETE', `/guardian/children/${link.body.studentId}`, PAI)).status === 200, 'o responsável desfaz a ligação');
ok((await call('GET', `/guardian/children/${link.body.studentId}`, PAI)).status === 404, 'e deixa de ver a aluna');

// ------------------------------------------------------- ofertas para menores
const FILHO = (await login(`filho.${RUN}@example.com`, PASS)).accessToken;
ok((await call('GET', '/me', FILHO)).body.offersAllowed === false, 'criança (8 anos) não vê oferta do Premium');
ok((await call('GET', '/me', PAI)).body.offersAllowed === true, 'adulto fora da escola vê');
ok((await call('GET', '/me', TEEN)).body.offersAllowed === true, 'adolescente fora da escola vê');
ok((await call('GET', '/me', S1B)).body.offersAllowed === false, 'aluno de escola nunca vê');

// --------------------------------------------------------------- secretaria
const SEC = (await login(`sec.${RUN}@example.com`, PASS)).accessToken;
const netv = await call('GET', '/companies/me/network', SEC);
const ea = netv.body.schools?.find((s) => s.id === A.body.tenant.id);
ok(netv.status === 200 && netv.body.totals.schools === 1 && ea?.teachers === 1 && ea.students >= 3, 'secretaria vê a escola da rede com alunos e professores', netv.body);
ok((await call('GET', '/companies/me/network', AA)).status === 403, 'escola não vê a visão da rede');

// ------------------------------------------------------------------- licenças
await call('PATCH', `/master/tenants/${A.body.tenant.id}/settings`, M, { maxCollaborators: 4 });
const full = await member('Prof Extra', `prof2.${RUN}@example.com`, 'PROFESSOR');
ok(full.status === 403 && full.body.error === 'license_limit', 'professor ocupa licença de usuário (cota cheia barra)', full.body);

console.log(`\n${total - fails}/${total} verificações`);
process.exit(fails ? 1 : 0);
