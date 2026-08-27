import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  teachingAssignments,
  users,
  type CourseOfferingStatus,
  type EnrollmentRequirementType,
  type EnrollmentStatus,
  type TeachingRole,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface EnrolledCourseRow {
  enrollmentId: string;
  status: EnrollmentStatus;
  requirementType: EnrollmentRequirementType;
  attempt: number;
  enrolledAt: Date | null;
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

export interface OfferingTeacherRow {
  courseOfferingId: string;
  userId: string;
  displayName: string;
  role: TeachingRole;
  isPrimary: boolean;
}

export interface EnrolledCourseFilter {
  termId?: string;
  status?: EnrollmentStatus;
}

@Injectable()
export class MyCoursesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findEnrolledCourses(
    institutionId: string,
    userId: string,
    filter: EnrolledCourseFilter = {},
  ): Promise<EnrolledCourseRow[]> {
    const conditions: SQL[] = [
      eq(enrollments.institutionId, institutionId),
      eq(enrollments.userId, userId),
      isNull(enrollments.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
    ];

    if (filter.termId) conditions.push(eq(courseOfferings.academicTermId, filter.termId));
    if (filter.status) conditions.push(eq(enrollments.status, filter.status));

    return this.reader
      .select({
        enrollmentId: enrollments.id,
        status: enrollments.status,
        requirementType: enrollments.requirementType,
        attempt: enrollments.attempt,
        enrolledAt: enrollments.enrolledAt,
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
      .from(enrollments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(and(...conditions))
      .orderBy(desc(academicTerms.startsAt), courses.code);
  }

  async findTeachers(offeringIds: string[]): Promise<OfferingTeacherRow[]> {
    if (offeringIds.length === 0) return [];

    return this.reader
      .select({
        courseOfferingId: teachingAssignments.courseOfferingId,
        userId: users.id,
        displayName: users.displayName,
        role: teachingAssignments.role,
        isPrimary: teachingAssignments.isPrimary,
      })
      .from(teachingAssignments)
      .innerJoin(users, eq(users.id, teachingAssignments.userId))
      .where(
        and(
          inArray(teachingAssignments.courseOfferingId, offeringIds),
          isNull(teachingAssignments.deletedAt),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(desc(teachingAssignments.isPrimary), users.displayName);
  }

  private get reader() {
    return this.txHost.reader();
  }
}
