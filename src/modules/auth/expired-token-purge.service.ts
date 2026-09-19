import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';

import { PasswordResetTokensRepository } from './password-reset/password-reset-tokens.repository';
import { RefreshTokensRepository } from './refresh-tokens.repository';

export interface PurgeResult {
  readonly refreshTokens: number;
  readonly passwordResetTokens: number;
}

/**
 * Both token tables hard-delete, and until this ran nothing called either
 * sweep: `refresh_tokens` carries an IP address and a user agent per session,
 * so an account used for a year held a year of device-and-location history
 * that authenticates nobody.
 *
 * Expiry is the boundary, not a retention period, which is why this needs no
 * number from the institution. A revoked-but-unexpired refresh token is kept
 * deliberately — it is exactly what reuse detection has to still find when a
 * leaked token comes back.
 */
@Injectable()
export class ExpiredTokenPurgeService {
  private running = false;

  constructor(
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly passwordResetTokens: PasswordResetTokensRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ExpiredTokenPurgeService.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purge(before = new Date()): Promise<PurgeResult> {
    if (this.running) return { refreshTokens: 0, passwordResetTokens: 0 };

    this.running = true;

    try {
      const result = {
        refreshTokens: await this.refreshTokens.purgeExpired(before),
        passwordResetTokens: await this.passwordResetTokens.purgeExpired(before),
      };

      if (result.refreshTokens > 0 || result.passwordResetTokens > 0) {
        this.logger.info(result, 'expired tokens purged');
      }

      return result;
    } catch (error) {
      this.logger.warn({ err: error }, 'expired token purge failed');

      return { refreshTokens: 0, passwordResetTokens: 0 };
    } finally {
      this.running = false;
    }
  }
}
