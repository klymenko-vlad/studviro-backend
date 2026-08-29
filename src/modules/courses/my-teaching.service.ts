import { Injectable } from '@nestjs/common';

import type { CourseOfferingStatus, TeachingRole } from '../../database/schema';

import {
  MyTeachingRepository,
  type OfferingEnrollmentCountRow,
  type TeachingOfferingFilter,
  type TeachingOfferingRow,
} from './my-teaching.repository';

export interface TeachingOffering {
  assignmentId: string;
  role: TeachingRole;
  isPrimary: boolean;
  enrolledCount: number;
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
}

@Injectable()
export class MyTeachingService {
  constructor(private readonly repository: MyTeachingRepository) {}

  async listTeaching(
    institutionId: string,
    userId: string,
    filter: TeachingOfferingFilter = {},
  ): Promise<TeachingOffering[]> {
    const rows = await this.repository.findTeachingOfferings(institutionId, userId, filter);
    if (rows.length === 0) return [];

    const counts = await this.repository.countEnrollments([
      ...new Set(rows.map((row) => row.offeringId)),
    ]);

    return rows.map((row) => this.compose(row, counts));
  }

  private compose(
    row: TeachingOfferingRow,
    counts: OfferingEnrollmentCountRow[],
  ): TeachingOffering {
    return {
      assignmentId: row.assignmentId,
      role: row.role,
      isPrimary: row.isPrimary,
      enrolledCount:
        counts.find((entry) => entry.courseOfferingId === row.offeringId)?.enrolled ?? 0,
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
