import { Injectable } from '@nestjs/common';

import { EntityNotFoundError, PermissionDeniedError } from '../../common/errors/domain.error';
import type {
  CourseOfferingStatus,
  EnrollmentRequirementType,
  EnrollmentStatus,
  StudyGroupKind,
  TeachingRole,
} from '../../database/schema';
import { AuthorizationService } from '../authorization/authorization.service';

import { administersOfferings } from './administers-offering';
import {
  CourseOfferingRepository,
  type OfferingDetailRow,
  type ViewerEnrollmentRow,
} from './course-offering.repository';
import { TeachingStaffRepository } from './teaching-staff.repository';

export const OFFERING_VIEWER_ROLES = ['student', 'teacher', 'administrator'] as const;
export type OfferingViewerRole = (typeof OFFERING_VIEWER_ROLES)[number];

export interface CourseOfferingDetail {
  offering: {
    id: string;
    status: CourseOfferingStatus;
    language: string | null;
    capacity: number | null;
  };
  course: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    credits: number | null;
  };
  term: {
    id: string;
    code: string;
    name: string;
    academicYear: string;
    startsAt: Date;
    endsAt: Date;
  };
  teachers: {
    userId: string;
    displayName: string;
    role: TeachingRole;
    isPrimary: boolean;
  }[];
  enrollment: {
    enrollmentId: string;
    status: EnrollmentStatus;
    requirementType: EnrollmentRequirementType;
    attempt: number;
    enrolledAt: Date | null;
  } | null;
  studyGroups: {
    id: string;
    kind: StudyGroupKind;
    code: string;
    name: string | null;
    capacity: number | null;
  }[];
  viewerRole: OfferingViewerRole;
}

@Injectable()
export class CourseOfferingService {
  constructor(
    private readonly repository: CourseOfferingRepository,
    private readonly teachingStaff: TeachingStaffRepository,
    private readonly authorization: AuthorizationService,
  ) {}

  async findForViewer(
    institutionId: string,
    offeringId: string,
    userId: string,
  ): Promise<CourseOfferingDetail> {
    const offering = await this.repository.findOffering(institutionId, offeringId);
    if (!offering) throw new EntityNotFoundError('CourseOffering', offeringId);

    const [enrollment, teachers] = await Promise.all([
      this.repository.findViewerEnrollment(offeringId, userId),
      this.teachingStaff.findByOfferings([offeringId]),
    ]);

    const viewerRole = await this.resolveViewerRole(
      institutionId,
      userId,
      enrollment,
      teachers.some((teacher) => teacher.userId === userId),
    );

    const studyGroups = await this.repository.findViewerStudyGroups(offeringId, userId);

    return {
      ...this.composeOffering(offering),
      teachers: teachers.map(({ userId, displayName, role, isPrimary }) => ({
        userId,
        displayName,
        role,
        isPrimary,
      })),
      enrollment: enrollment ?? null,
      studyGroups,
      viewerRole,
    };
  }

  private async resolveViewerRole(
    institutionId: string,
    userId: string,
    enrollment: ViewerEnrollmentRow | undefined,
    teaches: boolean,
  ): Promise<OfferingViewerRole> {
    if (teaches) return 'teacher';
    if (enrollment) return 'student';

    const administers = await administersOfferings(this.authorization, userId, institutionId);
    if (!administers) throw new PermissionDeniedError();

    return 'administrator';
  }

  private composeOffering(
    row: OfferingDetailRow,
  ): Pick<CourseOfferingDetail, 'offering' | 'course' | 'term'> {
    return {
      offering: {
        id: row.offeringId,
        status: row.offeringStatus,
        language: row.language,
        capacity: row.capacity,
      },
      course: {
        id: row.courseId,
        code: row.courseCode,
        title: row.courseTitle,
        description: row.courseDescription,
        credits: row.credits === null ? null : Number(row.credits),
      },
      term: {
        id: row.termId,
        code: row.termCode,
        name: row.termName,
        academicYear: row.academicYear,
        startsAt: row.termStartsAt,
        endsAt: row.termEndsAt,
      },
    };
  }
}
