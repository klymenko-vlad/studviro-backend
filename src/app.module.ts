import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module, type DynamicModule, type ExecutionContext } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CryptoModule } from './common/crypto/crypto.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { IdempotencyInterceptor } from './common/idempotency/idempotency.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';
import { LifecycleModule } from './common/lifecycle/lifecycle.module';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './common/redis/redis.module';
import { AppConfigService } from './config/app-config.service';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { CREDENTIAL_THROTTLER, IS_CREDENTIAL_ROUTE } from './modules/auth/auth.constants';
import { AuthModule } from './modules/auth/auth.module';
import { AuthorizationModule } from './modules/authorization/authorization.module';
import { ConnectorsModule } from './modules/connectors/connectors.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { UsersModule } from './modules/users/users.module';
import { QueueModule } from './queue/queue.module';

/**
 * Credential endpoints and everything else are rate-limited on separate
 * budgets, so each route is metered by exactly one of the two throttlers.
 *
 * `@nestjs/throttler` applies every configured throttler to every route, so the
 * split is expressed as complementary `skipIf` predicates rather than as
 * per-route decorators — which keeps the limits themselves in the validated
 * config instead of in a static object read from `process.env` at import time.
 */
const reflector = new Reflector();

function isCredentialRoute(context: ExecutionContext): boolean {
  if (context.getType() !== 'http') return false;

  // Undefined on every route that is not decorated, despite the declared type.
  return (
    reflector.getAllAndOverride<boolean | undefined>(IS_CREDENTIAL_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]) ?? false
  );
}

/**
 * Workers are opt-in by role. Running them inside every API replica means a
 * slow job competes with request handling on the same event loop, and it makes
 * the two impossible to scale independently — the API scales with traffic, the
 * workers with queue depth, and those rarely move together.
 */
function workerModules(): DynamicModule[] {
  const role = process.env.ROLE ?? 'all';

  return role === 'api' ? [] : [QueueModule.forWorkers()];
}

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    LifecycleModule,
    CryptoModule,
    RedisModule,
    DatabaseModule,
    ScheduleModule.forRoot(),
    QueueModule.forRoot(),
    ...workerModules(),
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.throttle.ttlMs,
            limit: config.throttle.limit,
            skipIf: isCredentialRoute,
          },
          {
            // The global limit exists for ordinary reads; applying it to a
            // login form would permit thousands of password guesses a minute
            // from a single address.
            name: CREDENTIAL_THROTTLER,
            ttl: config.authThrottle.ttlMs,
            limit: config.authThrottle.limit,
            skipIf: (context: ExecutionContext) => !isCredentialRoute(context),
          },
        ],
        // Without shared storage the counters live in each process's memory, so
        // N replicas serve N× the configured limit and every deploy resets it.
        storage: new ThrottlerStorageRedisService({
          host: config.redis.host,
          port: config.redis.port,
          password: config.redis.password,
          db: config.redis.db,
          tls: config.redis.tls ? {} : undefined,
          // QUEUE_PREFIX doubles as this deployment's Redis namespace, so two
          // environments sharing one Redis do not share throttle counters.
          keyPrefix: `${config.queue.prefix}:throttle:`,
        }),
      }),
    }),

    MetricsModule,
    HealthModule,
    AuthModule,
    AuthorizationModule,
    ConnectorsModule,
    IdentityModule,
    InstitutionsModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    {
      provide: APP_INTERCEPTOR,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) =>
        new TimeoutInterceptor(config.http.requestTimeoutMs),
    },
  ],
})
export class AppModule {}
