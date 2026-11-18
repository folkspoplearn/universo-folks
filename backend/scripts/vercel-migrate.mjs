// Migrações no build da Vercel: só no deploy de PRODUÇÃO e só se DIRECT_URL estiver definida.
// Usa a conexão direta/sessão do Supabase (o pooler em modo transação não serve para migrar).
// "prisma migrate deploy" só aplica migrações pendentes: nunca apaga dados nem reseta o banco.
import { spawnSync } from 'node:child_process';

const env = process.env.VERCEL_ENV;
if (env !== 'production') {
  console.log(`[migrate] ambiente "${env ?? 'local'}": migrações não rodam fora da produção.`);
  process.exit(0);
}
if (!process.env.DIRECT_URL) {
  console.log('[migrate] DIRECT_URL não definida: pulei as migrações. Rode "prisma migrate deploy" manualmente.');
  process.exit(0);
}
console.log('[migrate] aplicando migrações pendentes (prisma migrate deploy)...');
const r = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: process.env.DIRECT_URL },
});
process.exit(r.status ?? 1);
