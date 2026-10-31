import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, type SQL } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  ENROLLMENT_RECORDED_STATUSES,
  enrollments,
  officialCourseResults,
  programMemberships,
  programs,
  type CourseGrade,
  type EnrollmentStatus,
  type OfficialCourseResultStatus,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyCourseResultRow {
  resultId: string;
  status: OfficialCourseResultStatus;
  calculatedPoints: string | null;
  calculatedGrade: CourseGrade | null;
  proposedGrade: CourseGrade | null;
  proposedAt: Date | null;
  officialGrade: CourseGrade | null;
  officialRecordedAt: Date | null;
  conflictNote: string | null;
  enrollmentId: string;
  enrollmentStatus: EnrollmentStatus;
  attempt: number;
  offeringId: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  credits: string | null;
  termId: string;
  termCode: string;
  termName: string;
  academicYear: string;
  termStartsAt: Date;
}

export interface MyCourseResultFilter {
  termId?: string;
  offeringId?: string;
  status?: OfficialCourseResultStatus;
}

@Injectable()
export class MyCourseResultsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findMyResults(
    institutionId: string,
    userId: string,
    filter: MyCourseResultFilter = {},
  ): Promise<MyCourseResultRow[]> {
    const conditions: (SQL | undefined)[] = [
      eq(officialCourseResults.institutionId, institutionId),
      eq(enrollments.userId, userId),
      or(
        inArray(enrollments.status, ENROLLMENT_RECORDED_STATUSES),
        and(
          eq(enrollments.status, 'withdrawn'),
          isNotNull(officialCourseResults.officialGrade),
        ),
      ),
      isNull(officialCourseResults.deletedAt),
      isNull(enrollments.deletedAt),
      isNull(courseOfferings.deletedAt),
      isNull(courses.deletedAt),
      isNull(academicTerms.deletedAt),
    ];

    if (filter.termId) conditions.push(eq(courseOfferings.academicTermId, filter.termId));
    if (filter.offeringId) conditions.push(eq(courseOfferings.id, filter.offeringId));
    if (filter.status) conditions.push(eq(officialCourseResults.status, filter.status));

    return this.reader
      .select({
        resultId: officialCourseResults.id,
        status: officialCourseResults.status,
        calculatedPoints: officialCourseResults.calculatedPoints,
        calculatedGrade: officialCourseResults.calculatedGrade,
        proposedGrade: officialCourseResults.proposedGrade,
        proposedAt: officialCourseResults.proposedAt,
        officialGrade: officialCourseResults.officialGrade,
        officialRecordedAt: officialCourseResults.officialRecordedAt,
        conflictNote: officialCourseResults.conflictNote,
        enrollmentId: enrollments.id,
        enrollmentStatus: enrollments.status,
        attempt: enrollments.attempt,
        offeringId: courseOfferings.id,
        courseId: courses.id,
        courseCode: courses.code,
        courseTitle: courses.title,
        credits: courses.credits,
        termId: academicTerms.id,
        termCode: academicTerms.code,
        termName: academicTerms.name,
        academicYear: academicTerms.academicYear,
        termStartsAt: academicTerms.startsAt,
      })
      .from(officialCourseResults)
      .innerJoin(enrollments, eq(enrollments.id, officialCourseResults.enrollmentId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(and(...conditions))
      .orderBy(desc(academicTerms.startsAt), courses.code);
  }

  private get reader() {
    return this.txHost.reader();
  }

  /**
   * The programmes this student is actually studying, with the length that
   * gives their credits a denominator. Only `active` memberships: a graduated
   * one is history, and showing "50% complete" against a programme somebody
   * left would be worse than showing nothing.
   */
  async findMyProgrammes(
    institutionId: string,
    userId: string,
  ): Promise<ProgrammeEnrolmentRow[]> {
    return this.txHost
      .reader()
      .select({
        programId: programs.id,
        programCode: programs.code,
        programName: programs.name,
        studyYear: programMemberships.studyYear,
        standardLengthSemesters: programs.standardLengthSemesters,
      })
      .from(programMemberships)
      .innerJoin(programs, eq(programs.id, programMemberships.programId))
      .where(
        and(
          eq(programMemberships.institutionId, institutionId),
          eq(programMemberships.userId, userId),
          eq(programMemberships.status, 'active'),
          isNull(programMemberships.deletedAt),
          isNull(programs.deletedAt),
        ),
      )
      .orderBy(asc(programs.code));
  }
}

export interface ProgrammeEnrolmentRow {
  programId: string;
  programCode: string;
  programName: string;
  studyYear: number | null;
  standardLengthSemesters: number | null;
}
