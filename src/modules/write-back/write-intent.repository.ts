import { Injectable } from '@nestjs/common';
import { and, eq, inArray, ne } from 'drizzle-orm';

import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import {
  LIVE_SOURCE_WRITE_INTENT_STATES,
  sourceWriteIntents,
  type SourceWriteIntent,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class WriteIntentRepository extends InstitutionScopedRepository<
  typeof sourceWriteIntents
> {
  protected override readonly sortable = {
    createdAt: sourceWriteIntents.createdAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, sourceWriteIntents);
  }

  findQueuedFor(
    institutionId: string,
    canonicalId: string,
  ): Promise<SourceWriteIntent | undefined> {
    return this.findOneIn(
      institutionId,
      and(
        eq(sourceWriteIntents.canonicalId, canonicalId),
        eq(sourceWriteIntents.state, 'pending'),
      ),
      { consistent: true },
    );
  }

  findLiveFor(
    institutionId: string,
    canonicalId: string,
  ): Promise<SourceWriteIntent | undefined> {
    return this.findOneIn(
      institutionId,
      and(
        eq(sourceWriteIntents.canonicalId, canonicalId),
        inArray(sourceWriteIntents.state, [...LIVE_SOURCE_WRITE_INTENT_STATES]),
      ),
      { consistent: true },
    );
  }

  /** Everything the source has not acknowledged, newest first. */
  findUndelivered(institutionId: string, limit: number): Promise<SourceWriteIntent[]> {
    return this.findManyIn(institutionId, {
      where: ne(sourceWriteIntents.state, 'acknowledged'),
      orderBy: sourceWriteIntents.createdAt,
      order: 'desc',
      limit,
      consistent: true,
    });
  }

  countUndelivered(institutionId: string): Promise<number> {
    return this.countIn(institutionId, ne(sourceWriteIntents.state, 'acknowledged'), {
      consistent: true,
    });
  }
}
