import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { CalendarFeed } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { CalendarFeedsRepository } from './calendar-feeds.repository';

export interface CalendarFeedStatus {
  active: boolean;
  createdAt: Date | null;
}

export interface IssuedCalendarFeed {
  token: string;
  createdAt: Date;
}

const TOKEN_BYTES = 32;

/**
 * The secret behind a subscription URL (ADR 0038). Issued, replaced and
 * withdrawn by its owner; the plain token exists only in the answer that
 * issues it.
 */
@Injectable()
export class CalendarFeedService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly feeds: CalendarFeedsRepository,
  ) {}

  async status(institutionId: string, userId: string): Promise<CalendarFeedStatus> {
    const feed = await this.feeds.findForOwner(institutionId, userId);

    return { active: feed !== undefined, createdAt: feed?.createdAt ?? null };
  }

  issue(institutionId: string, userId: string): Promise<IssuedCalendarFeed> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');

    return this.txHost.run(async (tx) => {
      await this.feeds.removeForOwner(institutionId, userId, tx);
      const feed = await this.feeds.create(
        { institutionId, userId, tokenHash: hashFeedToken(token) },
        tx,
      );

      return { token, createdAt: feed.createdAt };
    });
  }

  async revoke(institutionId: string, userId: string): Promise<void> {
    await this.feeds.removeForOwner(institutionId, userId);
  }

  resolve(token: string): Promise<CalendarFeed | undefined> {
    return this.feeds.findByTokenHash(hashFeedToken(token));
  }
}

export function hashFeedToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
