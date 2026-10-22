// Must stay the first import: it enables the captcha this suite asserts on, and
// `config.module.ts` validates the environment as soon as it is imported.
import './captcha.env';

import { createHash } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../setup/app-harness';

interface Challenge {
  algorithm: string;
  challenge: string;
  salt: string;
  maxnumber: number;
  signature: string;
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * The four forms a stranger can reach. Asserted end to end because the whole
 * point is the wiring: a guard that is written but not applied type-checks,
 * passes its own unit tests, and protects nothing.
 */
describe('Captcha on the public forms (e2e)', () => {
  let harness: TestHarness;

  const takeChallenge = async (): Promise<Challenge> => {
    const response = await harness.inject({
      method: 'POST',
      url: '/api/v1/captcha/challenge',
    });
    expect(response.statusCode).toBe(200);

    return response.json<Challenge>();
  };

  /** Solves it the way a browser does: hash until the answer turns up. */
  const solve = (challenge: Challenge): string => {
    for (let number = 0; number <= challenge.maxnumber; number += 1) {
      if (sha256(challenge.salt + String(number)) === challenge.challenge) {
        return Buffer.from(
          JSON.stringify({
            algorithm: challenge.algorithm,
            challenge: challenge.challenge,
            salt: challenge.salt,
            number,
            signature: challenge.signature,
          }),
        ).toString('base64');
      }
    }

    throw new Error('no answer inside the advertised search space');
  };

  const solved = async () => solve(await takeChallenge());

  const register = (captcha?: string, email = `ada-${Math.random()}@example.com`) =>
    harness.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        displayName: 'Ada Lovelace',
        password: 'correct horse battery staple',
        ...(captcha === undefined ? {} : { captcha }),
      },
    });

  const demoRequest = (captcha?: string) =>
    harness.inject({
      method: 'POST',
      url: '/api/v1/demo-requests',
      payload: {
        institutionName: 'Comenius University',
        contactName: 'Ada Lovelace',
        email: `lead-${Math.random()}@university.edu`,
        role: 'Vice-dean',
        ...(captcha === undefined ? {} : { captcha }),
      },
    });

  const resetRequest = (captcha?: string) =>
    harness.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: {
        email: 'nobody@example.com',
        ...(captcha === undefined ? {} : { captcha }),
      },
    });

  beforeAll(async () => {
    harness = await createTestHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('tells a client that this deployment asks for one', async () => {
    const response = await harness.inject({ method: 'GET', url: '/api/v1/captcha' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ enabled: true });
  });

  it('hands out a signed challenge with an answer inside it', async () => {
    const challenge = await takeChallenge();

    expect(challenge.algorithm).toBe('SHA-256');
    expect(challenge.maxnumber).toBeGreaterThan(0);
    expect(() => solve(challenge)).not.toThrow();
  });

  it('never hands the same challenge to two callers', async () => {
    const [first, second] = await Promise.all([takeChallenge(), takeChallenge()]);

    expect(first.challenge).not.toBe(second.challenge);
  });

  describe('registering', () => {
    it('is refused without one', async () => {
      const response = await register();

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('CAPTCHA_FAILED');
    });

    it('is refused with a forged one', async () => {
      const response = await register('bm90LWEtcGF5bG9hZA==');

      expect(response.statusCode).toBe(403);
    });

    it('succeeds with a solved one', async () => {
      const response = await register(await solved());

      expect(response.statusCode).toBe(201);
    });

    it('will not take the same solution twice', async () => {
      const captcha = await solved();

      expect((await register(captcha)).statusCode).toBe(201);

      const replayed = await register(captcha);
      expect(replayed.statusCode).toBe(403);
      expect(replayed.json().message).toMatch(/already been used/);
    });
  });

  describe('signing in', () => {
    it('is refused without one, before the password is even looked at', async () => {
      const response = await harness.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nobody@example.com', password: 'whatever' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('CAPTCHA_FAILED');
    });
  });

  describe('the password-reset request', () => {
    it('is refused without one', async () => {
      expect((await resetRequest()).statusCode).toBe(403);
    });

    it('answers normally with one, and still says nothing about the address', async () => {
      const response = await resetRequest(await solved());

      expect(response.statusCode).toBe(200);
    });
  });

  describe('the demo request', () => {
    it('is refused without one', async () => {
      expect((await demoRequest()).statusCode).toBe(403);
    });

    it('is accepted with one', async () => {
      expect((await demoRequest(await solved())).statusCode).toBe(202);
    });
  });

  it('leaves a signed-in caller alone — the captcha is for strangers', async () => {
    const actor = await harness.actingAs({ email: 'member@example.com' });

    const response = await harness.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: actor.headers,
    });

    expect(response.statusCode).toBe(200);
  });
});
