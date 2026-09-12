// Must stay the first import: it sets the limits this suite asserts on, and
// `config.module.ts` validates the environment as soon as it is imported.
import './throttle.env';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

/**
 * Credential endpoints and the rest of the API are metered on separate budgets.
 * The limits come from the validated config, so this suite runs with a
 * deliberately tiny `AUTH_THROTTLE_LIMIT` and a generous global one — which
 * only tells the two apart if the wiring actually keeps them apart.
 *
 * Worth testing end to end rather than in isolation: the previous
 * implementation read the limit from `process.env` while its decorator was
 * being evaluated, so it type-checked, passed review, and silently applied a
 * hardcoded default instead.
 */
const AUTH_LIMIT = Number(process.env.AUTH_THROTTLE_LIMIT);

describe('rate limiting', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
    await harness.truncateAll();
  });

  afterAll(async () => {
    await harness.close();
  });

  const login = () =>
    harness.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong-password-here' },
    });

  it('cuts off credential attempts at the auth limit', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < AUTH_LIMIT + 2; attempt++) {
      statuses.push((await login()).statusCode);
    }

    // Bad credentials until the budget is spent, then rejected outright.
    expect(statuses.slice(0, AUTH_LIMIT)).toEqual(
      Array.from({ length: AUTH_LIMIT }, () => 401),
    );
    expect(statuses.slice(AUTH_LIMIT)).toEqual([429, 429]);
  });

  it('meters the public demo form on the credential budget, not the global one', async () => {
    const statuses: number[] = [];

    for (let attempt = 0; attempt < AUTH_LIMIT + 2; attempt++) {
      statuses.push(
        (
          await harness.inject({
            method: 'POST',
            url: '/api/v1/demo-requests',
            payload: {
              institutionName: 'Comenius University',
              contactName: 'Ada Lovelace',
              // A distinct address each time, so deduplication cannot be what
              // stops the run.
              email: `dean-${attempt}@university.edu`,
              role: 'Vice-dean for study affairs',
            },
          })
        ).statusCode,
      );
    }

    expect(statuses.slice(0, AUTH_LIMIT)).toEqual(
      Array.from({ length: AUTH_LIMIT }, () => 202),
    );
    expect(statuses.slice(AUTH_LIMIT)).toEqual([429, 429]);
  });

  it('does not spend the credential budget on ordinary routes', async () => {
    const actor = await harness.actingAs();

    // Comfortably more requests than AUTH_THROTTLE_LIMIT allows. If the auth
    // throttler leaked onto non-credential routes, this would 429.
    for (let attempt = 0; attempt < AUTH_LIMIT + 5; attempt++) {
      const response = await harness.inject({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: actor.headers,
      });

      expect(response.statusCode).toBe(200);
    }
  });
});
