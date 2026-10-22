import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { stepAt, totpCode } from '../../src/modules/auth/two-factor/totp';
import { createTestHarness, type TestHarness } from '../setup/app-harness';

const PASSWORD = 'correct horse battery staple';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface Session {
  id: string;
  current: boolean;
  userAgent: string | null;
  signedInAt: string;
  lastActiveAt: string;
}

describe('Account security (e2e)', () => {
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

  const bearer = (tokens: Tokens) => ({ authorization: `Bearer ${tokens.accessToken}` });

  async function signIn(email: string, userAgent = 'Firefox', password = PASSWORD) {
    return harness.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { 'user-agent': userAgent },
      payload: { email, password },
    });
  }

  async function signedIn(email: string, userAgent?: string): Promise<Tokens> {
    const response = await signIn(email, userAgent);
    expect(response.statusCode).toBe(200);

    return response.json<Tokens>();
  }

  async function me(tokens: Tokens) {
    return harness.inject({ method: 'GET', url: '/api/v1/auth/me', headers: bearer(tokens) });
  }

  async function sessions(tokens: Tokens): Promise<Session[]> {
    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/users/me/sessions',
      headers: bearer(tokens),
    });
    expect(response.statusCode).toBe(200);

    return response.json<Session[]>();
  }

  describe('sessions', () => {
    it('lists each sign-in once, with the current one first', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email, 'Firefox');
      await signedIn(user.email, 'Safari');

      const refreshed = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { 'user-agent': 'Firefox' },
        payload: { refreshToken: laptop.refreshToken },
      });
      const rotated = refreshed.json<Tokens>();

      const listed = await sessions(rotated);
      expect(listed).toHaveLength(2);
      expect(listed[0]).toMatchObject({ current: true, userAgent: 'Firefox' });
      expect(listed[1]).toMatchObject({ current: false, userAgent: 'Safari' });
      expect(new Date(listed[0]!.lastActiveAt).getTime()).toBeGreaterThanOrEqual(
        new Date(listed[0]!.signedInAt).getTime(),
      );
    });

    it('signs one session out at once, access token included', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email, 'Firefox');
      const phone = await signedIn(user.email, 'Safari');
      const phoneSession = (await sessions(laptop)).find((s) => !s.current)!;

      const revoked = await harness.inject({
        method: 'DELETE',
        url: `/api/v1/users/me/sessions/${phoneSession.id}`,
        headers: bearer(laptop),
      });
      expect(revoked.statusCode).toBe(204);

      expect((await me(phone)).statusCode).toBe(401);
      const phoneRefresh = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refreshToken: phone.refreshToken },
      });
      expect(phoneRefresh.statusCode).toBe(401);
      expect((await me(laptop)).statusCode).toBe(200);
    });

    it('refuses to end the current session, or one that is not yours', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email);
      const current = (await sessions(laptop))[0]!;

      const own = await harness.inject({
        method: 'DELETE',
        url: `/api/v1/users/me/sessions/${current.id}`,
        headers: bearer(laptop),
      });
      expect(own.statusCode).toBe(400);
      expect(own.json()).toMatchObject({ code: 'SESSION_IS_CURRENT' });

      const stranger = await harness.actingAs();
      const theirs = await harness.inject({
        method: 'DELETE',
        url: `/api/v1/users/me/sessions/${current.id}`,
        headers: await signedIn(stranger.user.email).then(bearer),
      });
      expect(theirs.statusCode).toBe(404);
      expect((await me(laptop)).statusCode).toBe(200);
    });

    it('signs out every other session and keeps this one', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email, 'Firefox');
      const phone = await signedIn(user.email, 'Safari');
      const tablet = await signedIn(user.email, 'Chrome');

      const response = await harness.inject({
        method: 'DELETE',
        url: '/api/v1/users/me/sessions',
        headers: bearer(laptop),
      });
      expect(response.statusCode).toBe(204);

      expect((await me(phone)).statusCode).toBe(401);
      expect((await me(tablet)).statusCode).toBe(401);
      expect((await me(laptop)).statusCode).toBe(200);
      expect(await sessions(laptop)).toHaveLength(1);
    });

    it('requires a signed-in caller', async () => {
      const response = await harness.inject({
        method: 'GET',
        url: '/api/v1/users/me/sessions',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('changing the password', () => {
    async function change(tokens: Tokens, currentPassword: string, newPassword: string) {
      return harness.inject({
        method: 'POST',
        url: '/api/v1/users/me/password',
        headers: bearer(tokens),
        payload: { currentPassword, newPassword },
      });
    }

    it('refuses a wrong current password without signing anyone out', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email);

      const response = await change(laptop, 'not my password', 'a brand new passphrase');
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });
      expect((await me(laptop)).statusCode).toBe(200);
    });

    it('refuses the same password and one below the policy', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email);

      const same = await change(laptop, PASSWORD, PASSWORD);
      expect(same.json()).toMatchObject({ code: 'PASSWORD_UNCHANGED' });
      expect((await change(laptop, PASSWORD, 'short')).statusCode).toBe(400);
    });

    it('changes it, ends every session and hands back a fresh one', async () => {
      const { user } = await harness.actingAs();
      const laptop = await signedIn(user.email);
      const phone = await signedIn(user.email, 'Safari');

      const response = await change(laptop, PASSWORD, 'a brand new passphrase');
      expect(response.statusCode).toBe(200);
      const fresh = response.json<Tokens>();

      expect((await me(laptop)).statusCode).toBe(401);
      expect((await me(phone)).statusCode).toBe(401);
      expect((await me(fresh)).statusCode).toBe(200);
      expect(await sessions(fresh)).toHaveLength(1);

      expect((await signIn(user.email)).statusCode).toBe(401);
      expect((await signIn(user.email, 'Firefox', 'a brand new passphrase')).statusCode).toBe(
        200,
      );
    });
  });

  describe('two-factor authentication', () => {
    async function post(tokens: Tokens, path: string, payload: Record<string, unknown>) {
      return harness.inject({
        method: 'POST',
        url: `/api/v1/users/me/two-factor${path}`,
        headers: bearer(tokens),
        payload,
      });
    }

    async function status(tokens: Tokens) {
      const response = await harness.inject({
        method: 'GET',
        url: '/api/v1/users/me/two-factor',
        headers: bearer(tokens),
      });

      return response.json<{ enabled: boolean; recoveryCodesRemaining: number }>();
    }

    async function enrolled() {
      const { user } = await harness.actingAs();
      const tokens = await signedIn(user.email);
      const setup = await post(tokens, '/setup', { currentPassword: PASSWORD });
      const { secret } = setup.json<{ secret: string }>();
      const step = stepAt(new Date());
      const enabled = await post(tokens, '/enable', { code: totpCode(secret, step) });
      const { recoveryCodes } = enabled.json<{ recoveryCodes: string[] }>();

      return { user, tokens, secret, step, recoveryCodes };
    }

    async function challenge(email: string): Promise<string> {
      const response = await signIn(email);
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'TWO_FACTOR_REQUIRED' });

      return response.json<{ details: { challengeToken: string } }>().details.challengeToken;
    }

    async function finish(challengeToken: string, code: string) {
      return harness.inject({
        method: 'POST',
        url: '/api/v1/auth/login/two-factor',
        headers: { 'user-agent': 'Firefox' },
        payload: { challengeToken, code },
      });
    }

    it('starts off', async () => {
      const { user } = await harness.actingAs();
      const tokens = await signedIn(user.email);

      expect(await status(tokens)).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });
    });

    it('asks for the password before pairing an authenticator', async () => {
      const { user } = await harness.actingAs();
      const tokens = await signedIn(user.email);

      const refused = await post(tokens, '/setup', { currentPassword: 'wrong' });
      expect(refused.json()).toMatchObject({ code: 'CURRENT_PASSWORD_INCORRECT' });

      const setup = await post(tokens, '/setup', { currentPassword: PASSWORD });
      expect(setup.statusCode).toBe(200);
      expect(setup.json()).toMatchObject({
        secret: expect.stringMatching(/^[A-Z2-7]{32}$/) as unknown,
        otpauthUri: expect.stringMatching(/^otpauth:\/\/totp\//) as unknown,
        qrCodeDataUrl: expect.stringMatching(/^data:image\/svg\+xml;base64,/) as unknown,
      });
      expect(await status(tokens)).toMatchObject({ enabled: false });
    });

    it('turns on only with a correct code, and returns ten recovery codes', async () => {
      const { user } = await harness.actingAs();
      const tokens = await signedIn(user.email);

      const early = await post(tokens, '/enable', { code: '123456' });
      expect(early.json()).toMatchObject({ code: 'TWO_FACTOR_SETUP_NOT_STARTED' });

      const { secret } = (await post(tokens, '/setup', { currentPassword: PASSWORD })).json<{
        secret: string;
      }>();
      const wrong = await post(tokens, '/enable', {
        code: totpCode(secret, stepAt(new Date()) - 5),
      });
      expect(wrong.json()).toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });

      const enabled = await post(tokens, '/enable', {
        code: totpCode(secret, stepAt(new Date())),
      });
      expect(enabled.statusCode).toBe(200);
      expect(enabled.json<{ recoveryCodes: string[] }>().recoveryCodes).toHaveLength(10);
      expect(await status(tokens)).toMatchObject({ enabled: true, recoveryCodesRemaining: 10 });

      const again = await post(tokens, '/setup', { currentPassword: PASSWORD });
      expect(again.json()).toMatchObject({ code: 'TWO_FACTOR_ALREADY_ENABLED' });
    });

    it('holds sign-in at a challenge until a fresh authenticator code arrives', async () => {
      const { user, secret, step } = await enrolled();
      const challengeToken = await challenge(user.email);

      const replayed = await finish(challengeToken, totpCode(secret, step));
      expect(replayed.json()).toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });

      const accepted = await finish(challengeToken, totpCode(secret, step + 1));
      expect(accepted.statusCode).toBe(200);
      expect((await me(accepted.json<Tokens>())).statusCode).toBe(200);

      const reused = await finish(challengeToken, totpCode(secret, step + 1));
      expect(reused.json()).toMatchObject({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' });
    });

    it('accepts each recovery code exactly once', async () => {
      const { user, tokens, recoveryCodes } = await enrolled();
      const code = recoveryCodes[0]!;

      const first = await finish(await challenge(user.email), code.toUpperCase());
      expect(first.statusCode).toBe(200);

      const second = await finish(await challenge(user.email), code);
      expect(second.json()).toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });
      expect(await status(tokens)).toMatchObject({ recoveryCodesRemaining: 9 });
    });

    it('closes a challenge after five wrong codes', async () => {
      const { user, secret, step } = await enrolled();
      const challengeToken = await challenge(user.email);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await finish(challengeToken, '000000')).json()).toMatchObject({
          code: 'TWO_FACTOR_CODE_INVALID',
        });
      }

      const late = await finish(challengeToken, totpCode(secret, step + 1));
      expect(late.json()).toMatchObject({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' });
    });

    it('refuses an invented challenge', async () => {
      const response = await finish('not-a-challenge', '123456');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'TWO_FACTOR_CHALLENGE_EXPIRED' });
    });

    it('replaces the recovery codes, and the old ones stop working', async () => {
      const { user, tokens, recoveryCodes } = await enrolled();

      const regenerated = await post(tokens, '/recovery-codes', { currentPassword: PASSWORD });
      expect(regenerated.statusCode).toBe(200);
      const fresh = regenerated.json<{ recoveryCodes: string[] }>().recoveryCodes;
      expect(fresh).toHaveLength(10);

      const stale = await finish(await challenge(user.email), recoveryCodes[0]!);
      expect(stale.json()).toMatchObject({ code: 'TWO_FACTOR_CODE_INVALID' });
      expect((await finish(await challenge(user.email), fresh[0]!)).statusCode).toBe(200);
    });

    it('turns off with the password, and sign-in goes back to one step', async () => {
      const { user, tokens } = await enrolled();

      const refused = await post(tokens, '/disable', { currentPassword: 'wrong' });
      expect(refused.statusCode).toBe(400);

      const disabled = await post(tokens, '/disable', { currentPassword: PASSWORD });
      expect(disabled.statusCode).toBe(204);
      expect(await status(tokens)).toMatchObject({ enabled: false, recoveryCodesRemaining: 0 });
      expect((await signIn(user.email)).statusCode).toBe(200);
    });

    it('does not ask a wrong password for a second factor', async () => {
      const { user } = await enrolled();

      const response = await signIn(user.email, 'Firefox', 'wrong password');
      expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    });
  });
});
