// Must stay the first import: it sets the scrape token this suite asserts on,
// and `config.module.ts` validates the environment as soon as it is imported.
import './metrics.env';

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

const METRICS_TOKEN = process.env.METRICS_TOKEN ?? '';

/**
 * The scrape endpoint is the one place where a labelling mistake is permanent:
 * Prometheus keeps every series it has ever ingested for the whole retention
 * window, so a request path carrying a uuid cannot be taken back. This suite
 * exists mostly to hold that line.
 */
describe('Metrics (e2e)', () => {
  let harness: TestHarness;

  const scrape = async (): Promise<string> => {
    const res = await harness.inject({
      url: '/metrics',
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });

    expect(res.statusCode).toBe(200);

    return res.body;
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('refuses an anonymous caller once a token is configured', async () => {
    const res = await harness.inject({ url: '/metrics' });

    expect(res.statusCode).toBe(401);
  });

  it('refuses a caller presenting the wrong token', async () => {
    const res = await harness.inject({
      url: '/metrics',
      headers: { authorization: 'Bearer not-the-configured-metrics-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it.each([
    'http_request_duration_seconds',
    'http_requests_total',
    'queue_jobs_completed_total',
    'queue_jobs_failed_total',
    'queue_jobs_waiting',
    'queue_oldest_waiting_job_age_seconds',
    'database_pool_max_connections',
    'institutions_count',
    'database_migrations_applied',
    'database_migrations_expected',
  ])('exposes %s with help text', async (metric) => {
    const body = await scrape();

    expect(body).toMatch(new RegExp(`^# HELP ${metric} \\S`, 'm'));
  });

  it('counts a request under its route pattern, never its resolved path', async () => {
    const id = randomUUID();

    const res = await harness.inject({ url: `/api/v1/institutions/${id}` });

    // Turned away by the auth guard, which is exactly the traffic a Nest
    // interceptor would never have seen.
    expect(res.statusCode).toBe(401);

    const body = await scrape();

    expect(body).toContain(
      'http_requests_total{method="GET",route="/api/v1/institutions/:institutionId",status_class="4xx"}',
    );
    expect(body).not.toContain(id);
  });

  it('labels the counter with a status class rather than a status code', async () => {
    await harness.inject({ url: '/api/v1/institutions/not-a-uuid' });

    const body = await scrape();
    const counted = body.split('\n').filter((line) => line.startsWith('http_requests_total{'));

    expect(counted.length).toBeGreaterThan(0);
    expect(counted.every((line) => /status_class="[1-5]xx"/.test(line))).toBe(true);
  });

  it('samples the liveness of every queue, including the empty ones', async () => {
    const body = await scrape();

    for (const queue of ['email', 'media', 'maintenance']) {
      expect(body).toContain(`queue_oldest_waiting_job_age_seconds{queue="${queue}"} 0`);
      expect(body).toContain(`queue_jobs_waiting{queue="${queue}"} 0`);
    }
  });

  it('publishes the applied and expected migration counts, in step', async () => {
    const body = await scrape();
    const value = (metric: string) =>
      Number(new RegExp(`^${metric} (\\d+)$`, 'm').exec(body)?.[1]);

    expect(value('database_migrations_expected')).toBeGreaterThan(0);
    expect(value('database_migrations_applied')).toBe(value('database_migrations_expected'));
  });

  it('reports the configured database pool ceiling', async () => {
    const body = await scrape();

    expect(body).toMatch(/^database_pool_max_connections \d+$/m);
  });

  it('keeps the scrape endpoint outside the api prefix and the versioned surface', async () => {
    const res = await harness.inject({
      url: '/api/v1/metrics',
      headers: { authorization: `Bearer ${METRICS_TOKEN}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
