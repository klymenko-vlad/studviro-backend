import { Injectable } from '@nestjs/common';
import { and, eq, exists, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  EXAM_REGISTRATION_SEATED_STATUSES,
  examRegistrations,
  examTerms,
  type ExamRegistration,
  type ExamTermKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { attemptsSpentOnOffering } from './attempts-spent.sql';

export interface RegistrableExamTermRow {
  examTermId: string;
  kind: ExamTermKind;
  offeringId: string;
  capacity: number | null;
  registeredCount: number;
  startsAt: Date;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  cancelledAt: Date | null;
  enrolled: boolean;
  /** Attempts already spent on this offering: failed results plus consumed seats. */
  attemptsSpent: number;
}

export interface LiveRegistrationRow {
  registration: ExamRegistration;
  examTermId: string;
  offeringId: string;
  startsAt: Date;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  termCancelledAt: Date | null;
}

@Injectable()
export class MyExamRegistrationsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findRegistrableTerm(
    institutionId: string,
    userId: string,
    examTermId: string,
  ): Promise<RegistrableExamTermRow | undefined> {
    const [row] = await this.writer
      .select({
        examTermId: examTerms.id,
        kind: examTerms.kind,
        offeringId: courseOfferings.id,
        capacity: examTerms.capacity,
        registeredCount: this.registeredCount(),
        startsAt: examTerms.startsAt,
        registrationOpensAt: examTerms.registrationOpensAt,
        registrationClosesAt: examTerms.registrationClosesAt,
        cancelledAt: examTerms.cancelledAt,
        enrolled: sql<boolean>`${this.enrolledIn(userId)}`.mapWith(Boolean),
        attemptsSpent: attemptsSpentOnOffering(userId),
      })
      .from(examTerms)
      .innerJoin(courseOfferings, eq(courseOfferings.id, examTerms.courseOfferingId))
      .where(
        and(
          eq(examTerms.id, examTermId),
          eq(examTerms.institutionId, institutionId),
          isNull(examTerms.deletedAt),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async findLiveRegistrationForOffering(
    institutionId: string,
    userId: string,
    offeringId: string,
    exceptExamTermId?: string,
  ): Promise<LiveRegistrationRow | undefined> {
    const conditions: (SQL | undefined)[] = [
      eq(courseOfferings.id, offeringId),
      exceptExamTermId ? ne(examTerms.id, exceptExamTermId) : undefined,
    ];

    return this.findLiveRegistration(institutionId, userId, conditions);
  }

  async findLiveRegistrationById(
    institutionId: string,
    userId: string,
    id: string,
  ): Promise<LiveRegistrationRow | undefined> {
    return this.findLiveRegistration(institutionId, userId, [eq(examRegistrations.id, id)]);
  }

  async register(
    institutionId: string,
    userId: string,
    examTermId: string,
    now: Date,
  ): Promise<ExamRegistration> {
    const [created] = await this.txHost
      .client()
      .insert(examRegistrations)
      .values({
        institutionId,
        examTermId,
        userId,
        status: 'registered',
        registeredAt: now,
      })
      .returning();

    if (!created) throw new EntityNotFoundError('exam term', examTermId);

    return created;
  }

  /**
   * A cancellation is recorded, not erased. It used to set `deleted_at` as well,
   * which made the `cancelled` status unreadable dead data and left the student
   * with no trace of an act they took.
   */
  async cancel(id: string, now: Date): Promise<ExamRegistration> {
    const [cancelled] = await this.txHost
      .client()
      .update(examRegistrations)
      .set({ status: 'cancelled', cancelledAt: now })
      .where(and(eq(examRegistrations.id, id), isNull(examRegistrations.deletedAt)))
      .returning();

    if (!cancelled) throw new EntityNotFoundError('exam registration', id);

    return cancelled;
  }

  private async findLiveRegistration(
    institutionId: string,
    userId: string,
    conditions: (SQL | undefined)[],
  ): Promise<LiveRegistrationRow | undefined> {
    const [row] = await this.writer
      .select({
        registration: examRegistrations,
        examTermId: examTerms.id,
        offeringId: courseOfferings.id,
        startsAt: examTerms.startsAt,
        registrationOpensAt: examTerms.registrationOpensAt,
        registrationClosesAt: examTerms.registrationClosesAt,
        termCancelledAt: examTerms.cancelledAt,
      })
      .from(examRegistrations)
      .innerJoin(examTerms, eq(examTerms.id, examRegistrations.examTermId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, examTerms.courseOfferingId))
      .where(
        and(
          eq(examRegistrations.institutionId, institutionId),
          eq(examRegistrations.userId, userId),
          eq(examRegistrations.status, 'registered'),
          isNull(examRegistrations.deletedAt),
          isNull(examTerms.deletedAt),
          ...conditions,
        ),
      )
      .limit(1);

    return row;
  }

  private registeredCount(): SQL<number> {
    return sql<number>`(
      select count(*) from ${examRegistrations}
      where ${examRegistrations.examTermId} = ${examTerms.id}
        and ${examRegistrations.status} in ${EXAM_REGISTRATION_SEATED_STATUSES}
        and ${examRegistrations.deletedAt} is null
    )`.mapWith(Number);
  }

  private enrolledIn(userId: string): SQL {
    return exists(
      this.writer
        .select({ one: sql`1` })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.courseOfferingId, courseOfferings.id),
            eq(enrollments.userId, userId),
            inArray(enrollments.status, ENROLLMENT_RECORDED_STATUSES),
            isNull(enrollments.deletedAt),
          ),
        ),
    );
  }

  private get writer() {
    return this.txHost.client();
  }
}
