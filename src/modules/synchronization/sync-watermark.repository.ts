import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { InstitutionScopedRepository } from '../../database/repository/institution-scoped.repository';
import {
  syncWatermarks,
  type NewSyncWatermark,
  type SourceSystem,
  type SyncDomain,
  type SyncWatermark,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

@Injectable()
export class SyncWatermarkRepository extends InstitutionScopedRepository<
  typeof syncWatermarks
> {
  constructor(txHost: TransactionHost) {
    super(txHost, syncWatermarks);
  }

  findFor(
    institutionId: string,
    sourceSystem: SourceSystem,
    domain: SyncDomain,
  ): Promise<SyncWatermark | undefined> {
    return this.findOneIn(
      institutionId,
      and(eq(syncWatermarks.sourceSystem, sourceSystem), eq(syncWatermarks.domain, domain)),
      { consistent: true },
    );
  }

  findAllFor(institutionId: string, sourceSystem: SourceSystem): Promise<SyncWatermark[]> {
    return this.findManyIn(institutionId, {
      where: eq(syncWatermarks.sourceSystem, sourceSystem),
      orderBy: syncWatermarks.domain,
      order: 'asc',
      consistent: true,
    });
  }

  async record(values: NewSyncWatermark): Promise<void> {
    await this.upsert(values, {
      target: [
        syncWatermarks.institutionId,
        syncWatermarks.sourceSystem,
        syncWatermarks.domain,
      ],
      targetWhere: isNull(syncWatermarks.deletedAt),
    });
  }
}
