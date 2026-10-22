import { VersioningType, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * The single definition of the OpenAPI document, shared by the Swagger UI served
 * from `bootstrap.ts` and the `openapi.json` written by `src/openapi.ts`. Keeping
 * one builder means the docs a developer browses and the spec the frontend
 * generates from can never drift apart.
 */
export function buildOpenApiDocument(
  app: INestApplication,
  options: { appUrl?: string } = {},
): OpenAPIObject {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  const builder = new DocumentBuilder()
    .setTitle('Studviro API')
    .setDescription('Studviro backend HTTP API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth', 'Authentication and session lifecycle')
    .addTag('users', 'User accounts')
    .addTag('marketing', 'Public marketing and lead capture');

  if (options.appUrl) {
    builder.addServer(options.appUrl);
  }

  return SwaggerModule.createDocument(app, builder.build(), {
    // Operation ids default to `ControllerName_methodName`; strip the prefix so
    // generated clients get `create()` instead of `UsersController_create()`.
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
}
