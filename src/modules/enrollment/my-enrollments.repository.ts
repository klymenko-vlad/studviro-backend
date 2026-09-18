import { Injectable } from '@nestjs/common';
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  academicTerms,
  courseOfferings,
  ENROLLMENT_OCCUPYING_STATUSES,
  enrollments,
  type Enrollment,
  type EnrollmentStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface EnrollableRow {
  offeringId: string;
  capacity: number | null;
  occupiedSeats: number;
  enrollmentOpensAt: Date | null;
  enrollmentClosesAt: Date | null;
  offeringStatus: string;
  myEnrollmentId: string | null;
  myStatus: EnrollmentStatus | null;
}

@Injectable()
export class MyEnrollmentsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findEnrollable(
    institutionId: string,
    userId: string,
    offeringId: string,
  ): Promise<EnrollableRow | undefined> {
    const [row] = await this.writer
      .select({
        offeringId: courseOfferings.id,
        capacity: courseOfferings.capacity,
        occupiedSeats: this.occupiedSeats(),
        enrollmentOpensAt: academicTerms.enrollmentOpensAt,
        enrollmentClosesAt: academicTerms.enrollmentClosesAt,
        offeringStatus: courseOfferings.status,
        myEnrollmentId: enrollments.id,
        myStatus: enrollments.status,
      })
      .from(courseOfferings)
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .leftJoin(
        enrollments,
        and(
          eq(enrollments.courseOfferingId, courseOfferings.id),
          eq(enrollments.userId, userId),
          isNull(enrollments.deletedAt),
        ),
      )
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
          isNull(academicTerms.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async findMine(
    institutionId: string,
    userId: string,
    enrollmentId: string,
  ): Promise<Enrollment | undefined> {
    const [row] = await this.writer
      .select()
      .from(enrollments)
      .where(
        and(
          eq(enrollments.id, enrollmentId),
          eq(enrollments.institutionId, institutionId),
          eq(enrollments.userId, userId),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async isStudent(institutionId: string, userId: string): Promise<boolean> {
    const [row] = await this.writer.execute<{ found: number }>(sql`
      select 1 as found from program_memberships
      where user_id = ${userId}
        and institution_id = ${institutionId}
        and status = 'active'
        and deleted_at is null
      limit 1
    `);

    return row !== undefined;
  }

  async request(
    institutionId: string,
    userId: string,
    offeringId: string,
    now: Date,
  ): Promise<Enrollment> {
    const [created] = await this.writer
      .insert(enrollments)
      .values({
        institutionId,
        courseOfferingId: offeringId,
        userId,
        status: 'requested',
        requirementType: 'elective',
        enrolledAt: now,
        sourceSystem: 'platform',
        synchronizationStatus: 'pending',
      })
      .returning();

    if (!created) throw new EntityNotFoundError('course offering', offeringId);

    return created;
  }

  /** A re-request reuses the row the student withdrew from, keeping one per offering. */
  async reopen(enrollmentId: string, now: Date): Promise<Enrollment> {
    const [reopened] = await this.writer
      .update(enrollments)
      .set({
        status: 'requested',
        enrolledAt: now,
        withdrawnAt: null,
        synchronizationStatus: 'pending',
      })
      .where(eq(enrollments.id, enrollmentId))
      .returning();

    if (!reopened) throw new EntityNotFoundError('enrollment', enrollmentId);

    return reopened;
  }

  async withdraw(enrollmentId: string, now: Date): Promise<Enrollment> {
    const [withdrawn] = await this.writer
      .update(enrollments)
      .set({ status: 'withdrawn', withdrawnAt: now })
      .where(and(eq(enrollments.id, enrollmentId), isNull(enrollments.deletedAt)))
      .returning();

    if (!withdrawn) throw new EntityNotFoundError('enrollment', enrollmentId);

    return withdrawn;
  }

  async activate(enrollmentId: string, now: Date): Promise<void> {
    await this.writer
      .update(enrollments)
      .set({ status: 'active', enrolledAt: now, synchronizationStatus: 'in_sync' })
      .where(eq(enrollments.id, enrollmentId));
  }

  private occupiedSeats(): SQL<number> {
    return sql<number>`(
      select count(*) from ${enrollments}
      where ${enrollments.courseOfferingId} = ${courseOfferings.id}
        and ${enrollments.status} in ${ENROLLMENT_OCCUPYING_STATUSES}
        and ${enrollments.deletedAt} is null
    )`.mapWith(Number);
  }

  private get writer() {
    return this.txHost.client();
  }
}
