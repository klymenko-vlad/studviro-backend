import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  ENROLLMENT_OCCUPYING_STATUSES,
  enrollments,
  type CourseOfferingStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface WaitlistedOffering {
  status: CourseOfferingStatus;
  capacity: number | null;
  occupiedSeats: number;
  enrollmentOpensAt: Date | null;
  enrollmentClosesAt: Date | null;
}

@Injectable()
export class WaitlistNotificationsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findOffering(
    institutionId: string,
    offeringId: string,
  ): Promise<WaitlistedOffering | undefined> {
    const [row] = await this.client
      .select({
        status: courseOfferings.status,
        capacity: courseOfferings.capacity,
        occupiedSeats: sql<number>`(
          select count(*) from ${enrollments}
          where ${enrollments.courseOfferingId} = ${courseOfferings.id}
            and ${enrollments.status} in ${ENROLLMENT_OCCUPYING_STATUSES}
            and ${enrollments.deletedAt} is null
        )`.mapWith(Number),
        enrollmentOpensAt: academicTerms.enrollmentOpensAt,
        enrollmentClosesAt: academicTerms.enrollmentClosesAt,
      })
      .from(courseOfferings)
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async findWaiting(institutionId: string, offeringId: string): Promise<string[]> {
    const rows = await this.client
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.institutionId, institutionId),
          eq(enrollments.courseOfferingId, offeringId),
          inArray(enrollments.status, ['waitlisted']),
          isNull(enrollments.deletedAt),
        ),
      )
      .orderBy(asc(enrollments.waitlistedAt));

    return rows.map((row) => row.userId);
  }

  private get client() {
    return this.txHost.client();
  }
}
