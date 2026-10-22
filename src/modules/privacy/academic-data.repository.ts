import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  courseOfferings,
  courses,
  enrollments,
  examRegistrations,
  examTerms,
  officialCourseResults,
  programMemberships,
  programs,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import type {
  ExportedCourseResult,
  ExportedEnrollment,
  ExportedExamRegistration,
  ExportedProgramMembership,
  ExportedStudyGroupMembership,
  ExportedTeachingAssignment,
} from './personal-data.types';

function decimal(value: string | null): number | null {
  return value === null ? null : Number(value);
}

/**
 * The half of the export ADR 0030 keeps through an erasure. Every read joins
 * the course or programme the row hangs off, because a transcript of bare
 * uuids answers Article 15 in form and not in substance.
 */
@Injectable()
export class AcademicDataRepository {
  constructor(private readonly txHost: TransactionHost) {}

  teachingAssignments(
    institutionId: string,
    userId: string,
  ): Promise<ExportedTeachingAssignment[]> {
    return this.reader
      .select({
        courseOfferingId: teachingAssignments.courseOfferingId,
        courseCode: courses.code,
        courseTitle: courses.title,
        role: teachingAssignments.role,
        isPrimary: teachingAssignments.isPrimary,
      })
      .from(teachingAssignments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, teachingAssignments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(teachingAssignments.institutionId, institutionId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .orderBy(asc(courses.code));
  }

  programMemberships(
    institutionId: string,
    userId: string,
  ): Promise<ExportedProgramMembership[]> {
    return this.reader
      .select({
        programId: programMemberships.programId,
        programCode: programs.code,
        programName: programs.name,
        status: programMemberships.status,
        studyYear: programMemberships.studyYear,
        startedAt: programMemberships.startedAt,
        endedAt: programMemberships.endedAt,
      })
      .from(programMemberships)
      .innerJoin(programs, eq(programs.id, programMemberships.programId))
      .where(
        and(
          eq(programMemberships.institutionId, institutionId),
          eq(programMemberships.userId, userId),
          isNull(programMemberships.deletedAt),
        ),
      )
      .orderBy(asc(programs.code));
  }

  enrollments(institutionId: string, userId: string): Promise<ExportedEnrollment[]> {
    return this.reader
      .select({
        id: enrollments.id,
        courseOfferingId: enrollments.courseOfferingId,
        courseCode: courses.code,
        courseTitle: courses.title,
        status: enrollments.status,
        requirementType: enrollments.requirementType,
        attempt: enrollments.attempt,
        enrolledAt: enrollments.enrolledAt,
        withdrawnAt: enrollments.withdrawnAt,
      })
      .from(enrollments)
      .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(enrollments.institutionId, institutionId),
          eq(enrollments.userId, userId),
          isNull(enrollments.deletedAt),
        ),
      )
      .orderBy(asc(courses.code), asc(enrollments.attempt));
  }

  async courseResults(institutionId: string, userId: string): Promise<ExportedCourseResult[]> {
    const rows = await this.reader
      .select({
        enrollmentId: officialCourseResults.enrollmentId,
        courseCode: courses.code,
        status: officialCourseResults.status,
        attempt: officialCourseResults.attempt,
        calculatedPoints: officialCourseResults.calculatedPoints,
        calculatedGrade: officialCourseResults.calculatedGrade,
        proposedGrade: officialCourseResults.proposedGrade,
        proposedAt: officialCourseResults.proposedAt,
        officialGrade: officialCourseResults.officialGrade,
        officialRecordedAt: officialCourseResults.officialRecordedAt,
        conflictNote: officialCourseResults.conflictNote,
      })
      .from(officialCourseResults)
      .innerJoin(enrollments, eq(enrollments.id, officialCourseResults.enrollmentId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, enrollments.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(officialCourseResults.institutionId, institutionId),
          eq(enrollments.userId, userId),
          isNull(officialCourseResults.deletedAt),
        ),
      )
      .orderBy(asc(courses.code), asc(officialCourseResults.attempt));

    return rows.map((row) => ({ ...row, calculatedPoints: decimal(row.calculatedPoints) }));
  }

  examRegistrations(
    institutionId: string,
    userId: string,
  ): Promise<ExportedExamRegistration[]> {
    return this.reader
      .select({
        examTermId: examRegistrations.examTermId,
        courseCode: courses.code,
        status: examRegistrations.status,
        startsAt: examTerms.startsAt,
        registeredAt: examRegistrations.registeredAt,
        cancelledAt: examRegistrations.cancelledAt,
      })
      .from(examRegistrations)
      .innerJoin(examTerms, eq(examTerms.id, examRegistrations.examTermId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, examTerms.courseOfferingId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(
        and(
          eq(examRegistrations.institutionId, institutionId),
          eq(examRegistrations.userId, userId),
          isNull(examRegistrations.deletedAt),
        ),
      )
      .orderBy(asc(examTerms.startsAt));
  }

  studyGroupMemberships(
    institutionId: string,
    userId: string,
  ): Promise<ExportedStudyGroupMembership[]> {
    return this.reader
      .select({
        studyGroupId: studyGroupMemberships.studyGroupId,
        code: studyGroups.code,
        courseOfferingId: studyGroups.courseOfferingId,
      })
      .from(studyGroupMemberships)
      .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMemberships.studyGroupId))
      .where(
        and(
          eq(studyGroupMemberships.institutionId, institutionId),
          eq(studyGroupMemberships.userId, userId),
          isNull(studyGroupMemberships.deletedAt),
        ),
      )
      .orderBy(asc(studyGroups.code));
  }

  private get reader() {
    return this.txHost.reader();
  }
}
