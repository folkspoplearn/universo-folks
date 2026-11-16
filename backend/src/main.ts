import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { productionConfigProblems, swaggerEnabled } from './config/production-check';

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') {
    const problems = productionConfigProblems(process.env);
    if (problems.length) {
      Logger.error(`Configuração de produção inválida:\n  - ${problems.join('\n  - ')}`, 'Bootstrap');
      process.exit(1);
    }
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.set('trust proxy', 1); // atrás do Caddy/Nginx: IP real para o rate limit
  app.setGlobalPrefix('api', { exclude: ['mcp', 'health'] });
  // conteúdo interativo (SCORM/xAPI) roda em iframe servido por esta API
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false, frameguard: false }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    credentials: true,
  });
  // 25mb: importação de lotes grandes de conteúdo gerado no Claude
  app.useBodyParser('json', { limit: '25mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  const docs = swaggerEnabled(process.env);
  if (docs) {
    const doc = new DocumentBuilder()
      .setTitle('Universo Folks API')
      .setDescription('API multi-tenant (B2B, B2C, B2G) - web e app')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  }
  app.enableShutdownHooks(); // docker stop: fecha conexões do Prisma antes de sair

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`API em http://localhost:${port}/api  |  ${docs ? 'Swagger em /docs' : 'Swagger desligado'}  |  MCP em /mcp`, 'Bootstrap');
}
bootstrap();
