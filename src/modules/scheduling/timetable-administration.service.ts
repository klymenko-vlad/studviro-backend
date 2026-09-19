import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  academicTerms,
  courseOfferings,
  rooms,
  studyGroups,
  timetableEvents,
  type TimetableEvent,
  type TimetableEventType,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface TimetableEventEntry {
  readonly id: string;
  readonly type: TimetableEventType;
  readonly title: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly cancelledAt: Date | null;
  readonly roomId: string | null;
  readonly roomCode: string | null;
  readonly studyGroupId: string | null;
  readonly studyGroupCode: string | null;
}

export interface NewTimetableEvent {
  readonly type?: TimetableEventType;
  readonly title?: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly roomId?: string | null;
  readonly studyGroupId?: string | null;
  /**
   * Repeat the slot weekly until the term ends. A university timetables a
   * weekly slot, not thirteen separate classes, so this is the ordinary path
   * and a single event is `false`.
   */
  readonly repeatWeekly?: boolean;
}

export interface TimetableEventChanges {
  readonly type?: TimetableEventType;
  readonly title?: string | null;
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly roomId?: string | null;
  readonly studyGroupId?: string | null;
}

const MILLISECONDS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** A guard against a mis-entered term, not a policy: nobody schedules 200 weeks. */
const MAX_REPEATS = 60;

@Injectable()
export class TimetableAdministrationService {
  constructor(private readonly txHost: TransactionHost) {}

  async list(institutionId: string, offeringId: string): Promise<TimetableEventEntry[]> {
    await this.offering(institutionId, offeringId);

    return this.reader
      .select({
        id: timetableEvents.id,
        type: timetableEvents.type,
        title: timetableEvents.title,
        startsAt: timetableEvents.startsAt,
        endsAt: timetableEvents.endsAt,
        cancelledAt: timetableEvents.cancelledAt,
        roomId: timetableEvents.roomId,
        roomCode: rooms.code,
        studyGroupId: timetableEvents.studyGroupId,
        studyGroupCode: studyGroups.code,
      })
      .from(timetableEvents)
      .leftJoin(rooms, eq(rooms.id, timetableEvents.roomId))
      .leftJoin(studyGroups, eq(studyGroups.id, timetableEvents.studyGroupId))
      .where(
        and(
          eq(timetableEvents.courseOfferingId, offeringId),
          eq(timetableEvents.institutionId, institutionId),
          isNull(timetableEvents.deletedAt),
        ),
      )
      .orderBy(asc(timetableEvents.startsAt));
  }

  /**
   * Returns every event created — one, or the whole weekly series to the end
   * of the term. The series is written as separate rows rather than a
   * recurrence rule so that moving or cancelling one week is an ordinary edit
   * of one row, which is what actually happens to a university timetable.
   */
  async create(
    institutionId: string,
    offeringId: string,
    input: NewTimetableEvent,
  ): Promise<TimetableEvent[]> {
    return this.txHost.run(async () => {
      const termEndsAt = await this.offering(institutionId, offeringId);

      if (input.endsAt <= input.startsAt) {
        throw new ConflictError(
          'EVENT_ENDS_BEFORE_IT_STARTS',
          'A class must end after it starts',
        );
      }

      await this.assertRoom(institutionId, input.roomId ?? null);
      await this.assertStudyGroup(offeringId, input.studyGroupId ?? null);

      const slots = input.repeatWeekly
        ? this.weeklySlots(input.startsAt, input.endsAt, termEndsAt)
        : [{ startsAt: input.startsAt, endsAt: input.endsAt }];

      const clash = await this.findRoomClash(input.roomId ?? null, slots);
      if (clash) {
        throw new ConflictError(
          'ROOM_DOUBLE_BOOKED',
          'That room is already booked for part of this slot',
          { at: clash.toISOString() },
        );
      }

      return this.client
        .insert(timetableEvents)
        .values(
          slots.map((slot) => ({
            institutionId,
            courseOfferingId: offeringId,
            studyGroupId: input.studyGroupId ?? null,
            roomId: input.roomId ?? null,
            ...(input.type === undefined ? {} : { type: input.type }),
            title: input.title ?? null,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          })),
        )
        .returning();
    });
  }

  async update(
    institutionId: string,
    offeringId: string,
    eventId: string,
    changes: TimetableEventChanges,
  ): Promise<TimetableEvent> {
    return this.txHost.run(async () => {
      const existing = await this.event(institutionId, offeringId, eventId);

      const startsAt = changes.startsAt ?? existing.startsAt;
      const endsAt = changes.endsAt ?? existing.endsAt;
      if (endsAt <= startsAt) {
        throw new ConflictError(
          'EVENT_ENDS_BEFORE_IT_STARTS',
          'A class must end after it starts',
        );
      }

      if (changes.roomId !== undefined) await this.assertRoom(institutionId, changes.roomId);
      if (changes.studyGroupId !== undefined) {
        await this.assertStudyGroup(offeringId, changes.studyGroupId);
      }

      const roomId = changes.roomId === undefined ? existing.roomId : changes.roomId;
      const clash = await this.findRoomClash(roomId, [{ startsAt, endsAt }], eventId);
      if (clash) {
        throw new ConflictError(
          'ROOM_DOUBLE_BOOKED',
          'That room is already booked for part of this slot',
          { at: clash.toISOString() },
        );
      }

      const [updated] = await this.client
        .update(timetableEvents)
        .set({
          ...(changes.type === undefined ? {} : { type: changes.type }),
          ...(changes.title === undefined ? {} : { title: changes.title }),
          ...(changes.startsAt === undefined ? {} : { startsAt: changes.startsAt }),
          ...(changes.endsAt === undefined ? {} : { endsAt: changes.endsAt }),
          ...(changes.roomId === undefined ? {} : { roomId: changes.roomId }),
          ...(changes.studyGroupId === undefined ? {} : { studyGroupId: changes.studyGroupId }),
        })
        .where(eq(timetableEvents.id, eventId))
        .returning();

      if (!updated) throw new EntityNotFoundError('timetable_event', eventId);

      return updated;
    });
  }

  /**
   * A cancelled class stays on the calendar, struck through, because a student
   * who turns up needs to see that it was called off rather than find nothing
   * where it used to be.
   */
  async cancel(
    institutionId: string,
    offeringId: string,
    eventId: string,
    now = new Date(),
  ): Promise<TimetableEvent> {
    return this.txHost.run(async () => {
      const existing = await this.event(institutionId, offeringId, eventId);

      const [updated] = await this.client
        .update(timetableEvents)
        .set({ cancelledAt: existing.cancelledAt ?? now })
        .where(eq(timetableEvents.id, eventId))
        .returning();

      if (!updated) throw new EntityNotFoundError('timetable_event', eventId);

      return updated;
    });
  }

  async restore(
    institutionId: string,
    offeringId: string,
    eventId: string,
  ): Promise<TimetableEvent> {
    return this.txHost.run(async () => {
      await this.event(institutionId, offeringId, eventId);

      const [updated] = await this.client
        .update(timetableEvents)
        .set({ cancelledAt: null })
        .where(eq(timetableEvents.id, eventId))
        .returning();

      if (!updated) throw new EntityNotFoundError('timetable_event', eventId);

      return updated;
    });
  }

  /** Removing an event says it never happened; cancelling says it was called off. */
  async remove(institutionId: string, offeringId: string, eventId: string): Promise<void> {
    await this.txHost.run(async () => {
      await this.event(institutionId, offeringId, eventId);

      await this.client
        .update(timetableEvents)
        .set({ deletedAt: new Date() })
        .where(eq(timetableEvents.id, eventId));
    });
  }

  /**
   * A term's `endsAt` is usually midnight on its last day, so comparing a
   * 09:00 class against it would silently drop that whole final day. The
   * repeat runs to the *end* of the day the term ends on.
   */
  private weeklySlots(
    startsAt: Date,
    endsAt: Date,
    termEndsAt: Date,
  ): { startsAt: Date; endsAt: Date }[] {
    const slots: { startsAt: Date; endsAt: Date }[] = [];
    const lastMoment = new Date(termEndsAt.getTime());
    lastMoment.setUTCHours(23, 59, 59, 999);

    for (let week = 0; week < MAX_REPEATS; week += 1) {
      const start = new Date(startsAt.getTime() + week * MILLISECONDS_PER_WEEK);
      if (start > lastMoment) break;

      slots.push({
        startsAt: start,
        endsAt: new Date(endsAt.getTime() + week * MILLISECONDS_PER_WEEK),
      });
    }

    return slots.length === 0 ? [{ startsAt, endsAt }] : slots;
  }

  /**
   * Two classes in one room at one time is the mistake a timetabling screen
   * exists to prevent, so it is refused rather than warned about. A cancelled
   * class holds no room.
   */
  private async findRoomClash(
    roomId: string | null,
    slots: readonly { startsAt: Date; endsAt: Date }[],
    exceptEventId?: string,
  ): Promise<Date | null> {
    if (roomId === null) return null;

    const booked = await this.client
      .select({ startsAt: timetableEvents.startsAt, endsAt: timetableEvents.endsAt })
      .from(timetableEvents)
      .where(
        and(
          eq(timetableEvents.roomId, roomId),
          exceptEventId === undefined ? undefined : ne(timetableEvents.id, exceptEventId),
          isNull(timetableEvents.cancelledAt),
          isNull(timetableEvents.deletedAt),
        ),
      );

    for (const slot of slots) {
      const overlaps = booked.some(
        (existing) => existing.startsAt < slot.endsAt && slot.startsAt < existing.endsAt,
      );
      if (overlaps) return slot.startsAt;
    }

    return null;
  }

  private async assertRoom(institutionId: string, roomId: string | null): Promise<void> {
    if (roomId === null) return;

    const [row] = await this.client
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.id, roomId),
          eq(rooms.institutionId, institutionId),
          isNull(rooms.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('room', roomId);
  }

  private async assertStudyGroup(
    offeringId: string,
    studyGroupId: string | null,
  ): Promise<void> {
    if (studyGroupId === null) return;

    const [row] = await this.client
      .select({ id: studyGroups.id })
      .from(studyGroups)
      .where(
        and(
          eq(studyGroups.id, studyGroupId),
          eq(studyGroups.courseOfferingId, offeringId),
          isNull(studyGroups.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('study_group', studyGroupId);
  }

  private async event(
    institutionId: string,
    offeringId: string,
    eventId: string,
  ): Promise<TimetableEvent> {
    const [row] = await this.client
      .select()
      .from(timetableEvents)
      .where(
        and(
          eq(timetableEvents.id, eventId),
          eq(timetableEvents.institutionId, institutionId),
          eq(timetableEvents.courseOfferingId, offeringId),
          isNull(timetableEvents.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('timetable_event', eventId);

    return row;
  }

  /** Returns the term's end, which is how far a weekly repeat runs. */
  private async offering(institutionId: string, offeringId: string): Promise<Date> {
    const [row] = await this.client
      .select({ endsAt: academicTerms.endsAt })
      .from(courseOfferings)
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('course offering', offeringId);

    return row.endsAt;
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
