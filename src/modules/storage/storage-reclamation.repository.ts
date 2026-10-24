import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, lt, or } from 'drizzle-orm';

import {
  discussionAttachments,
  learningMaterialFiles,
  learningMaterials,
  submissionFiles,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { StorageKey } from './storage.types';

export type ReclaimableSource = 'material' | 'folder_file';

export interface ReclaimableObject {
  readonly source: ReclaimableSource;
  readonly id: string;
  readonly institutionId: string;
  readonly storageKey: StorageKey;
}

@Injectable()
export class StorageReclamationRepository {
  constructor(private readonly txHost: TransactionHost) {}

  /**
   * Tombstoned materials and folder files whose grace period has run out and
   * whose object is still there. `storage_key` is the record of what was
   * reclaimed, so a row already swept is excluded by its null key.
   */
  async findReclaimable(before: Date, limit: number): Promise<ReclaimableObject[]> {
    const materials = await this.reclaimableMaterials(before, limit);
    const files =
      materials.length < limit
        ? await this.reclaimableFolderFiles(before, limit - materials.length)
        : [];

    return [...materials, ...files];
  }

  async markReclaimed(object: Pick<ReclaimableObject, 'source' | 'id'>): Promise<void> {
    const client = this.txHost.client();

    if (object.source === 'folder_file') {
      await client
        .update(learningMaterialFiles)
        .set({ storageKey: null, sizeBytes: null })
        .where(eq(learningMaterialFiles.id, object.id));

      return;
    }

    await client
      .update(learningMaterials)
      .set({ storageKey: null, sizeBytes: null })
      .where(eq(learningMaterials.id, object.id));
  }

  /**
   * Which of these keys a row still points at, tombstoned or not, so nothing
   * that can still be restored is mistaken for an orphan.
   */
  async findReferenced(keys: readonly string[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();

    const client = this.txHost.client();
    const referencing = [
      learningMaterials,
      learningMaterialFiles,
      submissionFiles,
      discussionAttachments,
    ].map((table) =>
      client
        .select({ key: table.storageKey })
        .from(table)
        .where(inArray(table.storageKey, [...keys])),
    );
    const rows = (await Promise.all(referencing)).flat();

    return new Set(rows.flatMap((row) => (row.key === null ? [] : [row.key])));
  }

  private async reclaimableMaterials(
    before: Date,
    limit: number,
  ): Promise<ReclaimableObject[]> {
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

    return withKeys(rows, 'material');
  }

  private async reclaimableFolderFiles(
    before: Date,
    limit: number,
  ): Promise<ReclaimableObject[]> {
    const rows = await this.txHost
      .client()
      .select({
        id: learningMaterialFiles.id,
        institutionId: learningMaterialFiles.institutionId,
        storageKey: learningMaterialFiles.storageKey,
      })
      .from(learningMaterialFiles)
      .innerJoin(
        learningMaterials,
        eq(learningMaterials.id, learningMaterialFiles.learningMaterialId),
      )
      .where(
        and(
          isNotNull(learningMaterialFiles.storageKey),
          or(
            lt(learningMaterialFiles.deletedAt, before),
            lt(learningMaterials.deletedAt, before),
          ),
        ),
      )
      .limit(limit);

    return withKeys(rows, 'folder_file');
  }
}

function withKeys(
  rows: { id: string; institutionId: string; storageKey: string | null }[],
  source: ReclaimableSource,
): ReclaimableObject[] {
  return rows.flatMap((row) =>
    row.storageKey === null ? [] : [{ ...row, source, storageKey: row.storageKey }],
  );
}
