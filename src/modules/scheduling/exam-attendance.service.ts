import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  examRegistrations,
  examTerms,
  users,
  type ExamRegistrationStatus,
  type ExamTerm,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuditService } from '../audit/audit.service';

export const EXAM_ATTENDANCE_OUTCOMES = ['attended', 'no_show', 'excused'] as const;
export type ExamAttendanceOutcome = (typeof EXAM_ATTENDANCE_OUTCOMES)[number];

export interface ExamRegistrant {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email: string | null;
  readonly status: ExamRegistrationStatus;
  readonly registeredAt: Date | null;
}

const REGISTRANT_COLUMNS = {
  id: examRegistrations.id,
  userId: examRegistrations.userId,
  displayName: users.displayName,
  email: users.email,
  status: examRegistrations.status,
  registeredAt: examRegistrations.registeredAt,
};

@Injectable()
export class ExamAttendanceService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly audit: AuditService,
  ) {}

  async list(
    institutionId: string,
    offeringId: string,
    examTermId: string,
  ): Promise<ExamRegistrant[]> {
    await this.term(institutionId, offeringId, examTermId);

    return this.txHost
      .reader()
      .select(REGISTRANT_COLUMNS)
      .from(examRegistrations)
      .innerJoin(users, eq(users.id, examRegistrations.userId))
      .where(
        and(
          eq(examRegistrations.examTermId, examTermId),
          ne(examRegistrations.status, 'cancelled'),
          isNull(examRegistrations.deletedAt),
        ),
      )
      .orderBy(asc(users.displayName), asc(examRegistrations.id));
  }

  async record(
    institutionId: string,
    offeringId: string,
    examTermId: string,
    registrationId: string,
    outcome: ExamAttendanceOutcome,
    actorUserId: string | null = null,
    now = new Date(),
  ): Promise<ExamRegistrant> {
    return this.txHost.run(async () => {
      const term = await this.term(institutionId, offeringId, examTermId);
      this.assertSat(term, now);

      const registrant = await this.registrant(examTermId, registrationId);

      const previous = registrant.status;
      if (previous === outcome) return registrant;

      await this.txHost
        .client()
        .update(examRegistrations)
        .set({ status: outcome, updatedAt: now })
        .where(eq(examRegistrations.id, registrationId));

      await this.audit.record(
        {
          institutionId,
          actorUserId,
          action: 'exam_registration.attendance_recorded',
          subjectType: 'exam_registration',
          subjectId: registrationId,
          summary: `Recorded ${registrant.displayName} as ${outcome}`,
          before: { status: previous },
          after: { status: outcome },
        },
        now,
      );

      return { ...registrant, status: outcome };
    });
  }

  private assertSat(term: ExamTerm, now: Date): void {
    if (term.cancelledAt) {
      throw new ConflictError(
        'EXAM_TERM_CANCELLED',
        'Nobody sat a term that was called off, so there is no attendance to record',
      );
    }

    if (term.startsAt > now) {
      throw new ConflictError(
        'EXAM_TERM_NOT_YET_SAT',
        'Attendance can be recorded once the exam has started',
        { startsAt: term.startsAt.toISOString() },
      );
    }
  }

  private async registrant(
    examTermId: string,
    registrationId: string,
  ): Promise<ExamRegistrant> {
    const [row] = await this.txHost
      .client()
      .select(REGISTRANT_COLUMNS)
      .from(examRegistrations)
      .innerJoin(users, eq(users.id, examRegistrations.userId))
      .where(
        and(
          eq(examRegistrations.id, registrationId),
          eq(examRegistrations.examTermId, examTermId),
          isNull(examRegistrations.deletedAt),
        ),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('exam_registration', registrationId);

    if (row.status === 'cancelled') {
      throw new ConflictError(
        'EXAM_REGISTRATION_CANCELLED',
        'The student gave this seat up, so there is no attendance to record',
      );
    }

    return row;
  }

  private async term(
    institutionId: string,
    offeringId: string,
    examTermId: string,
  ): Promise<ExamTerm> {
    const [row] = await this.txHost
      .client()
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
}
