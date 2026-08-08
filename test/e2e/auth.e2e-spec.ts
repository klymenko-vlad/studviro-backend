import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

describe('Auth (e2e)', () => {
  let harness: TestHarness;

  const credentials = {
    email: 'ada@example.com',
    displayName: 'Ada Lovelace',
    password: 'correct horse battery staple',
  };

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAll();
  });

  const register = (overrides: Record<string, unknown> = {}) =>
    harness.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { ...credentials, ...overrides },
    });

  const login = (overrides: Record<string, unknown> = {}) =>
    harness.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: credentials.email, password: credentials.password, ...overrides },
    });

  const refresh = (refreshToken: string) =>
    harness.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });

  const me = (accessToken: string) =>
    harness.inject({
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

  describe('register', () => {
    it('creates an account and returns a usable token pair', async () => {
      const res = await register();

      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ tokenType: 'Bearer' });
      expect(res.json().accessToken).toEqual(expect.any(String));
      expect(res.json().refreshToken).toEqual(expect.any(String));
      expect(res.json().user).toMatchObject({ email: credentials.email });
      expect(JSON.stringify(res.json())).not.toContain('passwordHash');

      const profile = await me(res.json().accessToken);
      expect(profile.statusCode).toBe(200);
    });

    it('rejects a duplicate email with a conflict, not a 500', async () => {
      await register();

      expect((await register()).statusCode).toBe(409);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await register();
    });

    it('accepts correct credentials', async () => {
      expect((await login()).statusCode).toBe(200);
    });

    it('rejects a wrong password', async () => {
      expect((await login({ password: 'not-the-password' })).statusCode).toBe(401);
    });

    it('gives the same answer for an unknown address as for a wrong password', async () => {
      const unknown = await login({ email: 'nobody@example.com' });
      const wrong = await login({ password: 'not-the-password' });

      // Distinguishing the two would turn the login form into an oracle for
      // which email addresses hold accounts.
      expect(unknown.statusCode).toBe(wrong.statusCode);
      expect(unknown.json().code).toBe(wrong.json().code);
    });
  });

  describe('refresh rotation', () => {
    it('exchanges a refresh token for a new pair', async () => {
      const { refreshToken } = (await register()).json();

      const rotated = await refresh(refreshToken);

      expect(rotated.statusCode).toBe(200);
      expect(rotated.json().refreshToken).not.toBe(refreshToken);
    });

    it('refuses to reuse a refresh token that was already rotated', async () => {
      const { refreshToken } = (await register()).json();
      await refresh(refreshToken);

      expect((await refresh(refreshToken)).statusCode).toBe(401);
    });

    it('allows exactly one of two concurrent rotations', async () => {
      const { refreshToken } = (await register()).json();

      const responses = await Promise.all([refresh(refreshToken), refresh(refreshToken)]);

      expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 401]);
    });

    it('revokes the whole family when a rotated token is replayed', async () => {
      const { refreshToken } = (await register()).json();
      const rotated = (await refresh(refreshToken)).json();

      // Replaying the old token proves it leaked. Which holder is the attacker
      // is unknowable, so every session for the user has to end — including the
      // successor that was, until now, perfectly valid.
      await refresh(refreshToken);

      expect((await refresh(rotated.refreshToken)).statusCode).toBe(401);
    });

    it('rejects a syntactically invalid refresh token', async () => {
      expect((await refresh('not-a-token')).statusCode).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes only the presented refresh token', async () => {
      const first = (await register()).json();
      const second = (await login()).json();

      await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: { refreshToken: first.refreshToken },
      });

      expect((await refresh(first.refreshToken)).statusCode).toBe(401);
      expect((await refresh(second.refreshToken)).statusCode).toBe(200);
    });

    it('logout-all invalidates outstanding access tokens immediately', async () => {
      const session = (await register()).json();

      expect((await me(session.accessToken)).statusCode).toBe(200);

      await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/logout-all',
        headers: { authorization: `Bearer ${session.accessToken}` },
      });

      // The access token has not expired, but the token version has moved on —
      // which is the whole point of checking it on every request.
      expect((await me(session.accessToken)).statusCode).toBe(401);
      expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    });
  });

  describe('access tokens', () => {
    it('rejects a missing, malformed or forged bearer token', async () => {
      expect((await harness.inject({ url: '/api/v1/auth/me' })).statusCode).toBe(401);
      expect((await me('not-a-jwt')).statusCode).toBe(401);
      expect((await me('a.b.c')).statusCode).toBe(401);
    });
  });
});
