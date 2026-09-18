import { Injectable } from '@nestjs/common';

import {
  isFailingGrade,
  isPassingGrade,
  isVoidedResult,
  type CourseGrade,
  type OfficialCourseResultStatus,
  type SourceSystem,
  type SynchronizationStatus,
} from '../../database/schema';

import {
  MyCourseResultsRepository,
  type MyCourseResultFilter,
  type MyCourseResultRow,
} from './my-course-results.repository';
import { summarizeStudyProgress, type StudyProgress } from './study-progress';

export const COURSE_RESULT_KINDS = ['calculated', 'proposed', 'official'] as const;
export type CourseResultKind = (typeof COURSE_RESULT_KINDS)[number];

export interface EffectiveCourseGrade {
  kind: CourseResultKind;
  grade: CourseGrade;
  passed: boolean;
}

export interface MyCourseResult {
  id: string;
  status: OfficialCourseResultStatus;
  attempt: number;
  conflictNote: string | null;
  effective: EffectiveCourseGrade | null;
  /** An annulled result has a grade on record and no standing. */
  isVoided: boolean;
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

  async summarize(institutionId: string, userId: string): Promise<StudyProgress> {
    return summarizeStudyProgress(await this.listMine(institutionId, userId));
  }

  private compose(row: MyCourseResultRow): MyCourseResult {
    return {
      id: row.resultId,
      status: row.status,
      attempt: row.attempt,
      conflictNote: row.conflictNote,
      effective: effectiveGrade(row),
      isVoided: isVoidedResult(row.status),
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

/**
 * The grade the student actually stands on. An annulled result has been struck,
 * so it has none — reading the three grade columns alone showed a grade the
 * registrar had already withdrawn.
 */
const effectiveGrade = (row: MyCourseResultRow): EffectiveCourseGrade | null => {
  if (isVoidedResult(row.status)) return null;

  const staged: readonly [CourseResultKind, CourseGrade | null][] = [
    ['official', row.officialGrade],
    ['proposed', row.proposedGrade],
    ['calculated', row.calculatedGrade],
  ];

  for (const [kind, grade] of staged) {
    if (grade) return { kind, grade, passed: isPassingGrade(grade) };
  }

  return null;
};

export function hasFailed(result: Pick<MyCourseResult, 'effective'>): boolean {
  return isFailingGrade(result.effective?.grade ?? null);
}

const toNumber = (value: string | null): number | null =>
  value === null ? null : Number(value);
