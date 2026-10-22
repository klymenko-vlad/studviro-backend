import { Injectable } from '@nestjs/common';

import {
  ConflictError,
  EntityNotFoundError,
  InvalidInputError,
  PermissionDeniedError,
} from '../../common/errors/domain.error';
import {
  isVoidedResult,
  type CourseGrade,
  type EnrollmentStatus,
  type OfficialCourseResult,
  type OfficialCourseResultStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { GradeNotificationsService } from '../notifications/grade-notifications.service';

import {
  OfferingResultsRepository,
  type OfferingResultRow,
} from './offering-results.repository';

export const GRADE_ENTRY_ROLES = ['teacher', 'administrator'] as const;
export type GradeEntryRole = (typeof GRADE_ENTRY_ROLES)[number];

export interface OfferingResultAttempt {
  id: string;
  attempt: number;
  status: OfficialCourseResultStatus;
  isVoided: boolean;
  calculated: { grade: CourseGrade | null; points: number | null };
  proposed: { grade: CourseGrade | null; at: Date | null };
  official: { grade: CourseGrade | null; recordedAt: Date | null };
}

export interface OfferingResultStudent {
  enrollmentId: string;
  userId: string;
  displayName: string;
  email: string;
  enrollmentStatus: EnrollmentStatus;
  attempts: OfferingResultAttempt[];
  /** The attempt a new grade would land on if the caller names none. */
  nextAttempt: number;
}

export interface OfferingResults {
  offering: { id: string };
  course: { id: string; code: string; title: string; credits: number | null };
  viewerRole: GradeEntryRole;
  canPublish: boolean;
  students: OfferingResultStudent[];
}

export interface RecordGradeInput {
  readonly enrollmentId: string;
  readonly attempt: number | null;
  readonly proposedGrade: CourseGrade | null | undefined;
  readonly officialGrade: CourseGrade | null | undefined;
  readonly conflictNote: string | null | undefined;
}

@Injectable()
export class OfferingResultsService {
  constructor(
    private readonly repository: OfferingResultsRepository,
    private readonly authorization: AuthorizationService,
    private readonly txHost: TransactionHost,
    private readonly notifications: GradeNotificationsService,
    private readonly audit: AuditService,
  ) {}

  async findForViewer(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<OfferingResults> {
    const offering = await this.offeringOrFail(institutionId, offeringId);
    const viewerRole = await this.viewerRole(institutionId, offeringId, userId);
    const rows = await this.repository.findResults(offeringId);

    return {
      offering: { id: offering.offeringId },
      course: {
        id: offering.courseId,
        code: offering.courseCode,
        title: offering.courseTitle,
        credits: offering.credits === null ? null : Number(offering.credits),
      },
      viewerRole,
      canPublish: await this.canPublish(institutionId, userId),
      students: groupByStudent(rows),
    };
  }

  async record(
    institutionId: string,
    offeringId: string,
    userId: string,
    input: RecordGradeInput,
    now = new Date(),
  ): Promise<OfficialCourseResult> {
    await this.offeringOrFail(institutionId, offeringId);
    await this.viewerRole(institutionId, offeringId, userId);

    const publishes = input.officialGrade !== undefined;
    if (publishes && !(await this.canPublish(institutionId, userId))) {
      throw new PermissionDeniedError(
        'GRADE_PUBLISH_DENIED',
        'Proposing a grade and publishing one are different decisions; you may only propose',
      );
    }

    if (input.proposedGrade === undefined && !publishes) {
      throw new InvalidInputError(
        'GRADE_ENTRY_EMPTY',
        'Name a proposed grade, an official grade, or both',
      );
    }

    return this.txHost.run(async () => {
      const enrollment = await this.repository.findEnrollment(
        institutionId,
        input.enrollmentId,
        offeringId,
      );
      if (!enrollment) throw new EntityNotFoundError('enrollment', input.enrollmentId);

      const attempt = input.attempt ?? (await this.defaultAttempt(input.enrollmentId));
      const existing = await this.repository.findResult(input.enrollmentId, attempt);

      if (existing && isVoidedResult(existing.status)) {
        throw new ConflictError(
          'GRADE_RESULT_ANNULLED',
          'That attempt was annulled. Record the next attempt instead of reviving it',
          { attempt },
        );
      }

      const written = await this.repository.upsert(
        {
          institutionId,
          enrollmentId: input.enrollmentId,
          attempt,
          ...this.stages(existing, input, userId, now),
          ...(input.conflictNote === undefined ? {} : { conflictNote: input.conflictNote }),
        },
        existing?.id ?? null,
      );

      await this.audit.record(
        {
          institutionId,
          actorUserId: userId,
          action: publishes ? 'grade.published' : 'grade.proposed',
          subjectType: 'course_result',
          subjectId: written.id,
          summary: gradeSummary(publishes, written),
          before: existing ? gradeSnapshot(existing) : null,
          after: gradeSnapshot(written),
        },
        now,
      );

      if (publishes && input.officialGrade !== null) {
        await this.repository.markSeatAttended(offeringId, enrollment.userId, now);
        await this.notifications.published(
          institutionId,
          {
            result: written,
            recipientId: enrollment.userId,
            courseOfferingId: offeringId,
            previousGrade: existing?.officialGrade ?? null,
          },
          now,
        );
      }

      return written;
    });
  }

  private stages(
    existing: OfficialCourseResult | undefined,
    input: RecordGradeInput,
    userId: string,
    now: Date,
  ) {
    const proposing = input.proposedGrade !== undefined;
    const publishing = input.officialGrade !== undefined;
    const hadOfficial = existing?.officialGrade != null;

    return {
      ...(proposing
        ? {
            proposedGrade: input.proposedGrade,
            proposedById: userId,
            proposedAt: input.proposedGrade === null ? null : now,
          }
        : {}),
      ...(publishing
        ? {
            officialGrade: input.officialGrade,
            officialRecordedById: userId,
            officialRecordedAt: input.officialGrade === null ? null : now,
          }
        : {}),
      status: statusFor({ publishing, proposing, hadOfficial, current: existing?.status }),
    };
  }

  private async defaultAttempt(enrollmentId: string): Promise<number> {
    return Math.max(1, await this.repository.highestAttempt(enrollmentId));
  }

  private async offeringOrFail(institutionId: string, offeringId: string) {
    const offering = await this.repository.findOffering(institutionId, offeringId);
    if (!offering) throw new EntityNotFoundError('course offering', offeringId);

    return offering;
  }

  /**
   * The same shape the roster uses: teaching the offering is standing enough,
   * and an administrator reaches it through `offering:manage` instead.
   */
  private async viewerRole(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<GradeEntryRole> {
    if (await this.repository.teaches(offeringId, userId)) return 'teacher';

    const administers = await this.authorization.can({
      userId,
      permission: 'offering:manage',
      scope: { type: 'institution', id: institutionId },
    });
    if (!administers) throw new PermissionDeniedError();

    return 'administrator';
  }

  private canPublish(institutionId: string, userId: string): Promise<boolean> {
    return this.authorization.can({
      userId,
      permission: 'grade:publish',
      scope: { type: 'institution', id: institutionId },
    });
  }
}

function gradeSnapshot(result: OfficialCourseResult): Record<string, unknown> {
  return {
    attempt: result.attempt,
    status: result.status,
    proposedGrade: result.proposedGrade,
    officialGrade: result.officialGrade,
  };
}

function gradeSummary(publishes: boolean, written: OfficialCourseResult): string {
  const grade = publishes ? written.officialGrade : written.proposedGrade;
  const verb = publishes ? 'Published' : 'Proposed';

  return grade === null
    ? `${verb === 'Published' ? 'Withdrew the official' : 'Cleared the proposed'} grade on attempt ${written.attempt}`
    : `${verb} ${grade} on attempt ${written.attempt}`;
}

function statusFor({
  publishing,
  proposing,
  hadOfficial,
  current,
}: {
  publishing: boolean;
  proposing: boolean;
  hadOfficial: boolean;
  current: OfficialCourseResultStatus | undefined;
}): OfficialCourseResultStatus {
  if (publishing) return hadOfficial ? 'corrected' : 'official';
  if (proposing && (current === undefined || current === 'calculated')) return 'proposed';

  return current ?? 'proposed';
}

function groupByStudent(rows: OfferingResultRow[]): OfferingResultStudent[] {
  const students = new Map<string, OfferingResultStudent>();

  for (const row of rows) {
    const student = students.get(row.enrollmentId) ?? {
      enrollmentId: row.enrollmentId,
      userId: row.userId,
      displayName: row.displayName,
      email: row.email,
      enrollmentStatus: row.enrollmentStatus,
      attempts: [],
      nextAttempt: 1,
    };

    if (row.resultId !== null && row.attempt !== null && row.status !== null) {
      student.attempts.push({
        id: row.resultId,
        attempt: row.attempt,
        status: row.status,
        isVoided: isVoidedResult(row.status),
        calculated: {
          grade: row.calculatedGrade,
          points: row.calculatedPoints === null ? null : Number(row.calculatedPoints),
        },
        proposed: { grade: row.proposedGrade, at: row.proposedAt },
        official: { grade: row.officialGrade, recordedAt: row.officialRecordedAt },
      });
      student.nextAttempt = Math.max(student.nextAttempt, row.attempt + 1);
    }

    students.set(row.enrollmentId, student);
  }

  return [...students.values()];
}
