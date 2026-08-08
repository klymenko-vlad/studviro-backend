import { Injectable } from '@nestjs/common';
import { argon2id, hash, needsRehash, verify, type HashOptions } from 'argon2';

/**
 * Argon2id, not scrypt. The encoded digest carries its own parameters, so the
 * cost can be raised later without invalidating existing credentials —
 * `needsRehash` reports which stored digests fall below the current policy so
 * they can be upgraded on the next successful sign-in.
 *
 * Values follow the OWASP baseline: 19 MiB, 2 iterations, 1 lane.
 */
const POLICY = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} satisfies HashOptions;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain, POLICY);
  }

  async verify(digest: string, plain: string): Promise<boolean> {
    try {
      return await verify(digest, plain);
    } catch {
      // A malformed or truncated digest must read as "wrong password", never
      // as a 500 that tells an attacker the record exists but is corrupt.
      return false;
    }
  }

  needsRehash(digest: string): boolean {
    try {
      return needsRehash(digest, POLICY);
    } catch {
      return true;
    }
  }
}
