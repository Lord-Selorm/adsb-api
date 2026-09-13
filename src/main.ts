import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin:
      config
        .get<string>('CORS_ORIGINS')
        ?.split(',')
        .map((s) => s.trim()) ?? true,
  });
  const apiPrefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix);

  // Self-documenting API: Swagger UI + raw OpenAPI JSON. Mounted under the
  // global prefix -> GET /api/docs and /api/docs/openapi.json.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ADS-B API')
    .setDescription(
      'Live flight tracking from an ADSR-800 Mode-S/ADS-B receiver: ' +
        'ingest -> decode -> in-memory track -> REST / WebSocket feed, ' +
        'with optional TimescaleDB history.',
    )
    .setVersion('0.0.1')
    .addServer('/api')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Swagger UI at /api/docs, raw OpenAPI JSON at /api/docs-json.
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  const port = Number(config.get<string>('PORT') ?? 3000);
  try {
    await app.listen(port);
    Logger.log(`ADS-B API listening on http://localhost:${port}`, 'Bootstrap');
    Logger.log(
      `API docs: http://localhost:${port}/${apiPrefix}/docs`,
      'Bootstrap',
    );
  } catch (err: any) {
    if (err.code === 'EADDRINUSE') {
      Logger.error(`Port ${port} is already in use.`, 'Bootstrap');
      Logger.error(
        'Hint: kill the existing process or set a different PORT in .env',
        'Bootstrap',
      );
    }
    throw err;
  }
}
void bootstrap();
