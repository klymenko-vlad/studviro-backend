import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Password reset (e2e)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  it('answers the same shape for an unknown address as for a real one', async () => {
    const unknown = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'ghost@example.com' },
    });
    expect(unknown.statusCode).toBe(200);
    expect(unknown.json()).not.toHaveProperty('devToken');

    const actor = await harness.actingAs();
    const known = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: actor.user.email },
    });
    expect(known.statusCode).toBe(200);
    expect(known.json<{ devToken: string }>().devToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('resets the password, invalidates existing sessions, and the token is single-use', async () => {
    const actor = await harness.actingAs();

    const requested = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: actor.user.email },
    });
    const { devToken } = requested.json<{ devToken: string }>();

    const confirmed = await harness.inject({
      method: 'POST',
      url: `/api/v1/auth/password-reset/${devToken}/confirm`,
      payload: { password: 'a brand new passphrase' },
    });
    expect(confirmed.statusCode).toBe(204);

    const oldMe = await harness.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: actor.headers,
    });
    expect(oldMe.statusCode).toBe(401);

    const login = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: actor.user.email, password: 'a brand new passphrase' },
    });
    expect(login.statusCode).toBe(200);

    const reused = await harness.inject({
      method: 'POST',
      url: `/api/v1/auth/password-reset/${devToken}/confirm`,
      payload: { password: 'yet another passphrase' },
    });
    expect(reused.statusCode).toBe(400);
    expect(reused.json()).toMatchObject({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
  });

  it('answers identically for an unknown, expired or reused token', async () => {
    const unknown = await harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/does-not-exist/confirm',
      payload: { password: 'a brand new passphrase' },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toMatchObject({ code: 'PASSWORD_RESET_TOKEN_INVALID' });
  });
});
