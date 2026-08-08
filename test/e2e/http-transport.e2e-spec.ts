import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('HTTP layer (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('sets helmet security headers and hides the framework', async () => {
    const res = await harness.inject({ url: '/health/live' });

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('compresses a response once it exceeds the size threshold', async () => {
    await harness.truncateAll();
    const { headers: auth } = await harness.actingAs({ role: 'admin' });

    for (let i = 0; i < 25; i++) {
      await harness.inject({
        method: 'POST',
        url: '/api/v1/users',
        headers: auth,
        payload: {
          email: `compress-${i}@example.com`,
          displayName: `Compression Subject Number ${i}`,
          password: 'correct horse battery staple',
        },
      });
    }

    const res = await harness.inject({
      url: '/api/v1/users?limit=100',
      headers: { ...auth, 'accept-encoding': 'gzip' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('leaves a small response uncompressed', async () => {
    const res = await harness.inject({
      url: '/health/live',
      headers: { 'accept-encoding': 'gzip' },
    });

    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('answers a CORS preflight', async () => {
    const res = await harness.inject({
      method: 'OPTIONS',
      url: '/api/v1/users',
      headers: {
        origin: 'https://studviro.app',
        'access-control-request-method': 'POST',
      },
    });

    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('rejects a body over the configured limit with 413', async () => {
    const res = await harness.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        email: 'a@b.co',
        displayName: 'x'.repeat(2_000_000),
        password: 'x'.repeat(12),
      }),
    });

    expect(res.statusCode).toBe(413);
  });

  it('returns 404 in the standard error shape for an unknown route', async () => {
    const res = await harness.inject({ url: '/api/v1/nope' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ statusCode: 404, path: '/api/v1/nope' });
    expect(res.json().timestamp).toBeDefined();
  });
});
