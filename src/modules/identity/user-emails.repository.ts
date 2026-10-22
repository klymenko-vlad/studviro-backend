import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { BaseRepository } from '../../database/repository/base.repository';
import { userEmails, type UserEmail } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class UserEmailsRepository extends BaseRepository<typeof userEmails> {
  protected override readonly sortable = {
    createdAt: userEmails.createdAt,
    address: userEmails.address,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, userEmails);
  }

  findForUser(
    userId: string,
    address: string,
    tx?: Transaction,
  ): Promise<UserEmail | undefined> {
    return this.findOne(
      sql`${userEmails.userId} = ${userId} and ${userEmails.address} = ${address}`,
      { consistent: true },
      tx,
    );
  }

  async recordAsserted(
    userId: string,
    address: string,
    institutionId: string,
    tx?: Transaction,
  ): Promise<void> {
    if (await this.findForUser(userId, address, tx)) return;

    await this.create({ userId, address, institutionId }, tx);
  }

  async markVerified(
    userId: string,
    address: string,
    institutionId: string | null,
    tx?: Transaction,
  ): Promise<void> {
    const existing = await this.findForUser(userId, address, tx);
    const verifiedAt = new Date();

    if (existing) {
      if (existing.verifiedAt) return;

      await this.update(existing.id, { verifiedAt }, tx);

      return;
    }

    await this.create({ userId, address, institutionId, verifiedAt }, tx);
  }
}
