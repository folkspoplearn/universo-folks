#!/usr/bin/env node
// Cadastra e confere o webhook do Asaas que avisa a API quando uma cobrança é paga, vence, é estornada etc.
//
//   node scripts/asaas-webhook.mjs status
//   node scripts/asaas-webhook.mjs configurar --api https://SUA-API.vercel.app --email financeiro@exemplo.com.br
//   node scripts/asaas-webhook.mjs reativar
//
// Lê ASAAS_API_KEY, ASAAS_API_URL e ASAAS_WEBHOOK_TOKEN do ambiente ou do backend/.env.
// O ASAAS_WEBHOOK_TOKEN precisa ser o MESMO que está nas variáveis da API publicada (Vercel).
// Nenhuma chave ou token é impresso.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
try {
  createRequire(join(root, 'package.json'))('dotenv').config({ path: join(root, '.env'), quiet: true });
} catch {
  /* sem dotenv: usa só o ambiente */
}

export const WEBHOOK_NAME = 'Universo Folks - API';
export const WEBHOOK_PATH = '/api/billing/webhooks/asaas';
/** Eventos que a API trata (asaas.service.ts → process/applyPayment). */
export const WEBHOOK_EVENTS = [
  'PAYMENT_CREATED',
  'PAYMENT_UPDATED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_DELETED',
  'PAYMENT_RESTORED',
  'PAYMENT_REFUNDED',
  'SUBSCRIPTION_INACTIVATED',
  'SUBSCRIPTION_DELETED',
];

const args = process.argv.slice(2);
const cmd = args[0] ?? 'status';
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fail = (msg) => {
  console.error(`✘ ${msg}`);
  process.exit(1);
};

const KEY = process.env.ASAAS_API_KEY;
const BASE = (process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/$/, '');
const TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;
if (!KEY) fail('ASAAS_API_KEY não definida (ambiente ou backend/.env).');
const env = BASE.includes('sandbox') ? 'SANDBOX' : BASE.includes('api.asaas.com') ? 'PRODUÇÃO' : 'simulado/outro';

async function asaas(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { access_token: KEY, 'content-type': 'application/json', 'User-Agent': 'universo-folks' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) fail(`Asaas ${method} ${path} → HTTP ${r.status}: ${json.errors?.map((e) => e.description).join('; ') || 'sem detalhe'}`);
  return json;
}

const findOurs = async () => {
  const list = await asaas('GET', '/webhooks?limit=100');
  return { all: list.data ?? [], ours: (list.data ?? []).find((w) => w.name === WEBHOOK_NAME) };
};

function show(w) {
  const missing = WEBHOOK_EVENTS.filter((e) => !(w.events ?? []).includes(e));
  console.log(`  nome:        ${w.name}`);
  console.log(`  url:         ${w.url}`);
  console.log(`  ativo:       ${w.enabled ? 'sim' : 'NÃO'}`);
  console.log(`  fila:        ${w.interrupted ? 'INTERROMPIDA (rode "reativar" depois de corrigir a causa)' : 'rodando'}`);
  console.log(`  com token:   ${w.hasAuthToken ? 'sim' : 'NÃO'}`);
  console.log(`  envio:       ${w.sendType}${w.apiVersion ? ` · API v${w.apiVersion}` : ''}`);
  console.log(`  penalizadas: ${w.penalizedRequestsCount ?? 0}`);
  console.log(`  eventos:     ${(w.events ?? []).length}${missing.length ? ` (faltam: ${missing.join(', ')})` : ' (todos os que a API trata)'}`);
}

/** Confere que a API publicada responde e usa o mesmo token, sem gravar nada (corpo sem evento é ignorado). */
async function probe(url) {
  const post = (token) =>
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'asaas-access-token': token }, body: '{}' }).then(
      async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }),
      (e) => ({ status: 0, body: { message: e.message } }),
    );
  const wrong = await post('token-errado-de-proposito');
  if (wrong.status === 0) fail(`a API não respondeu em ${url}: ${wrong.body.message}`);
  if (wrong.status === 404) fail(`${url} respondeu 404: confira o endereço da API (precisa terminar em ${WEBHOOK_PATH}).`);
  if (wrong.status !== 401) fail(`${url} deveria recusar token errado (401), respondeu ${wrong.status}.`);
  if (/não configurado/.test(wrong.body.message ?? '')) fail('a API publicada está sem ASAAS_WEBHOOK_TOKEN: defina na Vercel e faça redeploy.');
  const right = await post(TOKEN);
  if (right.status !== 200) fail(`a API recusou o token (HTTP ${right.status}): o ASAAS_WEBHOOK_TOKEN daqui é diferente do da Vercel.`);
  console.log('✔ a API publicada responde e usa o mesmo token');
}

if (cmd === 'status') {
  console.log(`Asaas ${env} (${BASE})`);
  const { all, ours } = await findOurs();
  if (!ours) {
    console.log(`✘ webhook "${WEBHOOK_NAME}" não cadastrado. Webhooks na conta: ${all.length ? all.map((w) => `${w.name} → ${w.url}`).join(' | ') : 'nenhum'}`);
    process.exit(1);
  }
  show(ours);
  process.exit(ours.enabled && !ours.interrupted && ours.hasAuthToken ? 0 : 1);
} else if (cmd === 'configurar') {
  const api = opt('api');
  const email = opt('email');
  if (!api || !/^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)[:/])/.test(api)) fail('informe --api https://SUA-API (o endereço público da API, com https).');
  if (!TOKEN) fail('ASAAS_WEBHOOK_TOKEN não definido. Gere com "openssl rand -hex 32", coloque na Vercel e no backend/.env.');
  if (TOKEN.length < 32 || TOKEN.length > 255 || /\s/.test(TOKEN)) fail('ASAAS_WEBHOOK_TOKEN precisa ter de 32 a 255 caracteres e nenhum espaço.');
  if (TOKEN.startsWith('$aact')) fail('ASAAS_WEBHOOK_TOKEN não pode ser a chave da API do Asaas: gere outro.');
  const url = api.replace(/\/+$/, '').replace(/\/api$/, '') + WEBHOOK_PATH;
  console.log(`Asaas ${env} (${BASE})`);
  await probe(url);
  const config = { name: WEBHOOK_NAME, url, enabled: true, interrupted: false, authToken: TOKEN, sendType: 'SEQUENTIALLY', events: WEBHOOK_EVENTS };
  const { ours } = await findOurs();
  let saved;
  if (ours) {
    saved = await asaas('PUT', `/webhooks/${ours.id}`, config);
    console.log('✔ webhook atualizado');
  } else {
    if (!email) fail('informe --email (o Asaas avisa nesse e-mail se o webhook começar a falhar).');
    saved = await asaas('POST', '/webhooks', { ...config, email, apiVersion: 3 });
    console.log('✔ webhook cadastrado');
  }
  show(saved);
} else if (cmd === 'reativar') {
  const { ours } = await findOurs();
  if (!ours) fail(`webhook "${WEBHOOK_NAME}" não cadastrado: rode "configurar".`);
  if (!ours.interrupted) console.log('a fila não estava interrompida');
  const saved = await asaas('PUT', `/webhooks/${ours.id}`, { interrupted: false, enabled: true });
  console.log('✔ fila reativada: o Asaas reenvia os eventos pendentes (guardados por até 14 dias)');
  show(saved);
} else {
  fail(`comando desconhecido "${cmd}". Use: status | configurar --api URL --email EMAIL | reativar`);
}
