import { productionConfigProblems, swaggerEnabled } from './production-check';

const good = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://folks:x@postgres:5432/universo_folks',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  APP_URL: 'https://api.exemplo.com.br',
  PUBLIC_APP_URL: 'https://app.exemplo.com.br',
  CORS_ORIGINS: 'https://app.exemplo.com.br',
};

describe('productionConfigProblems', () => {
  it('aceita uma configuração completa', () => {
    expect(productionConfigProblems(good)).toEqual([]);
  });

  it('recusa o segredo do .env.example e segredo curto', () => {
    expect(productionConfigProblems({ ...good, JWT_ACCESS_SECRET: 'troque-este-segredo-access' }).join()).toMatch(/JWT_ACCESS_SECRET fraco/);
    expect(productionConfigProblems({ ...good, JWT_ACCESS_SECRET: 'curto' }).join()).toMatch(/JWT_ACCESS_SECRET fraco/);
  });

  it('recusa token de webhook e senha do seed com valor de exemplo', () => {
    const p = productionConfigProblems({ ...good, REVENUECAT_WEBHOOK_AUTH: 'troque-este-segredo', ASAAS_WEBHOOK_TOKEN: 'troque-este-token', SEED_MASTER_PASSWORD: 'TroqueEssaSenha123' });
    expect(p).toEqual(expect.arrayContaining([
      'REVENUECAT_WEBHOOK_AUTH ainda está com o valor de exemplo',
      'ASAAS_WEBHOOK_TOKEN ainda está com o valor de exemplo',
      'SEED_MASTER_PASSWORD ainda está com o valor de exemplo',
    ]));
  });

  it('exige variáveis obrigatórias, https e CORS sem curinga', () => {
    const p = productionConfigProblems({ ...good, DATABASE_URL: '', APP_URL: 'http://api.exemplo.com.br', CORS_ORIGINS: '*' });
    expect(p).toEqual(expect.arrayContaining(['DATABASE_URL não definido', 'APP_URL precisa ser https:// em produção', 'CORS_ORIGINS não pode ser "*" (a sessão usa credenciais)']));
  });
});

describe('swaggerEnabled', () => {
  it('liga em dev e desliga em produção, salvo SWAGGER_ENABLED', () => {
    expect(swaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(swaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
  });
});
