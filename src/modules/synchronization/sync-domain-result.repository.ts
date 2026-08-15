import { Injectable } from '@nestjs/common';
import { eq, isNull } from 'drizzle-orm';

import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import {
  syncDomainResults,
  type NewSyncDomainResult,
  type SyncDomainResult,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class SyncDomainResultRepository extends InstitutionScopedRepository<
  typeof syncDomainResults
> {
  constructor(txHost: TransactionHost) {
    super(txHost, syncDomainResults);
  }

  async record(values: NewSyncDomainResult): Promise<void> {
    await this.upsert(values, {
      target: [syncDomainResults.runId, syncDomainResults.domain],
      targetWhere: isNull(syncDomainResults.deletedAt),
    });
  }

  findForRun(runId: string): Promise<SyncDomainResult[]> {
    return this.findMany({
      where: eq(syncDomainResults.runId, runId),
      orderBy: syncDomainResults.createdAt,
      order: 'asc',
      consistent: true,
    });
  }
}
