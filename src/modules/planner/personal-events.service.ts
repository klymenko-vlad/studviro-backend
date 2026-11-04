import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, InvalidInputError } from '../../common/errors/domain.error';
import type { PersonalEvent } from '../../database/schema';

import type {
  CreatePersonalEventDto,
  UpdatePersonalEventDto,
} from './dto/personal-event-input.dto';
import { PersonalEventsRepository } from './personal-events.repository';
import type { PersonalTaskOwner } from './personal-tasks.repository';
import { assertPlannerRange, type PlannerRange } from './planner-range';

@Injectable()
export class PersonalEventsService {
  constructor(private readonly events: PersonalEventsRepository) {}

  list(owner: PersonalTaskOwner, range: PlannerRange): Promise<PersonalEvent[]> {
    assertPlannerRange(range);

    return this.events.findOverlapping(owner, range);
  }

  create(owner: PersonalTaskOwner, input: CreatePersonalEventDto): Promise<PersonalEvent> {
    assertEndsAfterStart(input.startsAt, input.endsAt);

    return this.events.insert({
      ...owner,
      title: input.title,
      note: input.note ?? null,
      location: input.location ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
  }

  async update(
    owner: PersonalTaskOwner,
    eventId: string,
    input: UpdatePersonalEventDto,
  ): Promise<PersonalEvent> {
    const current = (await this.events.findOwned(owner, eventId)) ?? notFound(eventId);
    const startsAt = input.startsAt ?? current.startsAt;
    const endsAt = input.endsAt ?? current.endsAt;
    assertEndsAfterStart(startsAt, endsAt);

    const updated = await this.events.update(owner, eventId, {
      title: input.title ?? current.title,
      note: input.note === undefined ? current.note : input.note,
      location: input.location === undefined ? current.location : input.location,
      startsAt,
      endsAt,
    });

    return updated ?? notFound(eventId);
  }

  async remove(owner: PersonalTaskOwner, eventId: string, now = new Date()): Promise<void> {
    const removed = await this.events.update(owner, eventId, { deletedAt: now });
    if (!removed) notFound(eventId);
  }
}

function assertEndsAfterStart(startsAt: Date, endsAt: Date): void {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new InvalidInputError(
      'PERSONAL_EVENT_ENDS_BEFORE_START',
      'An event must end after it starts',
    );
  }
}

function notFound(eventId: string): never {
  throw new EntityNotFoundError('PersonalEvent', eventId);
}
