import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  courseOfferings,
  enrollments,
  externalIdentities,
  type Enrollment,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface CourseEnrollmentWriteContext {
  readonly enrollmentExternalId: string | null;
  readonly courseOfferingExternalId: string | null;
  readonly personExternalId: string | null;
}

@Injectable()
export class CourseEnrollmentWriteRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findContext(
    institutionId: string,
    enrollmentId: string,
    connectorName: string,
  ): Promise<CourseEnrollmentWriteContext | undefined> {
    const [row] = await this.txHost
      .client()
      .select({
        enrollmentExternalId: enrollments.externalId,
        courseOfferingExternalId: courseOfferings.externalId,
        personExternalId: externalIdentities.subject,
      })
      .from(enrollments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.courseOfferingId))
      .leftJoin(
        externalIdentities,
        and(
          eq(externalIdentities.userId, enrollments.userId),
          eq(externalIdentities.institutionId, institutionId),
          eq(externalIdentities.issuer, connectorName),
          isNull(externalIdentities.deletedAt),
        ),
      )
      .where(
        and(
          eq(enrollments.id, enrollmentId),
          eq(enrollments.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  /**
   * The registrar accepted the request, so the place is real: the row leaves
   * `requested` for `active` and adopts the identifier the source assigned.
   */
  async confirm(
    enrollmentId: string,
    externalId: string | null,
    now: Date,
  ): Promise<Enrollment | undefined> {
    const [confirmed] = await this.txHost
      .client()
      .update(enrollments)
      .set({
        status: 'active',
        enrolledAt: now,
        synchronizationStatus: 'in_sync',
        lastSynchronizedAt: now,
        ...(externalId === null ? {} : { sourceSystem: 'sis' as const, externalId }),
      })
      .where(and(eq(enrollments.id, enrollmentId), isNull(enrollments.deletedAt)))
      .returning();

    return confirmed;
  }

  /** The registrar refused it, so it is not a place. */
  async reject(enrollmentId: string, now: Date): Promise<Enrollment | undefined> {
    const [rejected] = await this.txHost
      .client()
      .update(enrollments)
      .set({ status: 'rejected', withdrawnAt: now, synchronizationStatus: 'in_sync' })
      .where(and(eq(enrollments.id, enrollmentId), isNull(enrollments.deletedAt)))
      .returning();

    return rejected;
  }

  async settle(enrollmentId: string, now: Date): Promise<void> {
    await this.txHost
      .client()
      .update(enrollments)
      .set({ synchronizationStatus: 'in_sync', lastSynchronizedAt: now })
      .where(eq(enrollments.id, enrollmentId));
  }

  async markFailed(enrollmentId: string): Promise<void> {
    await this.txHost
      .client()
      .update(enrollments)
      .set({ synchronizationStatus: 'failed' })
      .where(eq(enrollments.id, enrollmentId));
  }
}
