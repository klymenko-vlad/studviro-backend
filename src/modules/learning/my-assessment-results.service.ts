import { Injectable } from '@nestjs/common';

import type {
  ActivityCompletionState,
  LearningActivityType,
  SubmissionState,
} from '../../database/schema';

import {
  MyAssessmentResultsRepository,
  type MyAssessmentResultFilter,
  type MyAssessmentResultRow,
} from './my-assessment-results.repository';

export interface MyAssessmentResult {
  id: string;
  name: string;
  points: number | null;
  maxPoints: number | null;
  /** The share of the maximum, so two assessments scored differently compare. */
  percentage: number | null;
  feedback: string | null;
  gradedAt: Date | null;
  countsTowardFinalGrade: boolean;
  activity: {
    id: string;
    type: LearningActivityType;
    url: string | null;
    dueAt: Date | null;
    completionState: ActivityCompletionState | null;
    submission: { state: SubmissionState; submittedAt: Date | null; isLate: boolean } | null;
  } | null;
  learningSpace: { id: string; name: string };
  offering: { id: string } | null;
}

@Injectable()
export class MyAssessmentResultsService {
  constructor(private readonly repository: MyAssessmentResultsRepository) {}

  async listMine(
    institutionId: string,
    userId: string,
    filter: MyAssessmentResultFilter,
  ): Promise<MyAssessmentResult[]> {
    const rows = await this.repository.findMine(institutionId, userId, filter);

    return rows.map(compose);
  }
}

function compose(row: MyAssessmentResultRow): MyAssessmentResult {
  const points = numeric(row.points);
  const maxPoints = numeric(row.maxPoints);
  const normalized = numeric(row.normalizedScore);

  return {
    id: row.id,
    name: row.name,
    points,
    maxPoints,
    percentage: percentage(normalized, points, maxPoints),
    feedback: row.feedback,
    gradedAt: row.gradedAt,
    countsTowardFinalGrade: row.countsTowardFinalGrade,
    activity:
      row.activityId === null
        ? null
        : {
            id: row.activityId,
            type: row.activityType ?? 'other',
            url: row.activityUrl,
            dueAt: row.dueAt,
            completionState: row.completionState,
            submission:
              row.submissionState === null
                ? null
                : {
                    state: row.submissionState,
                    submittedAt: row.submittedAt,
                    isLate: row.submissionIsLate ?? false,
                  },
          },
    learningSpace: { id: row.spaceId, name: row.spaceName },
    offering: row.offeringId === null ? null : { id: row.offeringId },
  };
}

function numeric(value: string | null): number | null {
  if (value === null) return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The importer normalizes where it can; a result imported before the assessment
 * carried a maximum still has points and a maximum to divide here.
 */
function percentage(
  normalized: number | null,
  points: number | null,
  maxPoints: number | null,
): number | null {
  if (normalized !== null) return round(normalized * 100);
  if (points === null || maxPoints === null || maxPoints <= 0) return null;

  return round((points / maxPoints) * 100);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
