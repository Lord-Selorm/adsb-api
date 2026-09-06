import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS')?.split(',').map((s) => s.trim()) ?? true,
  });
  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api'));

  const port = Number(config.get<string>('PORT') ?? 3000);
  try {
    await app.listen(port);
    Logger.log(`ADS-B API listening on http://localhost:${port}`, 'Bootstrap');
  } catch (err: any) {
    if (err.code === 'EADDRINUSE') {
      Logger.error(`Port ${port} is already in use.`, 'Bootstrap');
      Logger.error('Hint: kill the existing process or set a different PORT in .env', 'Bootstrap');
    }
    throw err;
  }
}
void bootstrap();