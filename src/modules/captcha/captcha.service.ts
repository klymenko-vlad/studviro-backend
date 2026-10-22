import { randomBytes, randomInt } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { REDIS_CLIENT } from '../../common/redis/redis.tokens';
import { AppConfigService } from '../../config/app-config.service';

import {
  decodeSolution,
  expiryOf,
  saltWith,
  sha256Hex,
  signatureMatches,
  signHex,
} from './captcha.protocol';
import type { CaptchaChallenge, CaptchaRefusal } from './captcha.types';

const SALT_BYTES = 12;
const USED_KEY_PREFIX = 'captcha:used:';

export type CaptchaVerdict = { ok: true } | { ok: false; reason: CaptchaRefusal };

const ACCEPTED: CaptchaVerdict = { ok: true };
const refused = (reason: CaptchaRefusal): CaptchaVerdict => ({ ok: false, reason });

/**
 * A proof-of-work captcha, verified without storing an issued challenge: the
 * salt carries its own expiry and the signature proves this server minted it.
 *
 * The one thing that does need memory is single use — without it a caller
 * solves once and replays that payload for every sign-up attempt, which is the
 * whole attack the captcha exists to price. The mark lives in Redis under the
 * challenge's own TTL, so it expires exactly when the challenge does.
 */
@Injectable()
export class CaptchaService {
  constructor(
    private readonly config: AppConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  get enabled(): boolean {
    return this.config.captcha.enabled;
  }

  issue(now = new Date()): CaptchaChallenge {
    const { secret, maxNumber, ttlSeconds } = this.config.captcha;

    const salt = saltWith(
      randomBytes(SALT_BYTES).toString('hex'),
      new Date(now.getTime() + ttlSeconds * 1000),
    );
    const challenge = sha256Hex(salt + String(randomInt(0, maxNumber + 1)));

    return {
      algorithm: 'SHA-256',
      challenge,
      salt,
      maxnumber: maxNumber,
      signature: signHex(secret, challenge),
    };
  }

  async verify(payload: string | undefined, now = new Date()): Promise<CaptchaVerdict> {
    if (!this.enabled) return ACCEPTED;
    if (payload === undefined || payload === '') return refused('missing');

    const solution = decodeSolution(payload);
    if (solution === null) return refused('malformed');
    if (solution.algorithm !== 'SHA-256') return refused('wrong_algorithm');

    const expiresAt = expiryOf(solution.salt);
    if (expiresAt === null || expiresAt <= now) return refused('expired');

    if (
      !signatureMatches(
        signHex(this.config.captcha.secret, solution.challenge),
        solution.signature,
      )
    ) {
      return refused('bad_signature');
    }

    // Checked after the signature: an unsigned payload is a forgery, and
    // hashing an attacker's arbitrary salt before proving that is work the
    // attacker chose for us.
    if (sha256Hex(solution.salt + String(solution.number)) !== solution.challenge) {
      return refused('wrong_answer');
    }

    return (await this.claim(solution.challenge, expiresAt, now))
      ? ACCEPTED
      : refused('already_used');
  }

  /** `SET NX` is the claim: the first caller to present a solution spends it. */
  private async claim(challenge: string, expiresAt: Date, now: Date): Promise<boolean> {
    const ttl = Math.max(Math.ceil((expiresAt.getTime() - now.getTime()) / 1000), 1);
    const claimed = await this.redis.set(
      `${USED_KEY_PREFIX}${challenge}`,
      '1',
      'EX',
      ttl,
      'NX',
    );

    return claimed === 'OK';
  }
}
