import { Injectable } from '@nestjs/common';
import { and, isNotNull, isNull, or } from 'drizzle-orm';

import { institutionSettings } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { SynchronizedSourceSystem } from './dto/start-sync-run.dto';

export interface ScheduledSyncTarget {
  readonly institutionId: string;
  readonly sourceSystems: readonly SynchronizedSourceSystem[];
}

@Injectable()
export class ScheduledSyncRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findConfiguredInstitutions(): Promise<ScheduledSyncTarget[]> {
    const rows = await this.txHost
      .client()
      .select({
        institutionId: institutionSettings.institutionId,
        academic: institutionSettings.academicSystemConnector,
        learning: institutionSettings.learningSystemConnector,
      })
      .from(institutionSettings)
      .where(
        and(
          isNull(institutionSettings.deletedAt),
          or(
            isNotNull(institutionSettings.academicSystemConnector),
            isNotNull(institutionSettings.learningSystemConnector),
          ),
        ),
      );

    return rows.map((row) => ({
      institutionId: row.institutionId,
      sourceSystems: [
        ...(row.academic ? (['sis'] as const) : []),
        ...(row.learning ? (['lms'] as const) : []),
      ],
    }));
  }
}
