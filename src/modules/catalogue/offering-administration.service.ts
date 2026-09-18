import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  courseOfferings,
  ENROLLMENT_OCCUPYING_STATUSES,
  enrollments,
  type CourseOffering,
  type CourseOfferingStatus,
  type Enrollment,
  type EnrollmentStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

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
}
