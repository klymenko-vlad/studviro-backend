import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import {
  academicTerms,
  courseOfferings,
  courses,
  enrollments,
  studyGroupMemberships,
  studyGroups,
  type CourseOfferingStatus,
  type EnrollmentRequirementType,
  type EnrollmentStatus,
  type StudyGroupKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { holdsCourseRecord } from './holds-course-record';

export interface OfferingDetailRow {
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

export interface ViewerEnrollmentRow {
  enrollmentId: string;
  status: EnrollmentStatus;
  requirementType: EnrollmentRequirementType;
  attempt: number;
  enrolledAt: Date | null;
}

export interface ViewerStudyGroupRow {
  id: string;
  kind: StudyGroupKind;
  code: string;
  name: string | null;
  capacity: number | null;
}

@Injectable()
export class CourseOfferingRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async findOffering(
    institutionId: string,
    offeringId: string,
  ): Promise<OfferingDetailRow | undefined> {
    const [row] = await this.reader
      .select({
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
      .from(courseOfferings)
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(academicTerms, eq(academicTerms.id, courseOfferings.academicTermId))
      .where(
        and(
          eq(courseOfferings.id, offeringId),
          eq(courseOfferings.institutionId, institutionId),
          isNull(courseOfferings.deletedAt),
          isNull(courses.deletedAt),
          isNull(academicTerms.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  async findViewerEnrollment(
    offeringId: string,
    userId: string,
  ): Promise<ViewerEnrollmentRow | undefined> {
    const [row] = await this.reader
      .select({
        enrollmentId: enrollments.id,
        status: enrollments.status,
        requirementType: enrollments.requirementType,
        attempt: enrollments.attempt,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          eq(enrollments.userId, userId),
          holdsCourseRecord(),
          isNull(enrollments.deletedAt),
        ),
      )
      .limit(1);

    return row;
  }

  findViewerStudyGroups(offeringId: string, userId: string): Promise<ViewerStudyGroupRow[]> {
    return this.reader
      .select({
        id: studyGroups.id,
        kind: studyGroups.kind,
        code: studyGroups.code,
        name: studyGroups.name,
        capacity: studyGroups.capacity,
      })
      .from(studyGroupMemberships)
      .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMemberships.studyGroupId))
      .where(
        and(
          eq(studyGroups.courseOfferingId, offeringId),
          eq(studyGroupMemberships.userId, userId),
          isNull(studyGroupMemberships.deletedAt),
          isNull(studyGroups.deletedAt),
        ),
      )
      .orderBy(studyGroups.code);
  }

  private get reader() {
    return this.txHost.reader();
  }
}
