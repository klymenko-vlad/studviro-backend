/**
 * Side-effect module: seeds placeholder configuration before `AppModule` is
 * imported. `ConfigModule.forRoot` validates the environment at *import* time,
 * so this has to run first — hence a separate module imported at the top of
 * `openapi.ts` rather than a few assignments inside it.
 *
 * Nothing here is ever dialled. The OpenAPI document is built from decorator
 * metadata, and the app is closed without handling a request.
 */
process.env.NODE_ENV ??= 'development';
process.env.DATABASE_URL ??= 'postgres://openapi:openapi@localhost:5432/openapi';
process.env.SWAGGER_ENABLED = 'true';
process.env.LOG_LEVEL = 'silent';
