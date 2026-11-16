import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/** Raiz do monorepo: o build standalone precisa seguir o @folks/shared do workspace. */
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * A área logada é renderizada no cliente: a sessão fica em memória e o refresh num cookie
 * httpOnly lido só pelas rotas /api/sessao (ADR 0012). Por isso Cache Components e
 * partial prefetching ficam DESLIGADOS: não há conteúdo autenticado para pré-renderizar
 * e a validação de "navegação instantânea" só geraria ruído.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // imagem Docker enxuta (deploy/docker/web.Dockerfile): server.js + só as dependências usadas
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
    rules: {
      '*.css': { loaders: ['@tailwindcss/turbopack'], as: '*.css' },
    },
  },
};

export default nextConfig;
