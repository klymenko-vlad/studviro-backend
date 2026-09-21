import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, lt } from 'drizzle-orm';

import { learningMaterials } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { StorageKey } from './storage.types';

export interface ReclaimableObject {
  readonly id: string;
  readonly institutionId: string;
  readonly storageKey: StorageKey;
}

@Injectable()
export class StorageReclamationRepository {
  constructor(private readonly txHost: TransactionHost) {}

  /**
   * Tombstoned materials whose grace period has run out and whose object is
   * still there. `storage_key` is the record of what was reclaimed, so a row
   * that has already been swept is excluded by its null key rather than by a
   * second column.
   */
  async findReclaimable(before: Date, limit: number): Promise<ReclaimableObject[]> {
    const rows = await this.txHost
      .client()
      .select({
        id: learningMaterials.id,
        institutionId: learningMaterials.institutionId,
        storageKey: learningMaterials.storageKey,
      })
      .from(learningMaterials)
      .where(
        and(
          isNotNull(learningMaterials.deletedAt),
          lt(learningMaterials.deletedAt, before),
          isNotNull(learningMaterials.storageKey),
          eq(learningMaterials.kind, 'file'),
        ),
      )
      .limit(limit);

    return rows.filter((row): row is ReclaimableObject => row.storageKey !== null);
  }

  /** Clears the key once its object is gone, so the sweep never retries it. */
  async markReclaimed(materialId: string): Promise<void> {
    await this.txHost
      .client()
      .update(learningMaterials)
      .set({ storageKey: null, sizeBytes: null })
      .where(eq(learningMaterials.id, materialId));
  }
}
