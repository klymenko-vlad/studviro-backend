import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  enrollments,
  studyGroupMemberships,
  studyGroups,
  teachingAssignments,
  users,
  type EnrollmentRequirementType,
  type EnrollmentStatus,
  type StudyGroupKind,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface RosterEnrollmentRow {
  enrollmentId: string;
  userId: string;
  displayName: string;
  email: string;
  status: EnrollmentStatus;
  requirementType: EnrollmentRequirementType;
  attempt: number;
  enrolledAt: Date | null;
}

export interface RosterStudyGroupRow {
  userId: string;
  id: string;
  kind: StudyGroupKind;
  code: string;
  name: string | null;
}

@Injectable()
export class CourseRosterRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async teaches(offeringId: string, userId: string): Promise<boolean> {
    const [row] = await this.reader
      .select({ id: teachingAssignments.id })
      .from(teachingAssignments)
      .where(
        and(
          eq(teachingAssignments.courseOfferingId, offeringId),
          eq(teachingAssignments.userId, userId),
          isNull(teachingAssignments.deletedAt),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  findEnrollments(offeringId: string): Promise<RosterEnrollmentRow[]> {
    return this.reader
      .select({
        enrollmentId: enrollments.id,
        userId: users.id,
        displayName: users.displayName,
        email: users.email,
        status: enrollments.status,
        requirementType: enrollments.requirementType,
        attempt: enrollments.attempt,
        enrolledAt: enrollments.enrolledAt,
      })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.userId))
      .where(
        and(
          eq(enrollments.courseOfferingId, offeringId),
          isNull(enrollments.deletedAt),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(users.displayName);
  }

  async findStudyGroups(offeringId: string, userIds: string[]): Promise<RosterStudyGroupRow[]> {
    if (userIds.length === 0) return [];

    return this.reader
      .select({
        userId: studyGroupMemberships.userId,
        id: studyGroups.id,
        kind: studyGroups.kind,
        code: studyGroups.code,
        name: studyGroups.name,
      })
      .from(studyGroupMemberships)
      .innerJoin(studyGroups, eq(studyGroups.id, studyGroupMemberships.studyGroupId))
      .where(
        and(
          eq(studyGroups.courseOfferingId, offeringId),
          inArray(studyGroupMemberships.userId, userIds),
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
