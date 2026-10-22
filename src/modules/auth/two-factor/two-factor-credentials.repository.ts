import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import type { Transaction } from '../../../database/database.tokens';
import { BaseRepository } from '../../../database/repository/base.repository';
import { twoFactorCredentials, type TwoFactorCredential } from '../../../database/schema';
import { TransactionHost } from '../../../database/transaction.host';

@Injectable()
export class TwoFactorCredentialsRepository extends BaseRepository<
  typeof twoFactorCredentials
> {
  constructor(txHost: TransactionHost) {
    super(txHost, twoFactorCredentials);
  }

  findFor(userId: string, tx?: Transaction): Promise<TwoFactorCredential | undefined> {
    return this.findOne(eq(twoFactorCredentials.userId, userId), { consistent: true }, tx);
  }

  isEnabledFor(userId: string): Promise<boolean> {
    return this.exists(this.enabled(userId), { consistent: true });
  }

  findEnabledFor(userId: string, tx?: Transaction): Promise<TwoFactorCredential | undefined> {
    return this.findOne(this.enabled(userId), { consistent: true }, tx);
  }

  /** False when the step is not newer than the last accepted one: the code was replayed. */
  async claimStep(id: string, step: number, tx?: Transaction): Promise<boolean> {
    const claimed = await this.updateMany(
      and(
        eq(twoFactorCredentials.id, id),
        or(
          isNull(twoFactorCredentials.lastUsedStep),
          lt(twoFactorCredentials.lastUsedStep, step),
        ),
      ) ?? sql`false`,
      { lastUsedStep: step },
      {},
      tx,
    );

    return claimed.length > 0;
  }

  removeFor(userId: string, tx?: Transaction): Promise<number> {
    return this.hardDeleteMany(eq(twoFactorCredentials.userId, userId), tx);
  }

  private enabled(userId: string) {
    return (
      and(eq(twoFactorCredentials.userId, userId), isNotNull(twoFactorCredentials.enabledAt)) ??
      sql`false`
    );
  }
}
