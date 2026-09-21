import { z } from 'zod';

export const NodeEnv = z.enum(['development', 'test', 'production']);
export type NodeEnv = z.infer<typeof NodeEnv>;

export const AppRole = z.enum(['api', 'worker', 'all']);
export type AppRole = z.infer<typeof AppRole>;

const DEV_JWT_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';
const DEV_CAPTCHA_SECRET = 'dev-only-insecure-captcha-secret-do-not-use-in-prod';

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

export const envSchema = z.object({
  NODE_ENV: NodeEnv.default('development'),
  ROLE: AppRole.default('all'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  APP_URL: z.url().default('http://localhost:3000'),
  API_PREFIX: z.string().default('api'),

  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  CORS_ORIGINS: z.string().default('*'),

  // Comma-separated CIDRs / IPs, or `loopback`. Never `true`: trusting every
  // hop lets a client forge X-Forwarded-For and walk straight past the
  // per-IP throttler.
  TRUSTED_PROXIES: z.string().default('loopback'),

  BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576),

  DATABASE_URL: z.url().describe('postgres://user:pass@host:5432/db'),
  DATABASE_URL_REPLICA: z.url().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  DATABASE_SSL: bool('false'),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  DATABASE_IDLE_TX_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_TLS: bool('false'),

  /**
   * Object storage, S3-compatible. The production target is Cloudflare R2 or
   * AWS S3; `docker compose` runs MinIO locally and in CI so neither an
   * account nor a bill is needed to develop against it.
   *
   * `STORAGE_ENDPOINT` is what makes it portable: unset for AWS, set to the
   * R2 or MinIO endpoint otherwise. Anything that is not AWS also needs
   * path-style addressing, because virtual-host style requires DNS per bucket.
   */
  STORAGE_ENABLED: bool('true'),
  STORAGE_BUCKET: z.string().default('studviro'),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ENDPOINT: z.url().optional(),
  STORAGE_FORCE_PATH_STYLE: bool('true'),
  STORAGE_ACCESS_KEY_ID: z.string().default('studviro'),
  STORAGE_SECRET_ACCESS_KEY: z.string().default('studviro'),

  /**
   * 64 MiB. Large enough for a slide deck or a recorded seminar's handout,
   * small enough that one submission cannot fill a bucket. Enforced twice:
   * pinned into the presigned upload so the store itself refuses a larger
   * body, and checked again when the upload is confirmed.
   */
  STORAGE_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(67_108_864),

  /** Short-lived by design: a read link that outlives the reader's session is a leak. */
  STORAGE_SIGNED_URL_TTL_S: z.coerce.number().int().positive().max(3_600).default(300),

  /**
   * How long a removed file's object outlives the row that named it. Removing
   * a material tombstones the row; the object behind it is dropped by the
   * nightly sweep once this has passed. It is an operational grace period, not
   * a retention policy — nothing in the product restores a removed material,
   * so the window exists to make an accidental delete recoverable by hand, and
   * to let a failed delete be retried rather than lost.
   */
  STORAGE_RECLAIM_AFTER_DAYS: z.coerce.number().int().positive().max(365).default(30),

  /**
   * A proof-of-work captcha on the four forms open to the internet: sign-up,
   * sign-in, the password-reset request and the demo request. ALTCHA's protocol
   * (ADR 0033) — the client hashes until it finds a number, so there is no
   * third-party script, no site key and nothing to pay.
   *
   * Off by default, which is what keeps development and the e2e suite
   * unchallenged. An institution turns it on at deploy.
   */
  CAPTCHA_ENABLED: bool('false'),

  /** Signs a challenge so the server need not remember one it has not seen back. */
  CAPTCHA_SECRET: z.string().min(32).default(DEV_CAPTCHA_SECRET),

  /**
   * The search space. A browser hashes roughly a million times a second, so
   * 100k averages well under a second of work for one visitor and makes a
   * thousand forged sign-ups genuinely expensive.
   */
  CAPTCHA_MAX_NUMBER: z.coerce.number().int().positive().max(10_000_000).default(100_000),

  /** How long a challenge stays solvable. Long enough to fill a form in, not to stockpile. */
  CAPTCHA_TTL_S: z.coerce.number().int().positive().max(3_600).default(600),

  QUEUE_PREFIX: z.string().default('studviro'),
  QUEUE_DEFAULT_ATTEMPTS: z.coerce.number().int().positive().default(3),
  QUEUE_DEFAULT_BACKOFF_MS: z.coerce.number().int().positive().default(1_000),
  QUEUE_UI_ENABLED: bool('false'),

  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),

  // Credential endpoints get their own, far tighter budget. The global limit
  // exists for ordinary reads; applying it to a login form would permit
  // thousands of password guesses a minute from a single address.
  AUTH_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(10),

  // Unauthenticated form submissions. Reached through the BFF proxy they all
  // arrive from one address, so this budget is effectively site-wide: small
  // enough to blunt a script, large enough that one submitter cannot shut the
  // form for everyone else.
  PUBLIC_FORM_THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  PUBLIC_FORM_THROTTLE_LIMIT: z.coerce.number().int().positive().default(60),

  CACHE_TTL_MS: z.coerce.number().int().positive().default(30_000),
  IDEMPOTENCY_TTL_MS: z.coerce.number().int().positive().default(86_400_000),

  JWT_ACCESS_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  JWT_REFRESH_SECRET: z.string().min(32).default(DEV_JWT_SECRET),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  METRICS_ENABLED: bool('true'),
  METRICS_TOKEN: z.string().min(32).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  SENTRY_DSN: z.string().optional(),

  SWAGGER_ENABLED: bool('false'),
  // Serving the docs from a deployed box is only acceptable behind a lock, so
  // these are what turn SWAGGER_ENABLED from a production error into a
  // password-protected staging convenience.
  SWAGGER_USER: z.string().min(1).optional(),
  SWAGGER_PASSWORD: z.string().min(16).optional(),

  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(5_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Defaults are tuned for a laptop, so the same value that is convenient in
 * development is usually a vulnerability in production. Rather than making
 * every default hostile to work with, the risky combinations are rejected only
 * where they matter.
 */
function assertProductionHardening(env: Env, ctx: z.RefinementCtx): void {
  if (env.NODE_ENV !== 'production') return;

  const reject = (path: keyof Env, message: string): void => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  };

  if (env.CORS_ORIGINS === '*') {
    reject(
      'CORS_ORIGINS',
      'must list explicit origins in production; "*" reflects any origin and, combined with credentialed requests, lets any site call this API as a signed-in user',
    );
  }

  if (env.SWAGGER_ENABLED && !(env.SWAGGER_USER && env.SWAGGER_PASSWORD)) {
    reject(
      'SWAGGER_ENABLED',
      'must be false in production unless SWAGGER_USER and SWAGGER_PASSWORD are both set; unprotected it publishes the full API surface and disables the Helmet CSP',
    );
  }

  if (env.TRUSTED_PROXIES === 'true') {
    reject(
      'TRUSTED_PROXIES',
      'must name the actual proxy hops; trusting all of them lets a client forge X-Forwarded-For and bypass rate limiting',
    );
  }

  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
    if (env[key] === DEV_JWT_SECRET) {
      reject(key, 'must be set to a unique secret in production');
    }
  }

  // The shipped secret would let anyone sign their own challenge, which is the
  // whole of the check — so it is only rejected where the captcha is actually on.
  if (env.CAPTCHA_ENABLED && env.CAPTCHA_SECRET === DEV_CAPTCHA_SECRET) {
    reject(
      'CAPTCHA_SECRET',
      'must be set to a unique secret when the captcha is enabled; with the shipped one a caller can sign their own solved challenge',
    );
  }

  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    reject(
      'JWT_REFRESH_SECRET',
      'must differ from JWT_ACCESS_SECRET, or a stolen access token can be replayed as a refresh token',
    );
  }

  if (env.STORAGE_ENABLED) {
    for (const key of ['STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY'] as const) {
      if (env[key] === 'studviro') {
        reject(key, 'must be set to the real object-store credential in production');
      }
    }
  }

  if (env.METRICS_ENABLED && !env.METRICS_TOKEN) {
    reject('METRICS_TOKEN', 'must be set when metrics are enabled in production');
  }
}

const validatedEnvSchema = envSchema.superRefine(assertProductionHardening);

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = validatedEnvSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}
