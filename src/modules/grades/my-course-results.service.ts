import { Injectable } from '@nestjs/common';

import type {
  CourseGrade,
  OfficialCourseResultStatus,
  SourceSystem,
  SynchronizationStatus,
} from '../../database/schema';

import {
  MyCourseResultsRepository,
  type MyCourseResultFilter,
  type MyCourseResultRow,
} from './my-course-results.repository';

export const COURSE_RESULT_KINDS = ['calculated', 'proposed', 'official'] as const;
export type CourseResultKind = (typeof COURSE_RESULT_KINDS)[number];

export interface EffectiveCourseGrade {
  kind: CourseResultKind;
  grade: CourseGrade;
}

export interface MyCourseResult {
  id: string;
  status: OfficialCourseResultStatus;
  attempt: number;
  conflictNote: string | null;
  effective: EffectiveCourseGrade | null;
  calculated: { grade: CourseGrade | null; points: number | null };
  proposed: { grade: CourseGrade | null; at: Date | null };
  official: { grade: CourseGrade | null; recordedAt: Date | null };
  provenance: {
    sourceSystem: SourceSystem;
    externalId: string | null;
    sourceUpdatedAt: Date | null;
    lastSynchronizedAt: Date | null;
    synchronizationStatus: SynchronizationStatus;
  };
  enrollmentId: string;
  offering: { id: string };
  course: { id: string; code: string; title: string; credits: number | null };
  term: { id: string; code: string; name: string; academicYear: string; startsAt: Date };
}

@Injectable()
export class MyCourseResultsService {
  constructor(private readonly repository: MyCourseResultsRepository) {}

  async listMine(
    institutionId: string,
    userId: string,
    filter: MyCourseResultFilter = {},
  ): Promise<MyCourseResult[]> {
    const rows = await this.repository.findMyResults(institutionId, userId, filter);

    return rows.map((row) => this.compose(row));
  }

  private compose(row: MyCourseResultRow): MyCourseResult {
    return {
      id: row.resultId,
      status: row.status,
      attempt: row.attempt,
      conflictNote: row.conflictNote,
      effective: effectiveGrade(row),
      calculated: { grade: row.calculatedGrade, points: toNumber(row.calculatedPoints) },
      proposed: { grade: row.proposedGrade, at: row.proposedAt },
      official: { grade: row.officialGrade, recordedAt: row.officialRecordedAt },
      provenance: {
        sourceSystem: row.sourceSystem,
        externalId: row.externalId,
        sourceUpdatedAt: row.sourceUpdatedAt,
        lastSynchronizedAt: row.lastSynchronizedAt,
        synchronizationStatus: row.synchronizationStatus,
      },
      enrollmentId: row.enrollmentId,
      offering: { id: row.offeringId },
      course: {
        id: row.courseId,
        code: row.courseCode,
        title: row.courseTitle,
        credits: toNumber(row.credits),
      },
      term: {
        id: row.termId,
        code: row.termCode,
        name: row.termName,
        academicYear: row.academicYear,
        startsAt: row.termStartsAt,
      },
    };
  }
}

const effectiveGrade = (row: MyCourseResultRow): EffectiveCourseGrade | null => {
  if (row.officialGrade) return { kind: 'official', grade: row.officialGrade };
  if (row.proposedGrade) return { kind: 'proposed', grade: row.proposedGrade };
  if (row.calculatedGrade) return { kind: 'calculated', grade: row.calculatedGrade };

  return null;
};

const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);
