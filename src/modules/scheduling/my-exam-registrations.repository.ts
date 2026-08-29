import { Injectable } from '@nestjs/common';
import { and, eq, exists, isNull, ne, sql, type SQL } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  enrollments,
  examRegistrations,
  examTerms,
  type ExamRegistration,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface RegistrableExamTermRow {
  examTermId: string;
  offeringId: string;
  capacity: number | null;
  registeredCount: number;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  cancelledAt: Date | null;
  enrolled: boolean;
}

export interface LiveRegistrationRow {
  registration: ExamRegistration;
  examTermId: string;
  offeringId: string;
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
        offeringId: courseOfferings.id,
        capacity: examTerms.capacity,
        registeredCount: this.registeredCount(),
        registrationOpensAt: examTerms.registrationOpensAt,
        registrationClosesAt: examTerms.registrationClosesAt,
        cancelledAt: examTerms.cancelledAt,
        enrolled: sql<boolean>`${this.enrolledIn(userId)}`.mapWith(Boolean),
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
        sourceSystem: 'platform',
      })
      .returning();

    if (!created) throw new EntityNotFoundError('exam term', examTermId);

    return created;
  }

  async cancel(id: string, now: Date): Promise<ExamRegistration> {
    const [cancelled] = await this.txHost
      .client()
      .update(examRegistrations)
      .set({ status: 'cancelled', cancelledAt: now, deletedAt: now })
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
        and ${examRegistrations.status} = 'registered'
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
            isNull(enrollments.deletedAt),
          ),
        ),
    );
  }

  private get writer() {
    return this.txHost.client();
  }
}
