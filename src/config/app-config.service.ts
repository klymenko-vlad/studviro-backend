import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppRole, Env } from './env.schema';
import { parseTrustProxy } from './trust-proxy';

export interface HttpConfig {
  readonly port: number;
  readonly host: string;
  readonly appUrl: string;
  readonly apiPrefix: string;
  readonly requestTimeoutMs: number;
  readonly shutdownDrainMs: number;
  readonly bodyLimitBytes: number;
  readonly corsOrigins: true | string[];
  readonly trustProxy: boolean | string | string[];
}

export interface DatabaseConfig {
  readonly url: string;
  readonly replicaUrl: string | undefined;
  readonly poolMax: number;
  readonly ssl: boolean;
  readonly statementTimeoutMs: number;
  readonly idleTransactionTimeoutMs: number;
}

export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password: string | undefined;
  readonly db: number;
  readonly tls: boolean;
}

export interface QueueConfig {
  readonly prefix: string;
  readonly defaultAttempts: number;
  readonly defaultBackoffMs: number;
  readonly uiEnabled: boolean;
}

export interface StorageConfig {
  enabled: boolean;
  bucket: string;
  region: string;
  endpoint: string | undefined;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  maxUploadBytes: number;
  signedUrlTtlSeconds: number;
}

export interface ThrottleConfig {
  readonly ttlMs: number;
  readonly limit: number;
}

export interface JwtConfig {
  readonly accessSecret: string;
  readonly refreshSecret: string;
  readonly accessTtl: string;
  readonly refreshTtl: string;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.config.get<Env['NODE_ENV']>('NODE_ENV');
  }

  get role(): AppRole {
    return this.config.get<AppRole>('ROLE');
  }

  get servesHttp(): boolean {
    return this.role !== 'worker';
  }

  get runsWorkers(): boolean {
    return this.role !== 'api';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get http(): HttpConfig {
    return {
      port: this.config.get<number>('PORT'),
      host: this.config.get<string>('HOST'),
      appUrl: this.config.get<string>('APP_URL'),
      apiPrefix: this.config.get<string>('API_PREFIX'),
      requestTimeoutMs: this.config.get<number>('REQUEST_TIMEOUT_MS'),
      shutdownDrainMs: this.config.get<number>('SHUTDOWN_DRAIN_MS'),
      bodyLimitBytes: this.config.get<number>('BODY_LIMIT_BYTES'),
      corsOrigins: this.parseOrigins(this.config.get<string>('CORS_ORIGINS')),
      trustProxy: parseTrustProxy(this.config.get<string>('TRUSTED_PROXIES')),
    };
  }

  get database(): DatabaseConfig {
    return {
      url: this.config.get<string>('DATABASE_URL'),
      replicaUrl: this.config.get<string | undefined>('DATABASE_URL_REPLICA'),
      poolMax: this.config.get<number>('DATABASE_POOL_MAX'),
      ssl: this.config.get<boolean>('DATABASE_SSL'),
      statementTimeoutMs: this.config.get<number>('DATABASE_STATEMENT_TIMEOUT_MS'),
      idleTransactionTimeoutMs: this.config.get<number>('DATABASE_IDLE_TX_TIMEOUT_MS'),
    };
  }

  get redis(): RedisConfig {
    return {
      host: this.config.get<string>('REDIS_HOST'),
      port: this.config.get<number>('REDIS_PORT'),
      password: this.config.get<string | undefined>('REDIS_PASSWORD'),
      db: this.config.get<number>('REDIS_DB'),
      tls: this.config.get<boolean>('REDIS_TLS'),
    };
  }

  get queue(): QueueConfig {
    return {
      prefix: this.config.get<string>('QUEUE_PREFIX'),
      defaultAttempts: this.config.get<number>('QUEUE_DEFAULT_ATTEMPTS'),
      defaultBackoffMs: this.config.get<number>('QUEUE_DEFAULT_BACKOFF_MS'),
      uiEnabled: this.config.get<boolean>('QUEUE_UI_ENABLED'),
    };
  }

  get throttle(): ThrottleConfig {
    return {
      ttlMs: this.config.get<number>('THROTTLE_TTL_MS'),
      limit: this.config.get<number>('THROTTLE_LIMIT'),
    };
  }

  /** The far tighter budget applied to credential endpoints. */
  get authThrottle(): ThrottleConfig {
    return {
      ttlMs: this.config.get<number>('AUTH_THROTTLE_TTL_MS'),
      limit: this.config.get<number>('AUTH_THROTTLE_LIMIT'),
    };
  }

  /** The site-wide budget applied to unauthenticated form submissions. */
  get publicFormThrottle(): ThrottleConfig {
    return {
      ttlMs: this.config.get<number>('PUBLIC_FORM_THROTTLE_TTL_MS'),
      limit: this.config.get<number>('PUBLIC_FORM_THROTTLE_LIMIT'),
    };
  }

  get jwt(): JwtConfig {
    return {
      accessSecret: this.config.get<string>('JWT_ACCESS_SECRET'),
      refreshSecret: this.config.get<string>('JWT_REFRESH_SECRET'),
      accessTtl: this.config.get<string>('JWT_ACCESS_TTL'),
      refreshTtl: this.config.get<string>('JWT_REFRESH_TTL'),
    };
  }

  get storage(): StorageConfig {
    return {
      enabled: this.config.get<boolean>('STORAGE_ENABLED'),
      bucket: this.config.get<string>('STORAGE_BUCKET'),
      region: this.config.get<string>('STORAGE_REGION'),
      endpoint: this.config.get<string | undefined>('STORAGE_ENDPOINT'),
      forcePathStyle: this.config.get<boolean>('STORAGE_FORCE_PATH_STYLE'),
      accessKeyId: this.config.get<string>('STORAGE_ACCESS_KEY_ID'),
      secretAccessKey: this.config.get<string>('STORAGE_SECRET_ACCESS_KEY'),
      maxUploadBytes: this.config.get<number>('STORAGE_MAX_UPLOAD_BYTES'),
      signedUrlTtlSeconds: this.config.get<number>('STORAGE_SIGNED_URL_TTL_S'),
    };
  }

  get cacheTtlMs(): number {
    return this.config.get<number>('CACHE_TTL_MS');
  }

  get idempotencyTtlMs(): number {
    return this.config.get<number>('IDEMPOTENCY_TTL_MS');
  }

  get metricsEnabled(): boolean {
    return this.config.get<boolean>('METRICS_ENABLED');
  }

  get metricsToken(): string | undefined {
    return this.config.get<string | undefined>('METRICS_TOKEN');
  }

  get otlpEndpoint(): string | undefined {
    return this.config.get<string | undefined>('OTEL_EXPORTER_OTLP_ENDPOINT');
  }

  get logging(): { readonly level: Env['LOG_LEVEL'] } {
    return { level: this.config.get<Env['LOG_LEVEL']>('LOG_LEVEL') };
  }

  get swaggerEnabled(): boolean {
    return this.config.get<boolean>('SWAGGER_ENABLED');
  }

  /**
   * Present only when the docs are meant to be password-protected. Optional in
   * development, mandatory in production — see `assertProductionHardening`.
   */
  get swaggerCredentials(): { readonly user: string; readonly password: string } | undefined {
    const user = this.config.get<string | undefined>('SWAGGER_USER');
    const password = this.config.get<string | undefined>('SWAGGER_PASSWORD');

    return user && password ? { user, password } : undefined;
  }

  private parseOrigins(raw: string): true | string[] {
    if (raw === '*') return true;

    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
}
