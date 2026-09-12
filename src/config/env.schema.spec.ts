import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
};

const production = {
  ...base,
  NODE_ENV: 'production',
  CORS_ORIGINS: 'https://studviro.app',
  SWAGGER_ENABLED: 'false',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  METRICS_TOKEN: 'm'.repeat(32),
  CONNECTOR_CREDENTIAL_SECRET: 'c'.repeat(32),
};

describe('validateEnv', () => {
  it('applies development-friendly defaults', () => {
    const env = validateEnv(base);

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.ROLE).toBe('all');
    expect(env.TRUSTED_PROXIES).toBe('loopback');
  });

  it('defaults Swagger to off, so an unconfigured deploy does not publish docs', () => {
    expect(validateEnv(base).SWAGGER_ENABLED).toBe(false);
  });

  it('reports every invalid variable at once rather than one per restart', () => {
    expect(() => validateEnv({ DATABASE_URL: 'not-a-url', PORT: '70000' })).toThrow(
      /DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('requires DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('accepts a fully configured production environment', () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  describe('production hardening', () => {
    it('rejects a wildcard CORS origin', () => {
      expect(() => validateEnv({ ...production, CORS_ORIGINS: '*' })).toThrow(/CORS_ORIGINS/);
    });

    it('rejects Swagger being served publicly', () => {
      expect(() => validateEnv({ ...production, SWAGGER_ENABLED: 'true' })).toThrow(
        /SWAGGER_ENABLED/,
      );
    });

    it('rejects trusting every proxy hop', () => {
      expect(() => validateEnv({ ...production, TRUSTED_PROXIES: 'true' })).toThrow(
        /TRUSTED_PROXIES/,
      );
    });

    it('rejects the development JWT secret', () => {
      const { JWT_ACCESS_SECRET: _omitted, ...withoutAccessSecret } = production;

      expect(() => validateEnv(withoutAccessSecret)).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('rejects reusing one secret for both access and refresh tokens', () => {
      const shared = 'c'.repeat(32);

      expect(() =>
        validateEnv({ ...production, JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
      ).toThrow(/JWT_REFRESH_SECRET/);
    });

    it('rejects the development connector credential secret', () => {
      const { CONNECTOR_CREDENTIAL_SECRET: _omitted, ...withoutConnectorSecret } = production;

      expect(() => validateEnv(withoutConnectorSecret)).toThrow(/CONNECTOR_CREDENTIAL_SECRET/);
    });

    it('requires a metrics token when metrics are enabled', () => {
      const { METRICS_TOKEN: _omitted, ...withoutMetricsToken } = production;

      expect(() => validateEnv(withoutMetricsToken)).toThrow(/METRICS_TOKEN/);
    });

    it('allows those same values outside production', () => {
      expect(() =>
        validateEnv({ ...base, NODE_ENV: 'development', CORS_ORIGINS: '*' }),
      ).not.toThrow();
    });
  });
});
