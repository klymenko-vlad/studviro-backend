import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  courses,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  EXAM_REGISTRATION_HOLDING_STATUSES,
  examRegistrations,
  examTerms,
  officialCourseResults,
  teachingAssignments,
  users,
  type CourseGrade,
  type EnrollmentStatus,
  type OfficialCourseResult,
  type OfficialCourseResultStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface OfferingRow {
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  credits: string | null;
}

export interface OfferingResultRow {
  enrollmentId: string;
  userId: string;
  displayName: string;
  email: string;
  enrollmentStatus: EnrollmentStatus;
  resultId: string | null;
  attempt: number | null;
  status: OfficialCourseResultStatus | null;
  calculatedGrade: CourseGrade | null;
  calculatedPoints: string | null;
  proposedGrade: CourseGrade | null;
  proposedAt: Date | null;
  officialGrade: CourseGrade | null;
  officialRecordedAt: Date | null;
}

@Injectable()
export class OfferingResultsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findOffering(
    institutionId: string,
    offeringId: string,
  ): Promise<OfferingRow | undefined> {
    const [row] = await this.reader
      .select({
        offeringId: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        credits: courses.credits,
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
          isNull(courses.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async teaches(offeringId: string, userId: string): Promise<boolean> {
    const [row] = await this.reader
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  /** Every recorded student of the offering, with every attempt they have. */
  findResults(offeringId: string): Promise<OfferingResultRow[]> {
    return this.reader
      .select({
        enrollmentId: enrollments.id,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        enrollmentStatus: enrollments.status,
        resultId: officialCourseResults.id,
        attempt: officialCourseResults.attempt,
        status: officialCourseResults.status,
        calculatedGrade: officialCourseResults.calculatedGrade,
        calculatedPoints: officialCourseResults.calculatedPoints,
        proposedGrade: officialCourseResults.proposedGrade,
        proposedAt: officialCourseResults.proposedAt,
        officialGrade: officialCourseResults.officialGrade,
        officialRecordedAt: officialCourseResults.officialRecordedAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .leftJoin(
        officialCourseResults,
        and(
          eq(officialCourseResults.enrollmentId, enrollments.id),
          isNull(officialCourseResults.deletedAt),
        ),
      )
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          inArray(enrollments.status, ENROLLMENT_RECORDED_STATUSES),
          isNull(enrollments.deletedAt),
        ),
      )
      .orderBy(users.displayName, officialCourseResults.attempt);
  }

  async findEnrollment(institutionId: string, enrollmentId: string, offeringId: string) {
    const [row] = await this.writer
      .select({
        id: enrollments.id,
        userId: enrollments.userId,
        status: enrollments.status,
      })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.id, enrollmentId),
          eq(enrollments.institutionId, institutionId),
          eq(enrollments.courseOfferingId, offeringId),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async findResult(
    enrollmentId: string,
    attempt: number,
  ): Promise<OfficialCourseResult | undefined> {
    const [row] = await this.writer
      .select()
      .from(officialCourseResults)
      .where(
        and(
          eq(officialCourseResults.enrollmentId, enrollmentId),
          eq(officialCourseResults.attempt, attempt),
          isNull(officialCourseResults.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async highestAttempt(enrollmentId: string): Promise<number> {
    const [row] = await this.writer
      .select({ attempt: officialCourseResults.attempt })
      .from(officialCourseResults)
      .where(
        and(
          eq(officialCourseResults.enrollmentId, enrollmentId),
          isNull(officialCourseResults.deletedAt),
        ),
      )
      .orderBy(desc(officialCourseResults.attempt))
      .limit(1);

    return row?.attempt ?? 0;
  }

  async upsert(
    values: typeof officialCourseResults.$inferInsert,
    existingId: string | null,
  ): Promise<OfficialCourseResult> {
    const [written] = existingId
      ? await this.writer
          .update(officialCourseResults)
          .set(values)
          .where(eq(officialCourseResults.id, existingId))
          .returning()
      : await this.writer.insert(officialCourseResults).values(values).returning();

    if (!written) throw new EntityNotFoundError('course result', existingId ?? undefined);

    return written;
  }

  /**
   * Publishing a grade is the moment the attempt is spent. Nothing else in the
   * product ever set `attended`, which is why the ladder had nothing to count.
   */
  async markSeatAttended(offeringId: string, userId: string, now: Date): Promise<void> {
    const seats = await this.writer
      .select({ id: examRegistrations.id })
      .from(examRegistrations)
      .innerJoin(examTerms, eq(examTerms.id, examRegistrations.examTermId))
      .where(
        and(
          eq(examTerms.courseOfferingId, offeringId),
          eq(examRegistrations.userId, userId),
          inArray(examRegistrations.status, [...EXAM_REGISTRATION_HOLDING_STATUSES]),
          isNull(examRegistrations.deletedAt),
          isNull(examTerms.deletedAt),
        ),
      )
      .orderBy(desc(examTerms.startsAt))
      .limit(1);

    const seat = seats[0];
    if (!seat) return;

    await this.writer
      .update(examRegistrations)
      .set({ status: 'attended', updatedAt: now })
      .where(eq(examRegistrations.id, seat.id));
  }

  private get writer() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
