import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Transaction } from '../../../database/database.tokens';
import { BaseRepository } from '../../../database/repository/base.repository';
import type { FindOneOptions } from '../../../database/repository/repository.types';
import { passwordResetTokens, type PasswordResetToken } from '../../../database/schema';
import { TransactionHost } from '../../../database/transaction.host';

@Injectable()
export class PasswordResetTokensRepository extends BaseRepository<typeof passwordResetTokens> {
  protected override readonly sortable = {
    createdAt: passwordResetTokens.createdAt,
    expiresAt: passwordResetTokens.expiresAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, passwordResetTokens);
  }

  findByTokenHash(
    tokenHash: string,
    options: FindOneOptions = {},
    tx?: Transaction,
  ): Promise<PasswordResetToken | undefined> {
    return this.findOne(
      eq(passwordResetTokens.tokenHash, tokenHash),
      { consistent: true, ...options },
      tx,
    );
  }
}
