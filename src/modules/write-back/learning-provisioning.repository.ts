import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, notExists, sql } from 'drizzle-orm';

import {
  courseOfferings,
  courses,
  ENROLLMENT_PARTICIPATING_STATUSES,
  enrollments,
  externalIdentities,
  learningSpaces,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface UnprovisionedOffering {
  readonly offeringId: string;
  readonly externalId: string;
  readonly code: string;
  readonly title: string;
}

export interface UnprovisionedEnrollment {
  readonly enrollmentId: string;
  readonly courseExternalId: string;
  readonly personExternalId: string;
}

@Injectable()
export class LearningProvisioningRepository {
  constructor(private readonly txHost: TransactionHost) {}

  /** Offerings the source system knows and the learning system has no space for. */
  findOfferingsNeedingSpace(
    institutionId: string,
    limit: number,
  ): Promise<UnprovisionedOffering[]> {
    return this.writer
      .select({
        offeringId: courseOfferings.id,
        externalId: sql<string>`${courseOfferings.externalId}`,
        code: courses.code,
        title: courses.title,
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(courseOfferings.institutionId, institutionId),
          isNotNull(courseOfferings.externalId),
          isNull(courseOfferings.deletedAt),
          isNull(courses.deletedAt),
          notExists(
            this.writer
              .select({ one: sql`1` })
              .from(learningSpaces)
              .where(
                and(
                  eq(learningSpaces.courseOfferingId, courseOfferings.id),
                  isNull(learningSpaces.deletedAt),
                ),
              ),
          ),
        ),
      )
      .limit(limit);
  }

  /**
   * Participating enrolments the learning system has never been told about.
   * `lms_provisioned_at` is the column this finally writes.
   */
  findEnrollmentsNeedingProvisioning(
    institutionId: string,
    connectorName: string,
    limit: number,
  ): Promise<UnprovisionedEnrollment[]> {
    return this.writer
      .select({
        enrollmentId: enrollments.id,
        courseExternalId: sql<string>`${learningSpaces.externalId}`,
        personExternalId: sql<string>`${externalIdentities.subject}`,
      })
      .from(enrollments)
      .innerJoin(
        learningSpaces,
        eq(learningSpaces.courseOfferingId, enrollments.courseOfferingId),
      )
      .innerJoin(
        externalIdentities,
        and(
          eq(externalIdentities.userId, enrollments.userId),
          eq(externalIdentities.institutionId, institutionId),
          isNull(externalIdentities.deletedAt),
        ),
      )
      .where(
        and(
          eq(enrollments.institutionId, institutionId),
          sql`${enrollments.status} in ${ENROLLMENT_PARTICIPATING_STATUSES}`,
          isNull(enrollments.lmsProvisionedAt),
          isNull(enrollments.deletedAt),
          isNull(learningSpaces.deletedAt),
          isNotNull(learningSpaces.externalId),
          eq(externalIdentities.issuer, connectorName),
        ),
      )
      .limit(limit);
  }

  async markProvisioned(enrollmentId: string, now: Date): Promise<void> {
    await this.writer
      .update(enrollments)
      .set({ lmsProvisionedAt: now, lmsProvisioningError: null })
      .where(eq(enrollments.id, enrollmentId));
  }

  async recordProvisioningError(enrollmentId: string, message: string): Promise<void> {
    await this.writer
      .update(enrollments)
      .set({ lmsProvisioningError: message })
      .where(eq(enrollments.id, enrollmentId));
  }

  private get writer() {
    return this.txHost.client();
  }
}
