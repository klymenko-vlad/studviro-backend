import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, lt, sql, type SQL } from 'drizzle-orm';

import {
  personalEvents,
  type NewPersonalEvent,
  type PersonalEvent,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type { PersonalTaskOwner } from './personal-tasks.repository';
import type { PlannerRange } from './planner-range';

@Injectable()
export class PersonalEventsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findOverlapping(owner: PersonalTaskOwner, range: PlannerRange): Promise<PersonalEvent[]> {
    return this.txHost
      .reader()
      .select()
      .from(personalEvents)
      .where(
        and(
          this.ownedBy(owner),
          lt(personalEvents.startsAt, range.to),
          gt(personalEvents.endsAt, range.from),
        ),
      )
      .orderBy(asc(personalEvents.startsAt), asc(personalEvents.id));
  }

  async findOwned(
    owner: PersonalTaskOwner,
    eventId: string,
  ): Promise<PersonalEvent | undefined> {
    const [event] = await this.txHost
      .reader()
      .select()
      .from(personalEvents)
      .where(and(this.ownedBy(owner), eq(personalEvents.id, eventId)));

    return event;
  }

  async insert(event: NewPersonalEvent): Promise<PersonalEvent> {
    const [created] = await this.txHost
      .client()
      .insert(personalEvents)
      .values(event)
      .returning();

    if (!created) throw new Error('the event insert returned no row');

    return created;
  }

  async update(
    owner: PersonalTaskOwner,
    eventId: string,
    changes: Partial<
      Pick<PersonalEvent, 'title' | 'note' | 'location' | 'startsAt' | 'endsAt' | 'deletedAt'>
    >,
  ): Promise<PersonalEvent | undefined> {
    const [updated] = await this.txHost
      .client()
      .update(personalEvents)
      .set(changes)
      .where(and(this.ownedBy(owner), eq(personalEvents.id, eventId)))
      .returning();

    return updated;
  }

  private ownedBy(owner: PersonalTaskOwner): SQL {
    return (
      and(
        eq(personalEvents.institutionId, owner.institutionId),
        eq(personalEvents.userId, owner.userId),
        isNull(personalEvents.deletedAt),
      ) ?? sql`false`
    );
  }
}
