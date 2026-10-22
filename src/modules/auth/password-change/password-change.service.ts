import { Injectable } from '@nestjs/common';

import { PasswordService } from '../../../common/crypto/password.service';
import { InvalidInputError } from '../../../common/errors/domain.error';
import { TransactionHost } from '../../../database/transaction.host';
import { UsersRepository } from '../../users/users.repository';
import { AuthTokensDto } from '../dto/auth-tokens.dto';
import { PasswordConfirmation } from '../password-confirmation.service';
import { RefreshTokensRepository } from '../refresh-tokens.repository';
import { SessionIssuer, type SessionContext } from '../sessions/session-issuer.service';

import type { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly confirmation: PasswordConfirmation,
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionIssuer,
    private readonly txHost: TransactionHost,
  ) {}

  /** Ends every session, this one included, and hands the caller a fresh one. */
  async change(
    userId: string,
    dto: ChangePasswordDto,
    context: SessionContext,
  ): Promise<AuthTokensDto> {
    await this.confirmation.confirm(userId, dto.currentPassword);

    if (dto.newPassword === dto.currentPassword) {
      throw new InvalidInputError(
        'PASSWORD_UNCHANGED',
        'The new password must differ from the current one',
        { field: 'newPassword' },
      );
    }

    return this.txHost.run(async (tx) => {
      await this.users.update(
        userId,
        { passwordHash: await this.passwords.hash(dto.newPassword) },
        tx,
      );
      await this.refreshTokens.revokeAllForUser(userId, tx);
      await this.users.incrementTokenVersion(userId, tx);

      const user = await this.users.findByIdOrFail(userId, { consistent: true }, tx);

      return this.sessions.start(user, context, tx);
    });
  }
}
