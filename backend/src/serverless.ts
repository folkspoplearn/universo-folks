import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './app.factory';

/**
 * Entrada da API na Vercel (função serverless, chamada por api/index.js). A aplicação Nest
 * é montada uma vez por instância e reaproveitada entre requisições (Fluid compute).
 */
type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let ready: Promise<Handler> | null = null;

function getHandler(): Promise<Handler> {
  ready ??= createApp()
    .then(async ({ app }) => {
      await app.init();
      return app.getHttpAdapter().getInstance() as Handler;
    })
    .catch((e) => {
      ready = null; // tenta montar de novo na próxima requisição
      throw e;
    });
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const app = await getHandler();
    app(req, res);
  } catch {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ statusCode: 503, message: 'API indisponível: configuração inválida. Veja os logs da função na Vercel.' }));
  }
}
