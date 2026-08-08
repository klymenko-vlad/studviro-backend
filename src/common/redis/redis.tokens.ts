import type { RedisOptions } from 'ioredis';

import type { AppConfigService } from '../../config/app-config.service';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

/**
 * Separate from `RedisModule` so consumers can inject the client without
 * importing the module that constructs it — the cycle that would otherwise
 * form between the module and the services it provides.
 */
export function redisOptions(config: AppConfigService): RedisOptions {
  return {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    tls: config.redis.tls ? {} : undefined,
  };
}
