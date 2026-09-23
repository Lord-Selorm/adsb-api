import { Logger } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function applyGlobalConfig(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.enableCors({
    origin:
      config
        .get<string>('CORS_ORIGINS')
        ?.split(',')
        .map((s) => s.trim()) ?? true,
  });

  const apiPrefix = config.get<string>('API_PREFIX', 'api');
  app.setGlobalPrefix(apiPrefix, { exclude: ['/'] });

  // Swagger UI at /api/docs, raw OpenAPI JSON at /api/docs-json.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ADS-B API')
    .setDescription(
      'Live flight tracking from an ADSR-800 Mode-S/ADS-B receiver: ' +
        'ingest → decode → in-memory track → REST / WebSocket feed, ' +
        'with optional InfluxDB history.',
    )
    .setVersion('0.0.1')
    .addServer('/api')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  Logger.log(
    `Swagger docs available at /${apiPrefix}/docs`,
    'Bootstrap',
  );
}
