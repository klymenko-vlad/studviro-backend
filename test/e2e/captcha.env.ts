/**
 * Side-effect module: turns the captcha on before the application graph is
 * imported.
 *
 * It ships off, which is what keeps every other suite unchallenged. This one
 * asserts the guard actually refuses, so it needs the opposite — and
 * `config.module.ts` validates the environment when it is *imported*, so a
 * `beforeAll` that mutates `process.env` would already be too late. Same
 * reason `throttle.env.ts` exists.
 */
export const CAPTCHA_SECRET = 'an-e2e-captcha-secret-of-32-chars-plus';
export const CAPTCHA_MAX_NUMBER = 200;

process.env.CAPTCHA_ENABLED = 'true';
process.env.CAPTCHA_SECRET = CAPTCHA_SECRET;
process.env.CAPTCHA_MAX_NUMBER = String(CAPTCHA_MAX_NUMBER);
process.env.CAPTCHA_TTL_S = '600';
// Its own Redis namespace, so a spent challenge here cannot collide elsewhere.
process.env.QUEUE_PREFIX = `test-captcha-${process.pid}`;
