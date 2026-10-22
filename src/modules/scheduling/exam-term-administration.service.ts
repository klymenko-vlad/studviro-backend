import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  EXAM_REGISTRATION_HOLDING_STATUSES,
  examRegistrations,
  examTerms,
  rooms,
  teachingAssignments,
  users,
  type ExamTerm,
  type ExamTermKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { ExamTermNotificationsService } from '../notifications/exam-term-notifications.service';

import { ExamTermCancellationService } from './exam-term-cancellation.service';

export interface ExamTermEntry {
  readonly id: string;
  readonly kind: ExamTermKind;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly capacity: number | null;
  readonly seatsTaken: number;
  readonly registrationOpensAt: Date | null;
  readonly registrationClosesAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly roomId: string | null;
  readonly roomCode: string | null;
  readonly examinerId: string | null;
  readonly examinerName: string | null;
}

export interface NewExamTerm {
  readonly kind?: ExamTermKind;
  readonly startsAt: Date;
  readonly endsAt?: Date | null;
  readonly capacity?: number | null;
  readonly registrationOpensAt?: Date | null;
  readonly registrationClosesAt?: Date | null;
  readonly roomId?: string | null;
  readonly examinerId?: string | null;
}

export interface ExamTermChanges {
  readonly kind?: ExamTermKind;
  readonly startsAt?: Date;
  readonly endsAt?: Date | null;
  readonly capacity?: number | null;
  readonly registrationOpensAt?: Date | null;
  readonly registrationClosesAt?: Date | null;
  readonly roomId?: string | null;
  readonly examinerId?: string | null;
}

interface ExamTermWindow {
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly registrationOpensAt: Date | null;
  readonly registrationClosesAt: Date | null;
}

@Injectable()
export class ExamTermAdministrationService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly cancellation: ExamTermCancellationService,
    private readonly notifications: ExamTermNotificationsService,
  ) {}

  async list(institutionId: string, offeringId: string): Promise<ExamTermEntry[]> {
    await this.assertOffering(institutionId, offeringId);

    const held = sql<number>`(
      select count(*) from ${examRegistrations}
      where ${examRegistrations.examTermId} = ${examTerms.id}
        and ${examRegistrations.status} = 'registered'
        and ${examRegistrations.deletedAt} is null
    )`.mapWith(Number);

    return this.reader
      .select({
        id: examTerms.id,
        kind: examTerms.kind,
        startsAt: examTerms.startsAt,
        endsAt: examTerms.endsAt,
        capacity: examTerms.capacity,
        seatsTaken: held,
        registrationOpensAt: examTerms.registrationOpensAt,
        registrationClosesAt: examTerms.registrationClosesAt,
        cancelledAt: examTerms.cancelledAt,
        roomId: examTerms.roomId,
        roomCode: rooms.code,
        examinerId: examTerms.examinerId,
        examinerName: users.displayName,
      })
      .from(examTerms)
      .leftJoin(rooms, eq(rooms.id, examTerms.roomId))
      .leftJoin(users, eq(users.id, examTerms.examinerId))
      .where(
        and(
          eq(examTerms.courseOfferingId, offeringId),
          eq(examTerms.institutionId, institutionId),
          isNull(examTerms.deletedAt),
        ),
      )
      .orderBy(asc(examTerms.startsAt));
  }

  async create(
    institutionId: string,
    offeringId: string,
    input: NewExamTerm,
    now = new Date(),
  ): Promise<ExamTerm> {
    return this.txHost.run(async () => {
      await this.assertOffering(institutionId, offeringId);

      this.assertWindow({
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        registrationOpensAt: input.registrationOpensAt ?? null,
        registrationClosesAt: input.registrationClosesAt ?? null,
      });

      await this.assertRoom(institutionId, input.roomId ?? null);
      await this.assertExaminer(offeringId, input.examinerId ?? null);

      const [created] = await this.client
        .insert(examTerms)
        .values({
          institutionId,
          courseOfferingId: offeringId,
          ...(input.kind === undefined ? {} : { kind: input.kind }),
          startsAt: input.startsAt,
          endsAt: input.endsAt ?? null,
          capacity: input.capacity ?? null,
          registrationOpensAt: input.registrationOpensAt ?? null,
          registrationClosesAt: input.registrationClosesAt ?? null,
          roomId: input.roomId ?? null,
          examinerId: input.examinerId ?? null,
        })
        .returning();

      if (!created) throw new EntityNotFoundError('course offering', offeringId);

      await this.notifications.applied(
        institutionId,
        { previous: null, current: created },
        now,
      );

      return created;
    });
  }

  async update(
    institutionId: string,
    offeringId: string,
    examTermId: string,
    changes: ExamTermChanges,
    now = new Date(),
  ): Promise<ExamTerm> {
    return this.txHost.run(async () => {
      const existing = await this.term(institutionId, offeringId, examTermId);
      this.assertNotCancelled(existing);

      this.assertWindow({
        startsAt: changes.startsAt ?? existing.startsAt,
        endsAt: changes.endsAt === undefined ? existing.endsAt : changes.endsAt,
        registrationOpensAt:
          changes.registrationOpensAt === undefined
            ? existing.registrationOpensAt
            : changes.registrationOpensAt,
        registrationClosesAt:
          changes.registrationClosesAt === undefined
            ? existing.registrationClosesAt
            : changes.registrationClosesAt,
      });

      if (changes.roomId !== undefined) await this.assertRoom(institutionId, changes.roomId);
      if (changes.examinerId !== undefined) {
        await this.assertExaminer(offeringId, changes.examinerId);
      }
      if (changes.capacity !== undefined && changes.capacity !== null) {
        await this.assertCapacityFits(examTermId, changes.capacity);
      }

      const [updated] = await this.client
        .update(examTerms)
        .set({
          ...(changes.kind === undefined ? {} : { kind: changes.kind }),
          ...(changes.startsAt === undefined ? {} : { startsAt: changes.startsAt }),
          ...(changes.endsAt === undefined ? {} : { endsAt: changes.endsAt }),
          ...(changes.capacity === undefined ? {} : { capacity: changes.capacity }),
          ...(changes.registrationOpensAt === undefined
            ? {}
            : { registrationOpensAt: changes.registrationOpensAt }),
          ...(changes.registrationClosesAt === undefined
            ? {}
            : { registrationClosesAt: changes.registrationClosesAt }),
          ...(changes.roomId === undefined ? {} : { roomId: changes.roomId }),
          ...(changes.examinerId === undefined ? {} : { examinerId: changes.examinerId }),
        })
        .where(eq(examTerms.id, examTermId))
        .returning();

      if (!updated) throw new EntityNotFoundError('exam_term', examTermId);

      await this.notifications.applied(
        institutionId,
        { previous: existing, current: updated },
        now,
      );

      return updated;
    });
  }

  /**
   * The seats a cancelled term held are released by the one service that owns
   * that decision, so a term cancelled here and a term cancelled anywhere else
   * leave the same record behind.
   */
  async cancel(
    institutionId: string,
    offeringId: string,
    examTermId: string,
    actorUserId: string | null = null,
    now = new Date(),
  ): Promise<ExamTerm> {
    return this.txHost.run(async () => {
      const existing = await this.term(institutionId, offeringId, examTermId);
      if (existing.cancelledAt) return existing;

      const [cancelled] = await this.client
        .update(examTerms)
        .set({ cancelledAt: now })
        .where(eq(examTerms.id, examTermId))
        .returning();

      if (!cancelled) throw new EntityNotFoundError('exam_term', examTermId);

      await this.notifications.applied(
        institutionId,
        { previous: existing, current: cancelled },
        now,
      );
      await this.cancellation.releaseSeats(institutionId, examTermId, now, actorUserId);

      return cancelled;
    });
  }

  /** Removing says the term was never offered; cancelling says it was called off. */
  async remove(
    institutionId: string,
    offeringId: string,
    examTermId: string,
    actorUserId: string | null = null,
    now = new Date(),
  ): Promise<void> {
    await this.txHost.run(async () => {
      const existing = await this.term(institutionId, offeringId, examTermId);

      // The audience is derived from seats that are still held and a term that
      // is still there, so both outlive the announcement by one statement.
      await this.notifications.applied(
        institutionId,
        { previous: existing, current: null, removed: true },
        now,
      );

      if (!existing.cancelledAt) {
        await this.cancellation.releaseSeats(institutionId, examTermId, now, actorUserId);
      }

      await this.client
        .update(examTerms)
        .set({ deletedAt: now })
        .where(eq(examTerms.id, examTermId));
    });
  }

  private assertNotCancelled(term: ExamTerm): void {
    if (!term.cancelledAt) return;

    throw new ConflictError(
      'EXAM_TERM_CANCELLED',
      'A cancelled term cannot be changed; offer another one instead',
    );
  }

  private assertWindow(window: ExamTermWindow): void {
    if (window.endsAt !== null && window.endsAt <= window.startsAt) {
      throw new ConflictError(
        'EXAM_TERM_ENDS_BEFORE_IT_STARTS',
        'An exam must end after it starts',
      );
    }

    const { registrationOpensAt: opens, registrationClosesAt: closes } = window;

    if (opens !== null && closes !== null && closes <= opens) {
      throw new ConflictError(
        'EXAM_REGISTRATION_WINDOW_CLOSES_BEFORE_IT_OPENS',
        'Registration must close after it opens',
      );
    }

    if (opens !== null && opens >= window.startsAt) {
      throw new ConflictError(
        'EXAM_REGISTRATION_OPENS_AFTER_EXAM_STARTS',
        'Registration must open before the exam starts',
      );
    }

    if (closes !== null && closes > window.startsAt) {
      throw new ConflictError(
        'EXAM_REGISTRATION_CLOSES_AFTER_EXAM_STARTS',
        'Registration must close before the exam starts',
      );
    }
  }

  /** Cutting capacity below the seats already held would make the count a lie. */
  private async assertCapacityFits(examTermId: string, capacity: number): Promise<void> {
    const [row] = await this.client
      .select({ taken: sql<number>`count(*)`.mapWith(Number) })
      .from(examRegistrations)
      .where(
        and(
          eq(examRegistrations.examTermId, examTermId),
          inArray(examRegistrations.status, [...EXAM_REGISTRATION_HOLDING_STATUSES]),
          isNull(examRegistrations.deletedAt),
        ),
      );

    const taken = row?.taken ?? 0;
    if (taken <= capacity) return;

    throw new ConflictError(
      'EXAM_TERM_CAPACITY_BELOW_TAKEN',
      'That capacity is below the seats already taken',
      { capacity, taken },
    );
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

  /**
   * An examiner who does not teach the course cannot be the one sitting in the
   * room, so naming one is a mis-entry rather than a policy choice.
   */
  private async assertExaminer(offeringId: string, examinerId: string | null): Promise<void> {
    if (examinerId === null) return;

    const [row] = await this.client
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          eq(teachingAssignments.userId, examinerId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .limit(1);

    if (row) return;

    throw new ConflictError(
      'EXAMINER_DOES_NOT_TEACH_OFFERING',
      'An examiner must be somebody who teaches this course',
      { examinerId },
    );
  }

  private async term(
    institutionId: string,
    offeringId: string,
    examTermId: string,
  ): Promise<ExamTerm> {
    const [row] = await this.client
      .select()
      .from(examTerms)
      .where(
        and(
          eq(examTerms.id, examTermId),
          eq(examTerms.institutionId, institutionId),
          eq(examTerms.courseOfferingId, offeringId),
          isNull(examTerms.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('exam_term', examTermId);

    return row;
  }

  private async assertOffering(institutionId: string, offeringId: string): Promise<void> {
    const [row] = await this.client
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('course offering', offeringId);
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
