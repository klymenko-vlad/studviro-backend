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
  TWO_FACTOR_SECRET_KEY: 't'.repeat(32),
  STORAGE_ACCESS_KEY_ID: 'real-object-store-key',
  STORAGE_SECRET_ACCESS_KEY: 'real-object-store-secret',
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

    it('rejects Swagger credentials that are only half configured', () => {
      expect(() =>
        validateEnv({ ...production, SWAGGER_ENABLED: 'true', SWAGGER_USER: 'docs' }),
      ).toThrow(/SWAGGER_ENABLED/);
    });

    it('allows Swagger on a deployed environment once it is password-protected', () => {
      const env = validateEnv({
        ...production,
        SWAGGER_ENABLED: 'true',
        SWAGGER_USER: 'docs',
        SWAGGER_PASSWORD: 's'.repeat(16),
      });

      expect(env.SWAGGER_ENABLED).toBe(true);
      expect(env.SWAGGER_USER).toBe('docs');
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

    it('rejects the development two-factor key', () => {
      const { TWO_FACTOR_SECRET_KEY: _omitted, ...withoutKey } = production;

      expect(() => validateEnv(withoutKey)).toThrow(/TWO_FACTOR_SECRET_KEY/);
    });

    it('rejects reusing one secret for both access and refresh tokens', () => {
      const shared = 'c'.repeat(32);

      expect(() =>
        validateEnv({ ...production, JWT_ACCESS_SECRET: shared, JWT_REFRESH_SECRET: shared }),
      ).toThrow(/JWT_REFRESH_SECRET/);
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

  describe('object storage', () => {
    it('defaults to the MinIO in docker compose, so development needs no account', () => {
      const env = validateEnv(base);

      expect(env.STORAGE_BUCKET).toBe('studviro');
      expect(env.STORAGE_FORCE_PATH_STYLE).toBe(true);
      expect(env.STORAGE_ENDPOINT).toBeUndefined();
    });

    it.each(['STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY'] as const)(
      'refuses to boot production with the development %s',
      (key) => {
        expect(() => validateEnv({ ...production, [key]: 'studviro' })).toThrow(
          new RegExp(key, 'u'),
        );
      },
    );

    it('lets a deployment that does not use storage skip the credentials', () => {
      expect(() =>
        validateEnv({
          ...production,
          STORAGE_ENABLED: 'false',
          STORAGE_ACCESS_KEY_ID: 'studviro',
          STORAGE_SECRET_ACCESS_KEY: 'studviro',
        }),
      ).not.toThrow();
    });

    it('caps a signed read URL at an hour', () => {
      expect(() => validateEnv({ ...base, STORAGE_SIGNED_URL_TTL_S: '7200' })).toThrow(
        /STORAGE_SIGNED_URL_TTL_S/u,
      );
    });
  });

  describe('mail', () => {
    it('logs mail instead of sending it unless a transport is chosen', () => {
      const env = validateEnv(base);

      expect(env.MAIL_TRANSPORT).toBe('log');
      expect(env.WEB_APP_URL).toBe('http://localhost:3001');
    });

    it('needs a host before it can send over SMTP', () => {
      expect(() => validateEnv({ ...base, MAIL_TRANSPORT: 'smtp' })).toThrow(/SMTP_HOST/u);
      expect(() =>
        validateEnv({ ...base, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'localhost' }),
      ).not.toThrow();
    });

    it('refuses an SMTP password without a user, which no server accepts', () => {
      expect(() =>
        validateEnv({ ...base, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'h', SMTP_PASSWORD: 'p' }),
      ).toThrow(/SMTP_USER/u);
    });

    it('refuses to send production mail from the development address', () => {
      expect(() =>
        validateEnv({ ...production, MAIL_TRANSPORT: 'smtp', SMTP_HOST: 'smtp.example.org' }),
      ).toThrow(/MAIL_FROM/u);
      expect(() =>
        validateEnv({
          ...production,
          MAIL_TRANSPORT: 'smtp',
          SMTP_HOST: 'smtp.example.org',
          MAIL_FROM: 'StudViro <noreply@ukf.sk>',
        }),
      ).not.toThrow();
    });
  });
});
