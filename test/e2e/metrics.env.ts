/**
 * Side-effect module: protects the scrape endpoint before the application
 * graph is imported.
 *
 * `ConfigModule.forRoot` validates the environment when `config.module.ts` is
 * *imported*, not when the app is instantiated — so a `beforeAll` that mutates
 * `process.env` is already too late.
 */
export const METRICS_TOKEN = 'metrics-token-for-the-e2e-suite-0001';

process.env.METRICS_TOKEN = METRICS_TOKEN;
process.env.QUEUE_PREFIX = `test-metrics-${process.pid}`;
