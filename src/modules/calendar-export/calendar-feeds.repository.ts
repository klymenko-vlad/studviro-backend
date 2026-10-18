import { Injectable } from '@nestjs/common';
import { and, eq, sql, type SQL } from 'drizzle-orm';

import type { Transaction } from '../../database/database.tokens';
import { BaseRepository } from '../../database/repository/base.repository';
import { calendarFeeds, type CalendarFeed } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class CalendarFeedsRepository extends BaseRepository<typeof calendarFeeds> {
  constructor(txHost: TransactionHost) {
    super(txHost, calendarFeeds);
  }

  findByTokenHash(tokenHash: string): Promise<CalendarFeed | undefined> {
    return this.findOne(eq(calendarFeeds.tokenHash, tokenHash), { consistent: true });
  }

  findForOwner(institutionId: string, userId: string): Promise<CalendarFeed | undefined> {
    return this.findOne(this.owner(institutionId, userId), { consistent: true });
  }

  removeForOwner(institutionId: string, userId: string, tx?: Transaction): Promise<number> {
    return this.hardDeleteMany(this.owner(institutionId, userId), tx);
  }

  private owner(institutionId: string, userId: string): SQL {
    return (
      and(eq(calendarFeeds.institutionId, institutionId), eq(calendarFeeds.userId, userId)) ??
      sql`false`
    );
  }
}
