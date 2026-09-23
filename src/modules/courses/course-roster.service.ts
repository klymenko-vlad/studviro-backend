import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import type {
  EnrollmentRequirementType,
  EnrollmentStatus,
  StudyGroupKind,
} from '../../database/schema';
import { AuthorizationService } from '../authorization/authorization.service';

import { administersOfferings } from './administers-offering';
import { CourseOfferingRepository } from './course-offering.repository';
import {
  CourseRosterRepository,
  type RosterEnrollmentRow,
  type RosterStudyGroupRow,
} from './course-roster.repository';

export const ROSTER_VIEWER_ROLES = ['teacher', 'administrator'] as const;
export type RosterViewerRole = (typeof ROSTER_VIEWER_ROLES)[number];

export interface RosterStudent {
  enrollmentId: string;
  userId: string;
  displayName: string;
  email: string;
  status: EnrollmentStatus;
  requirementType: EnrollmentRequirementType;
  attempt: number;
  enrolledAt: Date | null;
  studyGroups: {
    id: string;
    kind: StudyGroupKind;
    code: string;
    name: string | null;
  }[];
}

export interface CourseRoster {
  offering: { id: string; capacity: number | null };
  course: { id: string; code: string; title: string; credits: number | null };
  viewerRole: RosterViewerRole;
  students: RosterStudent[];
}

@Injectable()
export class CourseRosterService {
  constructor(
    private readonly offerings: CourseOfferingRepository,
    private readonly roster: CourseRosterRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async findForViewer(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<CourseRoster> {
    const offering = await this.offerings.findOffering(institutionId, offeringId);
    if (!offering) throw new EntityNotFoundError('CourseOffering', offeringId);

    const viewerRole = await this.resolveViewerRole(institutionId, offeringId, userId);
    const enrollments = await this.roster.findEnrollments(offeringId);
    const studyGroups = await this.findStudyGroups(offeringId, enrollments);

    return {
      offering: { id: offering.offeringId, capacity: offering.capacity },
      course: {
        id: offering.courseId,
        code: offering.courseCode,
        title: offering.courseTitle,
        credits: offering.credits === null ? null : Number(offering.credits),
      },
      viewerRole,
      students: enrollments.map((row) => this.compose(row, studyGroups)),
    };
  }

  private async resolveViewerRole(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<RosterViewerRole> {
    if (await this.roster.teaches(offeringId, userId)) return 'teacher';

    const administers = await administersOfferings(this.authorization, userId, institutionId);
    if (!administers) throw new PermissionDeniedError();

    return 'administrator';
  }

  private findStudyGroups(
    offeringId: string,
    enrollments: RosterEnrollmentRow[],
  ): Promise<RosterStudyGroupRow[]> {
    if (enrollments.length === 0) return Promise.resolve([]);

    return this.roster.findStudyGroups(offeringId, [
      ...new Set(enrollments.map((row) => row.userId)),
    ]);
  }

  private compose(row: RosterEnrollmentRow, studyGroups: RosterStudyGroupRow[]): RosterStudent {
    return {
      enrollmentId: row.enrollmentId,
      userId: row.userId,
      displayName: row.displayName,
      email: row.email,
      status: row.status,
      requirementType: row.requirementType,
      attempt: row.attempt,
      enrolledAt: row.enrolledAt,
      studyGroups: studyGroups
        .filter((group) => group.userId === row.userId)
        .map(({ id, kind, code, name }) => ({ id, kind, code, name })),
    };
  }
}
