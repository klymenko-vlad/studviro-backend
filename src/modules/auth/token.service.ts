import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';

import { AppConfigService } from '../../config/app-config.service';
import type { User } from '../../database/schema';

import type { AccessTokenPayload, RefreshTokenPayload } from './auth.constants';

export interface IssuedToken {
  readonly token: string;
  readonly expiresAt: Date;
}

/**
 * Mints and verifies the two token types. They are signed with *different*
 * secrets (`env.schema.ts` refuses to boot production if they match), so a
 * stolen access token cannot be replayed as a refresh token — the whole point
 * of splitting a long-lived credential from a short-lived one.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async issueAccessToken(
    user: Pick<User, 'id' | 'email' | 'locale' | 'role' | 'tokenVersion'>,
    sessionId?: string,
  ): Promise<IssuedToken> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      locale: user.locale,
      role: user.role,
      tv: user.tokenVersion,
      ...(sessionId ? { sid: sessionId } : {}),
    };

    const token = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtl as JwtSignOptions['expiresIn'],
    });

    return { token, expiresAt: this.expiryOf(token) };
  }

  async issueRefreshToken(userId: string): Promise<IssuedToken> {
    const payload: RefreshTokenPayload = { sub: userId, jti: randomUUID() };

    const token = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: this.config.jwt.refreshTtl as JwtSignOptions['expiresIn'],
    });

    return { token, expiresAt: this.expiryOf(token) };
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload | undefined> {
    try {
      return await this.jwt.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      // Expired, tampered with, or signed by the access secret. All three are
      // "this is not a valid refresh token" and must be indistinguishable to
      // the caller.
      return undefined;
    }
  }

  /**
   * SHA-256 rather than argon2: the token is 256+ bits of signed, unguessable
   * data, so there is nothing to brute-force, and lookup has to be a single
   * indexed equality rather than a scan-and-compare over every stored row.
   */
  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Read back from the token rather than parsed from the `15m`-style TTL
   * string: `jsonwebtoken` owns that grammar, and a second implementation of it
   * would eventually disagree with the `exp` the client is actually bound by.
   */
  private expiryOf(token: string): Date {
    const { exp } = this.jwt.decode<{ exp: number }>(token);

    return new Date(exp * 1000);
  }
}
