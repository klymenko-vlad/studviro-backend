// Must be first: it fills `process.env` before any module below is imported,
// and several of them read it while their decorators are being evaluated.
import './config/load-env';

import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Http2ServerRequest } from 'node:http2';

import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { REQUEST_ID_HEADER } from './common/logger/logger.module';
import { AppConfigService } from './config/app-config.service';
import { validateEnv } from './config/env.schema';
import { parseTrustProxy } from './config/trust-proxy';
import { buildOpenApiDocument } from './openapi.document';

export async function createApp(): Promise<NestFastifyApplication> {
  // The Fastify adapter is constructed before Nest's DI container exists, so
  // its options cannot come from `AppConfigService`. Validating here as well is
  // cheap and keeps one schema as the only source of truth. The dotenv files
  // are already loaded — see the side-effect import at the top of this file.
  const env = validateEnv(process.env);

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // Fastify owns request.id and pino-http reuses it, so the id must be
      // minted here rather than in the logger, or the two disagree.
      genReqId: (req: IncomingMessage | Http2ServerRequest) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        return typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
      },
      trustProxy: parseTrustProxy(env.TRUSTED_PROXIES),
      bodyLimit: env.BODY_LIMIT_BYTES,
    }),
    { bufferLogs: true },
  );

  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.flushLogs();

  await app.register(helmet, {
    contentSecurityPolicy: config.swaggerEnabled ? false : undefined,
  });
  await app.register(compress, { encodings: ['br', 'gzip', 'deflate'], threshold: 1024 });

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onSend', (request, reply, _payload, done) => {
      reply.header(REQUEST_ID_HEADER, request.id);
      done();
    });

  const { corsOrigins } = config.http;
  app.enableCors({
    origin: corsOrigins,
    // Credentials are only safe against an explicit allow-list. `origin: true`
    // echoes whatever Origin the caller sent, so pairing the two would let any
    // website on the internet call this API as a signed-in user.
    credentials: corsOrigins !== true,
    maxAge: 86_400,
  });

  app.setGlobalPrefix(config.http.apiPrefix, {
    exclude: ['health', 'health/live', 'health/ready', 'metrics'],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  app.enableShutdownHooks();

  if (config.swaggerEnabled) {
    setupSwagger(app, config);
  }

  return app;
}

function setupSwagger(app: NestFastifyApplication, config: AppConfigService): void {
  const document = buildOpenApiDocument(app, { appUrl: config.http.appUrl });

  const path = `${config.http.apiPrefix}/docs`;

  const credentials = config.swaggerCredentials;
  if (credentials) {
    guardSwaggerWithBasicAuth(app, path, credentials);
  }

  SwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `${path}/json`,
    yamlDocumentUrl: `${path}/yaml`,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
      displayRequestDuration: true,
    },
  });
}

/**
 * Basic rather than bearer auth: the docs are opened in a browser, and only
 * Basic makes the browser collect the credentials for us. Covers the UI and the
 * `/json` and `/yaml` documents, which leak the same API surface.
 */
function guardSwaggerWithBasicAuth(
  app: NestFastifyApplication,
  path: string,
  credentials: { readonly user: string; readonly password: string },
): void {
  const prefix = `/${path.replace(/^\/+/, '')}`;
  const expected = `${credentials.user}:${credentials.password}`;

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, reply, done) => {
      const url = request.url.split('?')[0] ?? '';
      if (url !== prefix && !url.startsWith(`${prefix}/`)) {
        done();
        return;
      }

      const authorization = request.headers.authorization;
      const presented = authorization?.startsWith('Basic ')
        ? Buffer.from(authorization.slice(6), 'base64').toString('utf8')
        : undefined;

      if (!presented || !sameValue(presented, expected)) {
        void reply
          .code(401)
          .header('www-authenticate', 'Basic realm="Studviro API docs", charset="UTF-8"')
          .send({ statusCode: 401, message: 'Valid documentation credentials are required' });
        return;
      }

      done();
    });
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
