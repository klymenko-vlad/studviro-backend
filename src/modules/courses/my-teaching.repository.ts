import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  teachingAssignments,
  type CourseOfferingStatus,
  type TeachingRole,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface TeachingOfferingRow {
  assignmentId: string;
  role: TeachingRole;
  isPrimary: boolean;
  offeringId: string;
  offeringStatus: CourseOfferingStatus;
  language: string | null;
  capacity: number | null;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  courseDescription: string | null;
  credits: string | null;
  termId: string;
  termCode: string;
  termName: string;
  academicYear: string;
  termStartsAt: Date;
  termEndsAt: Date;
}

export interface TeachingOfferingFilter {
  termId?: string;
}

export interface OfferingEnrollmentCountRow {
  courseOfferingId: string;
  enrolled: number;
}

@Injectable()
export class MyTeachingRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findTeachingOfferings(
    institutionId: string,
    userId: string,
    filter: TeachingOfferingFilter = {},
  ): Promise<TeachingOfferingRow[]> {
    const conditions: SQL[] = [
      eq(teachingAssignments.institutionId, institutionId),
      eq(teachingAssignments.userId, userId),
      isNull(teachingAssignments.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
    ];

    if (filter.termId) conditions.push(eq(courseOfferings.academicTermId, filter.termId));

    return this.reader
      .select({
        assignmentId: teachingAssignments.id,
        role: teachingAssignments.role,
        isPrimary: teachingAssignments.isPrimary,
        offeringId: courseOfferings.id,
        offeringStatus: courseOfferings.status,
        language: courseOfferings.language,
        capacity: courseOfferings.capacity,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        courseDescription: courses.description,
        credits: courses.credits,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        academicYear: academicTerms.academicYear,
        termStartsAt: academicTerms.startsAt,
        termEndsAt: academicTerms.endsAt,
      })
      .from(teachingAssignments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingAssignments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(and(...conditions))
      .orderBy(desc(academicTerms.startsAt), courses.code);
  }

  async countEnrollments(offeringIds: string[]): Promise<OfferingEnrollmentCountRow[]> {
    if (offeringIds.length === 0) return [];

    return this.reader
      .select({ courseOfferingId: enrollments.courseOfferingId, enrolled: count() })
      .from(enrollments)
      .where(
        and(inArray(enrollments.courseOfferingId, offeringIds), isNull(enrollments.deletedAt)),
      )
      .groupBy(enrollments.courseOfferingId);
  }

  private get reader() {
    return this.txHost.reader();
  }
}
