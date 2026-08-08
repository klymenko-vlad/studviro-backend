import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Health (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('liveness responds without touching dependencies', async () => {
    const res = await harness.inject({ url: '/health/live' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('readiness reports the database as up', async () => {
    const res = await harness.inject({ url: '/health/ready' });

    expect(res.statusCode).toBe(200);
    expect(res.json().details.database.status).toBe('up');
  });

  it('health endpoints are excluded from the global api prefix', async () => {
    const prefixed = await harness.inject({ url: '/api/health/live' });

    expect(prefixed.statusCode).toBe(404);
  });
});
