import './metrics.env';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';
describe('probe', () => {
  let h: TestHarness;
  beforeAll(async () => {
    h = await createTestHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  it('probes', async () => {
    for (const url of ['/metrics', '/v1/metrics', '/api/metrics', '/api/v1/metrics']) {
      const r = await h.inject({
        url,
        headers: { authorization: 'Bearer metrics-token-for-the-e2e-suite-0001' },
      });
      process.stderr.write(`PROBE ${url} ${r.statusCode}\n`);
    }
    expect(true).toBe(true);
  });
});
