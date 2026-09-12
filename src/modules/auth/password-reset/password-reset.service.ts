import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../../common/crypto/password.service';
import { InvalidInputError } from '../../../common/errors/domain.error';
import { AppConfigService } from '../../../config/app-config.service';
import { TransactionHost } from '../../../database/transaction.host';
import { UsersRepository } from '../../users/users.repository';
import { RefreshTokensRepository } from '../refresh-tokens.repository';
import { TokenService } from '../token.service';

import { PasswordResetTokensRepository } from './password-reset-tokens.repository';

const RESET_TTL_MS = 60 * 60 * 1000;

function invalidToken(): InvalidInputError {
  return new InvalidInputError(
    'PASSWORD_RESET_TOKEN_INVALID',
    'This password reset link is no longer valid',
  );
}

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly users: UsersRepository,
    private readonly resetTokens: PasswordResetTokensRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly txHost: TransactionHost,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Always succeeds from the caller's point of view, whether or not the
   * address belongs to an active account — the same shape demo-requests uses,
   * for the same reason: distinguishing the two turns the endpoint into an
   * address-enumeration oracle.
   */
  async request(email: string): Promise<{ devToken?: string }> {
    const user = await this.users.findSignInCandidate(email, { consistent: true });
    if (!user) return {};

    const token = randomBytes(32).toString('hex');
    await this.resetTokens.create({
      userId: user.id,
      tokenHash: this.tokens.hash(token),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });

    return this.config.isProduction ? {} : { devToken: token };
  }

  async confirm(rawToken: string, password: string): Promise<void> {
    const tokenHash = this.tokens.hash(rawToken);

    await this.txHost.run(async (tx) => {
      const stored = await this.resetTokens.findByTokenHash(tokenHash, {}, tx);

      if (!stored || stored.consumedAt || stored.expiresAt.getTime() <= Date.now()) {
        throw invalidToken();
      }

      await this.users.update(
        stored.userId,
        { passwordHash: await this.passwords.hash(password) },
        tx,
      );
      await this.resetTokens.update(stored.id, { consumedAt: new Date() }, tx);
      await this.refreshTokens.revokeAllForUser(stored.userId, tx);
      await this.users.incrementTokenVersion(stored.userId, tx);
    });
  }
}
