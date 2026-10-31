import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';

import { examTerms, learningActivities, timetableEvents } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { CalendarEntryRef } from './calendar-entry';

@Injectable()
export class CalendarEntryMomentsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async find(institutionId: string, entry: CalendarEntryRef): Promise<Date | undefined> {
    const [row] = await this.query(institutionId, entry);

    return row?.at ?? undefined;
  }

  private query(institutionId: string, { kind, id }: CalendarEntryRef) {
    const reader = this.txHost.reader();

    switch (kind) {
      case 'class':
        return reader
          .select({ at: timetableEvents.startsAt })
          .from(timetableEvents)
          .where(
            and(
              eq(timetableEvents.id, id),
              eq(timetableEvents.institutionId, institutionId),
              isNull(timetableEvents.deletedAt),
            ),
          )
          .limit(1);
      case 'exam':
        return reader
          .select({ at: examTerms.startsAt })
          .from(examTerms)
          .where(
            and(
              eq(examTerms.id, id),
              eq(examTerms.institutionId, institutionId),
              isNull(examTerms.deletedAt),
            ),
          )
          .limit(1);
      case 'deadline':
        return reader
          .select({ at: learningActivities.dueAt })
          .from(learningActivities)
          .where(
            and(
              eq(learningActivities.id, id),
              eq(learningActivities.institutionId, institutionId),
              isNull(learningActivities.deletedAt),
              isNotNull(learningActivities.dueAt),
            ),
          )
          .limit(1);
    }
  }
}
