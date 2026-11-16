/**
 * Travas de produção: a API não sobe com segredo fraco ou com valor de exemplo do .env.example.
 * Só vale com NODE_ENV=production (em dev os exemplos continuam funcionando).
 */
type Env = Record<string, string | undefined>;

/** Texto dos valores de exemplo do .env.example ("troque-este-segredo", "TroqueEssaSenha123"...). */
const PLACEHOLDER = /troque/i;

const REQUIRED = ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'APP_URL', 'PUBLIC_APP_URL', 'CORS_ORIGINS'] as const;
/** Opcionais, mas se preenchidos não podem ficar com o valor de exemplo (webhook falsificável). */
const NO_PLACEHOLDER = ['DATABASE_URL', 'REVENUECAT_WEBHOOK_AUTH', 'ASAAS_WEBHOOK_TOKEN', 'SEED_MASTER_PASSWORD'] as const;

export function productionConfigProblems(env: Env): string[] {
  const problems: string[] = [];
  for (const k of REQUIRED) if (!env[k]?.trim()) problems.push(`${k} não definido`);

  const secret = env.JWT_ACCESS_SECRET ?? '';
  if (secret && (secret.length < 32 || PLACEHOLDER.test(secret))) {
    problems.push('JWT_ACCESS_SECRET fraco: use pelo menos 32 caracteres aleatórios (openssl rand -hex 32)');
  }
  for (const k of NO_PLACEHOLDER) {
    if (env[k] && PLACEHOLDER.test(env[k]!)) problems.push(`${k} ainda está com o valor de exemplo`);
  }
  for (const k of ['APP_URL', 'PUBLIC_APP_URL'] as const) {
    const v = env[k] ?? '';
    if (v && !v.startsWith('https://')) problems.push(`${k} precisa ser https:// em produção`);
  }
  if ((env.CORS_ORIGINS ?? '').split(',').some((o) => o.trim() === '*')) {
    problems.push('CORS_ORIGINS não pode ser "*" (a sessão usa credenciais)');
  }
  return problems;
}

/** Swagger em /docs: ligado em dev; em produção só com SWAGGER_ENABLED=true. */
export function swaggerEnabled(env: Env): boolean {
  if (env.SWAGGER_ENABLED !== undefined) return env.SWAGGER_ENABLED === 'true';
  return env.NODE_ENV !== 'production';
}
