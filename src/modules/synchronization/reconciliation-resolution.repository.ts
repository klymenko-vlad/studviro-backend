import { Injectable } from '@nestjs/common';

import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import {
  reconciliationResolutions,
  type ReconciliationResolution,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class ReconciliationResolutionRepository extends InstitutionScopedRepository<
  typeof reconciliationResolutions
> {
  protected override readonly sortable = {
    resolvedAt: reconciliationResolutions.resolvedAt,
    createdAt: reconciliationResolutions.createdAt,
  };

  constructor(txHost: TransactionHost) {
    super(txHost, reconciliationResolutions);
  }

  findRecent(institutionId: string, limit: number): Promise<ReconciliationResolution[]> {
    return this.findManyIn(institutionId, {
      orderBy: reconciliationResolutions.resolvedAt,
      order: 'desc',
      limit,
      consistent: true,
    });
  }
}
