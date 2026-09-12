/**
 * Side-effect module: sets the rate limits before the application graph is
 * imported.
 *
 * `ConfigModule.forRoot` validates the environment when `config.module.ts` is
 * *imported*, not when the app is instantiated — so a `beforeAll` that mutates
 * `process.env` is already too late, and the suite would silently run against
 * whatever `test/setup/setup-env.ts` left behind. Same reason `openapi.ts` has
 * `openapi.env.ts` next to it.
 */
export const AUTH_LIMIT = 3;
export const PUBLIC_FORM_LIMIT = 5;

process.env.AUTH_THROTTLE_LIMIT = String(AUTH_LIMIT);
process.env.PUBLIC_FORM_THROTTLE_LIMIT = String(PUBLIC_FORM_LIMIT);
process.env.THROTTLE_LIMIT = '1000';
// Its own Redis namespace, so counters here cannot bleed in from another suite.
process.env.QUEUE_PREFIX = `test-throttle-${process.pid}`;
