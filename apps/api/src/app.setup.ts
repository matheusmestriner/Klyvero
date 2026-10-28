import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Everything that makes the HTTP app behave like production. Shared by main.ts and the e2e tests. */
export function configureApp(app: NestExpressApplication) {
  const config = app.get(ConfigService);
  const production = config.get('NODE_ENV') === 'production';
  const express = app.getHttpAdapter().getInstance();
  const proxyHops = Number(config.get('TRUST_PROXY_HOPS') ?? (production ? 1 : 0));

  if (proxyHops > 0) express.set('trust proxy', proxyHops);
  express.disable('x-powered-by');
  express.set('query parser', 'simple');

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: config.get('JSON_BODY_LIMIT') ?? '128kb', strict: true });
  app.useBodyParser('urlencoded', { limit: config.get('FORM_BODY_LIMIT') ?? '32kb', extended: false });

  const configuredOrigins = String(config.get('WEB_ORIGIN') ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => new URL(value).origin);

  app.enableCors({
    origin(origin, callback) {
      if (!origin || configuredOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'x-api-key', 'x-inbound-token', 'x-klyvero-client', 'stripe-signature'],
    maxAge: 600,
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    stopAtFirstError: false,
  }));

  if (!production || config.get('SWAGGER_ENABLED') === 'true') {
    const swagger = new DocumentBuilder()
      .setTitle('Klyvero API')
      .setDescription('Klyvero AI Sales OS')
      .setVersion('2.5.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'apiKey')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  }
}
