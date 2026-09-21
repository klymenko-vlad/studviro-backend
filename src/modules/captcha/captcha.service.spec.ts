import type Redis from 'ioredis';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service';

import { sha256Hex, signHex } from './captcha.protocol';
import { CaptchaService } from './captcha.service';

const SECRET = 'a-captcha-secret-of-at-least-32-chars';
const NOW = new Date('2026-09-21T12:00:00.000Z');

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

describe(CaptchaService.name, () => {
  const set = vi.fn();
  const redis = { set } as unknown as Redis;

  const build = (overrides: Record<string, unknown> = {}) =>
    new CaptchaService(
      {
        captcha: {
          enabled: true,
          secret: SECRET,
          maxNumber: 1_000,
          ttlSeconds: 600,
          ...overrides,
        },
      } as unknown as AppConfigService,
      redis,
    );

  /** Solves a challenge the way the browser does: search until the hash matches. */
  const solve = (service: CaptchaService) => {
    const challenge = service.issue(NOW);

    for (let number = 0; number <= challenge.maxnumber; number += 1) {
      if (sha256Hex(challenge.salt + String(number)) === challenge.challenge) {
        return {
          algorithm: 'SHA-256',
          challenge: challenge.challenge,
          salt: challenge.salt,
          number,
          signature: challenge.signature,
        };
      }
    }

    throw new Error('the issued challenge had no answer inside maxnumber');
  };

  let service: CaptchaService;

  beforeEach(() => {
    vi.clearAllMocks();
    set.mockResolvedValue('OK');
    service = build();
  });

  describe('issuing', () => {
    it('signs the challenge it minted, so it need not remember it', () => {
      const challenge = service.issue(NOW);

      expect(challenge.signature).toBe(signHex(SECRET, challenge.challenge));
    });

    it('puts the expiry in the salt', () => {
      expect(service.issue(NOW).salt).toContain(
        `?expires=${Math.floor(NOW.getTime() / 1000) + 600}`,
      );
    });

    it('never mints the same challenge twice', () => {
      const first = service.issue(NOW);
      const second = service.issue(NOW);

      expect(first.challenge).not.toBe(second.challenge);
      expect(first.salt).not.toBe(second.salt);
    });

    it('has an answer inside the search space it advertises', () => {
      expect(() => solve(service)).not.toThrow();
    });
  });

  describe('verifying', () => {
    it('accepts a correctly solved challenge', async () => {
      await expect(service.verify(encode(solve(service)), NOW)).resolves.toEqual({ ok: true });
    });

    it('refuses a body with no captcha at all', async () => {
      await expect(service.verify(undefined, NOW)).resolves.toEqual({
        ok: false,
        reason: 'missing',
      });
      await expect(service.verify('', NOW)).resolves.toEqual({
        ok: false,
        reason: 'missing',
      });
    });

    it('refuses something that is not a payload', async () => {
      await expect(service.verify('nonsense', NOW)).resolves.toEqual({
        ok: false,
        reason: 'malformed',
      });
    });

    it('refuses an algorithm it did not offer', async () => {
      const payload = { ...solve(service), algorithm: 'MD5' };

      await expect(service.verify(encode(payload), NOW)).resolves.toEqual({
        ok: false,
        reason: 'wrong_algorithm',
      });
    });

    it('refuses a challenge whose moment has passed', async () => {
      const payload = solve(service);
      const later = new Date(NOW.getTime() + 601_000);

      await expect(service.verify(encode(payload), later)).resolves.toEqual({
        ok: false,
        reason: 'expired',
      });
    });

    it('refuses a challenge this server never signed', async () => {
      const forged = {
        ...solve(service),
        signature: signHex('another-secret-32-chars-long!!', 'x'),
      };

      await expect(service.verify(encode(forged), NOW)).resolves.toEqual({
        ok: false,
        reason: 'bad_signature',
      });
    });

    it('refuses a challenge minted with a salt the caller chose', async () => {
      const salt = `attacker?expires=${Math.floor(NOW.getTime() / 1000) + 600}`;
      const challenge = sha256Hex(`${salt}1`);
      const forged = {
        algorithm: 'SHA-256',
        challenge,
        salt,
        number: 1,
        signature: signHex('not-the-servers-secret-32-chars!!', challenge),
      };

      await expect(service.verify(encode(forged), NOW)).resolves.toEqual({
        ok: false,
        reason: 'bad_signature',
      });
    });

    it('refuses the wrong answer to a genuine challenge', async () => {
      const solved = solve(service);
      const wrong = { ...solved, number: solved.number + 1 };

      await expect(service.verify(encode(wrong), NOW)).resolves.toEqual({
        ok: false,
        reason: 'wrong_answer',
      });
    });

    it('refuses a solution that has already been spent', async () => {
      set.mockResolvedValue(null);

      await expect(service.verify(encode(solve(service)), NOW)).resolves.toEqual({
        ok: false,
        reason: 'already_used',
      });
    });

    it('claims the solution for exactly as long as the challenge lives', async () => {
      const payload = solve(service);

      await service.verify(encode(payload), NOW);

      expect(set).toHaveBeenCalledWith(
        `captcha:used:${payload.challenge}`,
        '1',
        'EX',
        600,
        'NX',
      );
    });

    it('never claims a solution it already refused', async () => {
      await service.verify('nonsense', NOW);

      expect(set).not.toHaveBeenCalled();
    });
  });

  describe('when the deployment has it switched off', () => {
    beforeEach(() => {
      service = build({ enabled: false });
    });

    it('accepts a request that carries no captcha', async () => {
      await expect(service.verify(undefined, NOW)).resolves.toEqual({ ok: true });
    });

    it('accepts nonsense rather than pretending to check it', async () => {
      await expect(service.verify('nonsense', NOW)).resolves.toEqual({ ok: true });
      expect(set).not.toHaveBeenCalled();
    });

    it('reports itself as off, so the form shows no verification step', () => {
      expect(service.enabled).toBe(false);
    });
  });
});
