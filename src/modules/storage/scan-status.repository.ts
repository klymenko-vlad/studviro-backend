import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  discussionAttachments,
  learningMaterials,
  submissionFiles,
  type FileScanStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface PendingObject {
  readonly storageKey: string;
  readonly institutionId: string;
}

const FILE_TABLES = [learningMaterials, submissionFiles, discussionAttachments] as const;

@Injectable()
export class ScanStatusRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findPending(limit: number): Promise<PendingObject[]> {
    const found = new Map<string, PendingObject>();
    for (const table of FILE_TABLES) {
      const rows = await this.txHost
        .client()
        .select({ storageKey: table.storageKey, institutionId: table.institutionId })
        .from(table)
        .where(eq(table.scanStatus, 'pending'))
        .limit(limit);
      for (const row of rows) {
        if (row.storageKey !== null)
          found.set(row.storageKey, { ...row, storageKey: row.storageKey });
      }
    }

    return [...found.values()].slice(0, limit);
  }

  /** Every row naming the object takes the verdict; returns how many did. */
  async mark(storageKey: string, status: FileScanStatus): Promise<number> {
    let marked = 0;
    for (const table of FILE_TABLES) {
      const rows = await this.txHost
        .client()
        .update(table)
        .set({ scanStatus: status })
        .where(eq(table.storageKey, storageKey))
        .returning({ storageKey: table.storageKey });
      marked += rows.length;
    }

    return marked;
  }
}
