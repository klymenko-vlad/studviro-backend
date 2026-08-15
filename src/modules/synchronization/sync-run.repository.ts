import { Injectable } from '@nestjs/common';

import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import { syncRuns, type SyncRun } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class SyncRunRepository extends InstitutionScopedRepository<typeof syncRuns> {
  protected override readonly sortable = {
    queuedAt: syncRuns.queuedAt,
    createdAt: syncRuns.createdAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, syncRuns);
  }

  findRecent(institutionId: string, limit: number): Promise<SyncRun[]> {
    return this.findManyIn(institutionId, {
      orderBy: syncRuns.queuedAt,
      order: 'desc',
      limit,
      consistent: true,
    });
  }
}
