import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  configureApp(app);

  const server = await app.listen(Number(config.get('PORT') ?? config.get('API_PORT') ?? 4000), '0.0.0.0');
  server.keepAliveTimeout = Number(config.get('HTTP_KEEP_ALIVE_TIMEOUT_MS') ?? 5_000);
  server.headersTimeout = Number(config.get('HTTP_HEADERS_TIMEOUT_MS') ?? 10_000);
  server.requestTimeout = Number(config.get('HTTP_REQUEST_TIMEOUT_MS') ?? 30_000);
}

bootstrap();
