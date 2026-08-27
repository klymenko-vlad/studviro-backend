import { Injectable } from '@nestjs/common';

import type {
  CourseOfferingStatus,
  EnrollmentRequirementType,
  EnrollmentStatus,
  TeachingRole,
} from '../../database/schema';

import {
  MyCoursesRepository,
  type EnrolledCourseFilter,
  type EnrolledCourseRow,
} from './my-courses.repository';
import { TeachingStaffRepository, type OfferingTeacherRow } from './teaching-staff.repository';

export interface EnrolledCourseTeacher {
  userId: string;
  displayName: string;
  role: TeachingRole;
  isPrimary: boolean;
}

export interface EnrolledCourse {
  enrollmentId: string;
  status: EnrollmentStatus;
  requirementType: EnrollmentRequirementType;
  attempt: number;
  enrolledAt: Date | null;
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
  teachers: EnrolledCourseTeacher[];
}

@Injectable()
export class MyCoursesService {
  constructor(
    private readonly repository: MyCoursesRepository,
    private readonly teachingStaff: TeachingStaffRepository,
  ) {}

  async listEnrolled(
    institutionId: string,
    userId: string,
    filter: EnrolledCourseFilter = {},
  ): Promise<EnrolledCourse[]> {
    const rows = await this.repository.findEnrolledCourses(institutionId, userId, filter);
    if (rows.length === 0) return [];

    const teachers = await this.teachingStaff.findByOfferings([
      ...new Set(rows.map((row) => row.offeringId)),
    ]);

    return rows.map((row) => this.compose(row, teachers));
  }

  private compose(row: EnrolledCourseRow, teachers: OfferingTeacherRow[]): EnrolledCourse {
    return {
      enrollmentId: row.enrollmentId,
      status: row.status,
      requirementType: row.requirementType,
      attempt: row.attempt,
      enrolledAt: row.enrolledAt,
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
      teachers: teachers
        .filter((teacher) => teacher.courseOfferingId === row.offeringId)
        .map(({ userId, displayName, role, isPrimary }) => ({
          userId,
          displayName,
          role,
          isPrimary,
        })),
    };
  }
}
