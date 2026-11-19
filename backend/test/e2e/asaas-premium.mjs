// e2e: Premium B2C pelo Asaas (web/PWA) contra um Asaas SIMULADO (sobe junto, na porta 4010).
// Rode contra um banco DE TESTE (skill testes-e2e), com a API apontando para o simulador:
//   bash ../skills/testes-e2e/banco-teste.sh criar asaas
//   PORT=3011 DATABASE_URL=...universo_folks_test_asaas ASAAS_API_KEY=teste ASAAS_API_URL=http://localhost:4010/v3 \
//     ASAAS_WEBHOOK_TOKEN=token-e2e node dist/main.js
//   API_URL=http://localhost:3011/api node test/e2e/asaas-premium.mjs
import http from 'node:http';
const API = process.env.API_URL ?? 'http://localhost:3011/api';
const HOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN ?? 'token-e2e';
const RUN = Date.now().toString(36);
let fails = 0, total = 0;
const ok = (c, m, x) => { total++; console.log(`${c ? '✔' : '✘'} ${m}${x !== undefined ? ' -> ' + JSON.stringify(x).slice(0, 240) : ''}`); if (!c) fails++; };
const call = async (method, path, token, body, headers = {}) => {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, body: j };
};

// ---------------------------------------------------------------- Asaas simulado
const asaas = { customers: new Map(), subs: new Map(), payments: new Map(), deleted: [], calls: [] };
let seq = 0;
// ids únicos por rodada, como os do Asaas (o banco de teste pode ter clientes de rodadas anteriores)
const nid = (p) => `${p}_${RUN}_${++seq}`;
const newPayment = (sub, dueDate) => { const p = { id: nid('pay'), subscription: sub.id, customer: sub.customer, value: sub.value, billingType: sub.billingType, status: 'PENDING', dueDate, invoiceUrl: `https://sandbox.asaas.test/i/${seq}`, externalReference: sub.externalReference }; asaas.payments.set(p.id, p); return p; };
const mock = http.createServer((req, res) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => {
    const url = new URL(req.url, 'http://x'); const body = raw ? JSON.parse(raw) : {};
    asaas.calls.push({ m: req.method, p: url.pathname, key: req.headers.access_token, body });
    const send = (s, j) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(j)); };
    const p = url.pathname.replace(/^\/v3/, '');
    let m;
    if (req.method === 'POST' && p === '/customers') { const c = { id: nid('cus'), ...body }; asaas.customers.set(c.id, c); return send(200, c); }
    if (req.method === 'POST' && (m = p.match(/^\/customers\/(.+)$/))) { Object.assign(asaas.customers.get(m[1]) ?? {}, body); return send(200, asaas.customers.get(m[1])); }
    if (req.method === 'POST' && p === '/subscriptions') { const s = { id: nid('sub'), ...body, status: 'ACTIVE' }; asaas.subs.set(s.id, s); newPayment(s, body.nextDueDate); return send(200, s); }
    if (req.method === 'GET' && (m = p.match(/^\/subscriptions\/(.+)\/payments$/))) return send(200, { data: [...asaas.payments.values()].filter((x) => x.subscription === m[1]) });
    if (req.method === 'DELETE' && (m = p.match(/^\/subscriptions\/(.+)$/))) { asaas.deleted.push(m[1]); return send(200, { deleted: true, id: m[1] }); }
    if (req.method === 'GET' && (m = p.match(/^\/payments\/(.+)$/))) return send(200, asaas.payments.get(m[1]) ?? {});
    send(404, { errors: [{ description: `rota não simulada: ${req.method} ${p}` }] });
  });
});
await new Promise((r) => mock.listen(4010, r));
const pay = (paymentId) => { const p = asaas.payments.get(paymentId); p.status = 'RECEIVED'; p.paymentDate = p.dueDate; return p; };
const lastPaymentOf = (asaasSubId) => [...asaas.payments.values()].filter((x) => x.subscription === asaasSubId).at(-1);

try {
  // ---------------------------------------------------------------- MASTER define os preços
  const M = (await call('POST', '/auth/login', null, { email: 'master@folks.com.br', password: 'TroqueEssaSenha123' })).body.accessToken;
  ok(!!M, 'MASTER faz login');
  const plans = (await call('GET', '/master/billing/plans', M)).body;
  const byCode = Object.fromEntries(plans.map((p) => [p.code, p]));
  ok(['b2c-premium-monthly', 'b2c-premium-yearly', 'b2c-premium-plus-monthly', 'b2c-premium-plus-yearly'].every((c) => byCode[c]), 'os 4 preços B2C existem (Premium e Premium Plus, mensal e anual)', Object.keys(byCode));
  const price = { 'b2c-premium-monthly': 1990, 'b2c-premium-yearly': 19900, 'b2c-premium-plus-monthly': 2990, 'b2c-premium-plus-yearly': 29900 };
  for (const [code, cents] of Object.entries(price)) {
    const p = byCode[code];
    const r = await call('PUT', `/master/billing/plans/${p.id}`, M, { code: p.code, name: p.name, audience: 'B2C', interval: p.interval, priceCents: cents, isActive: true, tierId: p.tierId });
    if (r.status >= 300) ok(false, `preço ${code}`, r.body);
  }
  const tiers = (await call('GET', '/billing/tiers')).body;
  const plus = tiers.find((t) => t.code === 'premium-plus');
  const prem = tiers.find((t) => t.code === 'premium');
  ok(prem.plans.length === 2 && plus.plans.some((p) => p.priceCents === 2990), 'a tela de planos mostra os preços ativos', tiers.map((t) => [t.code, t.plans.map((p) => p.priceCents)]));
  const premMonthly = prem.plans.find((p) => p.interval === 'MONTHLY');
  const plusMonthly = plus.plans.find((p) => p.interval === 'MONTHLY');

  // ---------------------------------------------------------------- aluno assina o Premium
  const reg = await call('POST', '/auth/register', null, { name: 'Aluna Premium', email: `premium-${RUN}@teste.example`, password: `Senha${RUN}1`, birthDate: '1998-04-20' });
  const T = reg.body.accessToken;
  ok(!!T, 'aluna B2C cadastrada');
  const bad = await call('POST', '/billing/checkout', T, { planId: premMonthly.id, cpfCnpj: '123.456.789-00' });
  ok(bad.status === 400 && /CPF ou CNPJ inválido/.test(bad.body.message), 'CPF com dígito errado é recusado antes de ir ao Asaas', bad.body.message);
  const co = await call('POST', '/billing/checkout', T, { planId: premMonthly.id, cpfCnpj: '529.982.247-25' });
  ok(co.status === 201 && co.body.checkoutUrl?.startsWith('https://sandbox.asaas.test/'), 'checkout devolve a fatura do Asaas', co.body);
  const custCall = asaas.calls.find((c) => c.p === '/v3/customers' && c.m === 'POST');
  ok(custCall?.body.cpfCnpj === '52998224725' && custCall.key === 'teste' && /^user:/.test(custCall.body.externalReference), 'cliente criado no Asaas com o CPF (só números), a chave e a referência do usuário');
  const subCall = asaas.calls.find((c) => c.p === '/v3/subscriptions' && c.m === 'POST');
  ok(subCall?.body.billingType === 'UNDEFINED' && subCall.body.cycle === 'MONTHLY' && subCall.body.value === 19.9 && subCall.body.externalReference === `sub:${co.body.subscriptionId}`, 'assinatura mensal de R$ 19,90 em que o aluno escolhe Pix, cartão ou boleto', subCall?.body);
  ok((await call('GET', '/me/entitlements', T)).body.premium === false, 'antes de pagar, continua no Básico');
  const pend = (await call('POST', `/billing/subscriptions/${co.body.subscriptionId}/refresh`, T)).body;
  ok(pend.status === 'PENDING' && pend.active === false, '"Já paguei" sem pagamento: continua pendente', pend);
  const again = await call('POST', '/billing/checkout', T, { planId: plusMonthly.id, cpfCnpj: '52998224725' });
  ok(again.status === 201 && asaas.deleted.length === 1, 'novo checkout com outro pendente: o anterior é cancelado no Asaas', asaas.deleted);
  // volta para o Premium mensal (o pendente do Plus também é substituído)
  const co2 = await call('POST', '/billing/checkout', T, { planId: premMonthly.id, cpfCnpj: '52998224725' });
  const asaasSub1 = asaas.calls.filter((c) => c.p === '/v3/subscriptions' && c.m === 'POST').length && [...asaas.subs.values()].at(-1).id;

  // paga (Pix) e confere pelo "Já paguei" (sem webhook)
  pay(lastPaymentOf(asaasSub1).id);
  const paid = (await call('POST', `/billing/subscriptions/${co2.body.subscriptionId}/refresh`, T)).body;
  ok(paid.active === true && paid.status === 'ACTIVE', '"Já paguei" com o Pix pago: Premium liberado', paid);
  const ent = (await call('GET', '/me/entitlements', T)).body;
  ok(ent.premium === true && ent.plan?.code === 'premium', 'acesso do plano Premium (Para a vida + Para o trabalho)', ent.plan);
  const mine = (await call('GET', '/billing/me/subscriptions', T)).body;
  const cur = mine.find((s) => s.id === co2.body.subscriptionId);
  ok(cur.plan.tier?.code === 'premium' && new Date(cur.currentPeriodEnd) > new Date(Date.now() + 25 * 86400_000), 'assinatura ativa por um mês, com o plano de acesso', { end: cur.currentPeriodEnd, tier: cur.plan.tier });

  // ---------------------------------------------------------------- webhook: token, renovação e idempotência
  const renewal = newPayment(asaas.subs.get(asaasSub1), new Date(cur.currentPeriodEnd).toISOString().slice(0, 10));
  pay(renewal.id);
  const hook = { id: `evt_${RUN}_1`, event: 'PAYMENT_RECEIVED', payment: renewal };
  ok((await call('POST', '/billing/webhooks/asaas', null, hook, { 'asaas-access-token': 'errado' })).status === 401, 'webhook com token errado é recusado');
  const h1 = await call('POST', '/billing/webhooks/asaas', null, hook, { 'asaas-access-token': HOOK_TOKEN });
  ok(h1.status === 200 && h1.body.paymentStatus === 'PAID', 'webhook da renovação é aceito', h1.body);
  const afterRenew = (await call('GET', '/billing/me/subscriptions', T)).body.find((s) => s.id === co2.body.subscriptionId);
  ok(new Date(afterRenew.currentPeriodEnd) > new Date(cur.currentPeriodEnd), 'renovação paga estende o período', { antes: cur.currentPeriodEnd, depois: afterRenew.currentPeriodEnd });
  const h2 = await call('POST', '/billing/webhooks/asaas', null, hook, { 'asaas-access-token': HOOK_TOKEN });
  ok(h2.body.duplicate === true, 'o mesmo evento de novo é ignorado (idempotência)', h2.body);

  // ---------------------------------------------------------------- troca de plano
  const up = await call('POST', '/billing/checkout', T, { planId: plusMonthly.id, cpfCnpj: '52998224725' });
  ok(up.status === 201 && up.body.replaces?.subscriptionId === co2.body.subscriptionId, 'subir para o Premium Plus gera a nova cobrança e diz qual assinatura ela substitui', up.body.replaces);
  ok((await call('GET', '/me/entitlements', T)).body.plan?.code === 'premium', 'enquanto não paga o Plus, continua com o Premium');
  const asaasSubPlus = [...asaas.subs.values()].at(-1).id;
  const plusPay = pay(lastPaymentOf(asaasSubPlus).id);
  const h3 = await call('POST', '/billing/webhooks/asaas', null, { id: `evt_${RUN}_2`, event: 'PAYMENT_CONFIRMED', payment: plusPay }, { 'asaas-access-token': HOOK_TOKEN });
  ok(h3.status === 200, 'webhook do pagamento do Plus aceito', h3.body);
  ok((await call('GET', '/me/entitlements', T)).body.plan?.code === 'premium-plus', 'pago o Plus: acesso a todas as galáxias');
  ok(asaas.deleted.includes(asaasSub1), 'a assinatura antiga do Premium é cancelada no Asaas (sem cobrar duas vezes)', asaas.deleted);
  const subsNow = (await call('GET', '/billing/me/subscriptions', T)).body;
  ok(subsNow.find((s) => s.id === co2.body.subscriptionId).status === 'CANCELED', 'a antiga fica CANCELED no histórico');
  const down = await call('POST', '/billing/checkout', T, { planId: premMonthly.id, cpfCnpj: '52998224725' });
  ok(down.status === 400 && /plano menor/.test(down.body.message), 'descer de plano no meio do período é recusado com orientação', down.body.message);

  // ---------------------------------------------------------------- cancelar
  const can = await call('POST', `/billing/subscriptions/${up.body.subscriptionId}/cancel`, T);
  ok(can.status < 300 && can.body.cancelAtPeriodEnd === true && asaas.deleted.includes(asaasSubPlus), 'cancelar: não cobra mais (cancelado no Asaas) e vale até o fim do período', { cancelAtPeriodEnd: can.body.cancelAtPeriodEnd });
  ok((await call('GET', '/me/entitlements', T)).body.premium === true, 'depois de cancelar, o Premium continua até o fim do que foi pago');

  // ---------------------------------------------------------------- colaborador de empresa não assina
  const col = await call('POST', '/auth/register', null, { name: 'Colab', email: `colab-${RUN}@teste.example`, password: `Senha${RUN}1`, birthDate: '1990-01-01', companyCode: 'ORBITA-2026' });
  const colCo = await call('POST', '/billing/checkout', col.body.accessToken, { planId: premMonthly.id, cpfCnpj: '52998224725' });
  ok(colCo.status === 400 && /aluno individual/.test(colCo.body.message), 'colaborador (perfil da empresa) não assina o Premium', colCo.body.message);
  const outro = await call('POST', `/billing/subscriptions/${co2.body.subscriptionId}/refresh`, col.body.accessToken);
  ok(outro.status === 400, 'ninguém confere a assinatura de outra pessoa', outro.status);
} finally {
  mock.close();
}
console.log(`\n${total - fails}/${total} verificações — ${fails ? fails + ' FALHA(S)' : 'TODAS PASSARAM'}`);
process.exit(fails ? 1 : 0);
