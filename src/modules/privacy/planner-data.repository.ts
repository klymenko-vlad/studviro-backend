import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { personalEvents, personalTasks } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { ErasureTally } from './erasure-rules';
import type { ExportedPersonalEvent, ExportedPersonalTask } from './personal-data.types';

@Injectable()
export class PlannerDataRepository {
  constructor(private readonly txHost: TransactionHost) {}

  tasks(institutionId: string, userId: string): Promise<ExportedPersonalTask[]> {
    return this.txHost
      .reader()
      .select({
        id: personalTasks.id,
        title: personalTasks.title,
        note: personalTasks.note,
        dueAt: personalTasks.dueAt,
        completedAt: personalTasks.completedAt,
        createdAt: personalTasks.createdAt,
      })
      .from(personalTasks)
      .where(
        and(
          eq(personalTasks.institutionId, institutionId),
          eq(personalTasks.userId, userId),
          isNull(personalTasks.deletedAt),
        ),
      )
      .orderBy(asc(personalTasks.createdAt), asc(personalTasks.id));
  }

  events(institutionId: string, userId: string): Promise<ExportedPersonalEvent[]> {
    return this.txHost
      .reader()
      .select({
        id: personalEvents.id,
        title: personalEvents.title,
        note: personalEvents.note,
        location: personalEvents.location,
        startsAt: personalEvents.startsAt,
        endsAt: personalEvents.endsAt,
        createdAt: personalEvents.createdAt,
      })
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.institutionId, institutionId),
          eq(personalEvents.userId, userId),
          isNull(personalEvents.deletedAt),
        ),
      )
      .orderBy(asc(personalEvents.startsAt), asc(personalEvents.id));
  }

  async erase(
    institutionId: string,
    userId: string,
  ): Promise<Pick<ErasureTally, 'personalTasks' | 'personalEvents'>> {
    const client = this.txHost.client();
    const tasks = await client
      .delete(personalTasks)
      .where(
        and(eq(personalTasks.institutionId, institutionId), eq(personalTasks.userId, userId)),
      )
      .returning({ id: personalTasks.id });
    const events = await client
      .delete(personalEvents)
      .where(
        and(eq(personalEvents.institutionId, institutionId), eq(personalEvents.userId, userId)),
      )
      .returning({ id: personalEvents.id });

    return { personalTasks: tasks.length, personalEvents: events.length };
  }
}
