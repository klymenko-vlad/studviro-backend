import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { UnauthenticatedError } from '../../../common/errors/domain.error';
import { REDIS_CLIENT } from '../../../common/redis/redis.tokens';

const CHALLENGE_TTL_S = 300;
export const MAX_CHALLENGE_ATTEMPTS = 5;

export function challengeExpired(): UnauthenticatedError {
  return new UnauthenticatedError(
    'TWO_FACTOR_CHALLENGE_EXPIRED',
    'This sign-in attempt has expired. Sign in again.',
  );
}

@Injectable()
export class TwoFactorChallenges {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async open(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const key = keyOf(token);

    await this.redis
      .multi()
      .hset(key, { userId, attempts: 0 })
      .expire(key, CHALLENGE_TTL_S)
      .exec();

    return token;
  }

  async attempt(token: string): Promise<string> {
    const key = keyOf(token);
    const userId = await this.redis.hget(key, 'userId');
    if (!userId) throw challengeExpired();

    const attempts = await this.redis.hincrby(key, 'attempts', 1);
    if (attempts > MAX_CHALLENGE_ATTEMPTS) {
      await this.redis.del(key);
      throw challengeExpired();
    }

    return userId;
  }

  /** False when a concurrent request already closed it, so one challenge yields one session. */
  async close(token: string): Promise<boolean> {
    return (await this.redis.del(keyOf(token))) === 1;
  }
}

function keyOf(token: string): string {
  return `auth:two-factor-challenge:${createHash('sha256').update(token).digest('hex')}`;
}
