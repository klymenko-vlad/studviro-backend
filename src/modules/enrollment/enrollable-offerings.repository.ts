import { Injectable } from '@nestjs/common';
import { and, asc, eq, exists, inArray, isNull, sql, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_OCCUPYING_STATUSES,
  enrollments,
  programMemberships,
  type EnrollmentStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface EnrollableOfferingRow {
  offeringId: string;
  capacity: number | null;
  occupiedSeats: number;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  credits: string | null;
  termId: string;
  termCode: string;
  termName: string;
  enrollmentOpensAt: Date | null;
  enrollmentClosesAt: Date | null;
  myEnrollmentId: string | null;
  myStatus: EnrollmentStatus | null;
  inMyProgram: boolean;
}

@Injectable()
export class EnrollableOfferingsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findOfferings(
    institutionId: string,
    userId: string,
    termId?: string,
  ): Promise<EnrollableOfferingRow[]> {
    const conditions: (SQL | undefined)[] = [
      eq(courseOfferings.institutionId, institutionId),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
      // A cancelled offering is not on offer.
      inArray(courseOfferings.status, ['planned', 'open', 'running']),
      termId ? eq(academicTerms.id, termId) : undefined,
    ];

    return this.reader
      .select({
        offeringId: courseOfferings.id,
        capacity: courseOfferings.capacity,
        occupiedSeats: this.occupiedSeats(),
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        credits: courses.credits,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        enrollmentOpensAt: academicTerms.enrollmentOpensAt,
        enrollmentClosesAt: academicTerms.enrollmentClosesAt,
        myEnrollmentId: enrollments.id,
        myStatus: enrollments.status,
        inMyProgram: sql<boolean>`${this.inProgram(userId)}`.mapWith(Boolean),
      })
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .leftJoin(
        enrollments,
        and(
          eq(enrollments.courseOfferingId, courseOfferings.id),
          eq(enrollments.userId, userId),
          isNull(enrollments.deletedAt),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(academicTerms.startsAt), asc(courses.code));
  }

  private occupiedSeats(): SQL<number> {
    return sql<number>`(
      select count(*) from ${enrollments}
      where ${enrollments.courseOfferingId} = ${courseOfferings.id}
        and ${enrollments.status} in ${ENROLLMENT_OCCUPYING_STATUSES}
        and ${enrollments.deletedAt} is null
    )`.mapWith(Number);
  }

  /**
   * An active programme membership is what makes somebody a student here at
   * all. The model has no link from an offering to the programmes that may
   * take it, so this cannot narrow further than that — a per-programme
   * catalogue would need a table nobody has designed.
   */
  private inProgram(userId: string): SQL {
    return exists(
      this.reader
        .select({ one: sql`1` })
        .from(programMemberships)
        .where(
          and(
            eq(programMemberships.userId, userId),
            eq(programMemberships.institutionId, courseOfferings.institutionId),
            eq(programMemberships.status, 'active'),
            isNull(programMemberships.deletedAt),
          ),
        ),
    );
  }

  private get reader() {
    return this.txHost.reader();
  }
}
