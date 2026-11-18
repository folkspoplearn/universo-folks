import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';

/** Servidor sempre ligado (dev e Docker/VPS). Na Vercel a entrada é serverless.ts. */
async function bootstrap() {
  const { app, docs } = await createApp();
  app.enableShutdownHooks(); // docker stop: fecha conexões do Prisma antes de sair

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API em http://localhost:${port}/api  |  ${docs ? 'Swagger em /docs' : 'Swagger desligado'}  |  MCP em /mcp`, 'Bootstrap');
}
bootstrap().catch(() => process.exit(1));
