import { type ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from './app-config.service';
import type { Env } from './env.schema';

const build = (overrides: Partial<Record<keyof Env, unknown>> = {}) => {
  const values: Record<string, unknown> = {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: '0.0.0.0',
    APP_URL: 'http://localhost:3000',
    API_PREFIX: 'api',
    REQUEST_TIMEOUT_MS: 15_000,
    SHUTDOWN_DRAIN_MS: 5_000,
    BODY_LIMIT_BYTES: 1_048_576,
    CORS_ORIGINS: '*',
    TRUSTED_PROXIES: 'loopback',
    ...overrides,
  };

  return new AppConfigService({
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>);
};

describe('AppConfigService', () => {
  describe('corsOrigins', () => {
    it('maps "*" to reflect-any-origin', () => {
      expect(build().http.corsOrigins).toBe(true);
    });

    it('splits a comma-separated allow-list and trims whitespace', () => {
      const config = build({ CORS_ORIGINS: 'https://a.dev, https://b.dev' });

      expect(config.http.corsOrigins).toEqual(['https://a.dev', 'https://b.dev']);
    });

    it('drops empty entries from a trailing comma', () => {
      const config = build({ CORS_ORIGINS: 'https://a.dev,' });

      expect(config.http.corsOrigins).toEqual(['https://a.dev']);
    });
  });

  describe('environment predicates', () => {
    it.each([
      ['production', { isProduction: true, isTest: false, isDevelopment: false }],
      ['test', { isProduction: false, isTest: true, isDevelopment: false }],
      ['development', { isProduction: false, isTest: false, isDevelopment: true }],
    ])('reports %s correctly', (nodeEnv, expected) => {
      const config = build({ NODE_ENV: nodeEnv });

      expect({
        isProduction: config.isProduction,
        isTest: config.isTest,
        isDevelopment: config.isDevelopment,
      }).toEqual(expected);
    });
  });
});
