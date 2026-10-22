import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { demoRequests } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface DemoRequestRecord {
  institutionName: string;
  contactName: string;
  email: string;
  role: string;
  message?: string;
  ipHash?: string;
  userAgent?: string;
}

@Injectable()
export class DemoRequestsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  /**
   * Never returns the row. Nothing about a stored lead may reach the client,
   * and a repository that hands one back invites a controller to echo it.
   */
  async record(record: DemoRequestRecord, now: Date): Promise<void> {
    await this.txHost
      .client()
      .insert(demoRequests)
      .values({
        institutionName: record.institutionName,
        contactName: record.contactName,
        email: record.email,
        role: record.role,
        message: record.message ?? null,
        ipHash: record.ipHash ?? null,
        userAgent: record.userAgent ?? null,
        lastSubmittedAt: now,
      })
      .onConflictDoUpdate({
        target: demoRequests.email,
        targetWhere: sql`${demoRequests.deletedAt} is null`,
        set: {
          institutionName: record.institutionName,
          contactName: record.contactName,
          role: record.role,
          message: record.message ?? null,
          ipHash: record.ipHash ?? null,
          userAgent: record.userAgent ?? null,
          lastSubmittedAt: now,
          submissionCount: sql`${demoRequests.submissionCount} + 1`,
        },
      });
  }
}
