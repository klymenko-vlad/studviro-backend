import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_OCCUPYING_STATUSES,
  enrollments,
  teachingAssignments,
  type CourseOffering,
  type CourseOfferingStatus,
  type Enrollment,
  type EnrollmentStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface NewOffering {
  readonly courseId: string;
  readonly academicTermId: string;
  readonly capacity?: number | null;
  readonly status?: CourseOfferingStatus;
  readonly language?: string | null;
  readonly orgUnitId?: string | null;
}

export interface OfferingListItem {
  readonly id: string;
  readonly courseId: string;
  readonly courseCode: string;
  readonly courseTitle: string;
  readonly academicTermId: string;
  readonly termCode: string;
  readonly termName: string;
  readonly status: CourseOfferingStatus;
  readonly capacity: number | null;
  readonly enrolled: number;
  readonly language: string | null;
  readonly teacherCount: number;
}

export interface OfferingChanges {
  readonly capacity?: number | null;
  readonly status?: CourseOfferingStatus;
  readonly language?: string | null;
}

/** What a registrar may correct an enrolment to, as opposed to what a student may do. */
export const CORRECTABLE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  'requested',
  'provisioning',
  'active',
  'completed',
  'withdrawn',
  'rejected',
];

@Injectable()
export class OfferingAdministrationService {
  constructor(private readonly txHost: TransactionHost) {}

  /**
   * Every offering in the institution, newest term first, with the names
   * either side of it and the two counts a scheduling screen needs. Joined
   * rather than fetched per row: a term's worth of offerings is a hundred-odd
   * rows and three round trips beats three hundred.
   */
  async list(institutionId: string): Promise<OfferingListItem[]> {
    const enrolledCount = this.reader
      .select({
        courseOfferingId: enrollments.courseOfferingId,
        total: sql<number>`count(*)`.as('enrolled_total'),
      })
      .from(enrollments)
      .where(
        and(
          inArray(enrollments.status, [...ENROLLMENT_OCCUPYING_STATUSES]),
          isNull(enrollments.deletedAt),
        ),
      )
      .groupBy(enrollments.courseOfferingId)
      .as('enrolled_count');

    const teacherCount = this.reader
      .select({
        courseOfferingId: teachingAssignments.courseOfferingId,
        total: sql<number>`count(*)`.as('teacher_total'),
      })
      .from(teachingAssignments)
      .where(isNull(teachingAssignments.deletedAt))
      .groupBy(teachingAssignments.courseOfferingId)
      .as('teacher_count');

    const rows = await this.reader
      .select({
        id: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        academicTermId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        status: courseOfferings.status,
        capacity: courseOfferings.capacity,
        language: courseOfferings.language,
        enrolled: sql<number>`coalesce(${enrolledCount.total}, 0)`.mapWith(Number),
        teacherCount: sql<number>`coalesce(${teacherCount.total}, 0)`.mapWith(Number),
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .leftJoin(enrolledCount, eq(enrolledCount.courseOfferingId, courseOfferings.id))
      .leftJoin(teacherCount, eq(teacherCount.courseOfferingId, courseOfferings.id))
      .where(
        and(
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .orderBy(desc(academicTerms.startsAt), asc(courses.code));

    return rows;
  }

  /**
   * Puts a course on in a term. The pair is unique while the offering is live,
   * so a second attempt is a conflict rather than a duplicate — a course
   * running twice in one term is a study group, not a second offering.
   */
  async create(institutionId: string, input: NewOffering): Promise<CourseOffering> {
    return this.txHost.run(async () => {
      const [course] = await this.client
        .select({ id: courses.id, orgUnitId: courses.orgUnitId })
        .from(courses)
        .where(
          and(
            eq(courses.id, input.courseId),
            eq(courses.institutionId, institutionId),
            isNull(courses.deletedAt),
          ),
        )
        .limit(1);
      if (!course) throw new EntityNotFoundError('course', input.courseId);

      const [term] = await this.client
        .select({ id: academicTerms.id })
        .from(academicTerms)
        .where(
          and(
            eq(academicTerms.id, input.academicTermId),
            eq(academicTerms.institutionId, institutionId),
            isNull(academicTerms.deletedAt),
          ),
        )
        .limit(1);
      if (!term) throw new EntityNotFoundError('academic_term', input.academicTermId);

      const [clash] = await this.client
        .select({ id: courseOfferings.id })
        .from(courseOfferings)
        .where(
          and(
            eq(courseOfferings.courseId, input.courseId),
            eq(courseOfferings.academicTermId, input.academicTermId),
            isNull(courseOfferings.deletedAt),
          ),
        )
        .limit(1);
      if (clash) {
        throw new ConflictError(
          'OFFERING_ALREADY_EXISTS',
          'That course is already on offer in that term',
        );
      }

      const [created] = await this.client
        .insert(courseOfferings)
        .values({
          institutionId,
          courseId: input.courseId,
          academicTermId: input.academicTermId,
          orgUnitId: input.orgUnitId ?? course.orgUnitId,
          ...(input.status === undefined ? {} : { status: input.status }),
          capacity: input.capacity ?? null,
          language: input.language ?? null,
        })
        .returning();

      if (!created)
        throw new ConflictError('OFFERING_NOT_CREATED', 'The offering was not created');

      return created;
    });
  }

  /**
   * Retiring an offering students hold places on would strand their record of
   * having taken it, so it is refused rather than cascaded. Cancelling it —
   * `PATCH` to `cancelled` — is the verb for a course that will not run.
   */
  async retire(institutionId: string, offeringId: string): Promise<void> {
    await this.txHost.run(async () => {
      await this.offering(institutionId, offeringId);

      const [row] = await this.client
        .select({ taken: sql<number>`count(*)`.mapWith(Number) })
        .from(enrollments)
        .where(
          and(eq(enrollments.courseOfferingId, offeringId), isNull(enrollments.deletedAt)),
        );

      const taken = row?.taken ?? 0;
      if (taken > 0) {
        throw new ConflictError(
          'OFFERING_HAS_ENROLLMENTS',
          'Students are enrolled on this offering; cancel it instead of retiring it',
          { taken },
        );
      }

      await this.client
        .update(courseOfferings)
        .set({ deletedAt: new Date() })
        .where(eq(courseOfferings.id, offeringId));
    });
  }

  async update(
    institutionId: string,
    offeringId: string,
    changes: OfferingChanges,
  ): Promise<CourseOffering> {
    return this.txHost.run(async () => {
      await this.offering(institutionId, offeringId);

      if (changes.capacity !== undefined && changes.capacity !== null) {
        await this.assertCapacityFits(offeringId, changes.capacity);
      }

      const [updated] = await this.client
        .update(courseOfferings)
        .set({
          ...(changes.capacity === undefined ? {} : { capacity: changes.capacity }),
          ...(changes.status === undefined ? {} : { status: changes.status }),
          ...(changes.language === undefined ? {} : { language: changes.language }),
        })
        .where(eq(courseOfferings.id, offeringId))
        .returning();

      if (!updated) throw new EntityNotFoundError('course offering', offeringId);

      return updated;
    });
  }

  /**
   * The correction verb. A student may only act on their own enrolment and only
   * inside the window; a registrar must be able to admit somebody past a full
   * course, or reverse a withdrawal that was a mistake.
   */
  async correctEnrollment(
    institutionId: string,
    offeringId: string,
    enrollmentId: string,
    status: EnrollmentStatus,
    now = new Date(),
  ): Promise<Enrollment> {
    return this.txHost.run(async () => {
      const [existing] = await this.client
        .select()
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

      if (!existing) throw new EntityNotFoundError('enrollment', enrollmentId);

      const [corrected] = await this.client
        .update(enrollments)
        .set({
          status,
          ...(status === 'withdrawn' || status === 'rejected'
            ? { withdrawnAt: now }
            : { withdrawnAt: null, enrolledAt: existing.enrolledAt ?? now }),
        })
        .where(eq(enrollments.id, enrollmentId))
        .returning();

      if (!corrected) throw new EntityNotFoundError('enrollment', enrollmentId);

      return corrected;
    });
  }

  private async offering(institutionId: string, offeringId: string): Promise<CourseOffering> {
    const [row] = await this.client
      .select()
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

    return row;
  }

  /** Cutting capacity below the places already taken would make the count a lie. */
  private async assertCapacityFits(offeringId: string, capacity: number): Promise<void> {
    const [row] = await this.client
      .select({ taken: sql<number>`count(*)`.mapWith(Number) })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          inArray(enrollments.status, [...ENROLLMENT_OCCUPYING_STATUSES]),
          isNull(enrollments.deletedAt),
        ),
      );

    const taken = row?.taken ?? 0;
    if (taken <= capacity) return;

    throw new ConflictError(
      'OFFERING_CAPACITY_BELOW_TAKEN',
      'That capacity is below the places already taken',
      { capacity, taken },
    );
  }

  private get client() {
    return this.txHost.client();
  }

  private get reader() {
    return this.txHost.reader();
  }
}
