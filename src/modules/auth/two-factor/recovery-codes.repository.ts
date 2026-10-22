import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Transaction } from '../../../database/database.tokens';
import { BaseRepository } from '../../../database/repository/base.repository';
import { twoFactorRecoveryCodes } from '../../../database/schema';
import { TransactionHost } from '../../../database/transaction.host';

@Injectable()
export class RecoveryCodesRepository extends BaseRepository<typeof twoFactorRecoveryCodes> {
  constructor(txHost: TransactionHost) {
    super(txHost, twoFactorRecoveryCodes);
  }

  async replaceFor(userId: string, codeHashes: string[], tx?: Transaction): Promise<void> {
    await this.removeFor(userId, tx);
    await this.createMany(
      codeHashes.map((codeHash) => ({ userId, codeHash })),
      tx,
    );
  }

  async consume(userId: string, codeHash: string, tx?: Transaction): Promise<boolean> {
    const used = await this.updateMany(
      and(
        eq(twoFactorRecoveryCodes.userId, userId),
        eq(twoFactorRecoveryCodes.codeHash, codeHash),
        isNull(twoFactorRecoveryCodes.usedAt),
      ) ?? sql`false`,
      { usedAt: new Date() },
      {},
      tx,
    );

    return used.length > 0;
  }

  countUnused(userId: string): Promise<number> {
    return this.count(
      and(eq(twoFactorRecoveryCodes.userId, userId), isNull(twoFactorRecoveryCodes.usedAt)),
      { consistent: true },
    );
  }

  removeFor(userId: string, tx?: Transaction): Promise<number> {
    return this.hardDeleteMany(eq(twoFactorRecoveryCodes.userId, userId), tx);
  }
}
