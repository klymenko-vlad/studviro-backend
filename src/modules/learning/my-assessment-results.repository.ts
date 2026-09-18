import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';

import {
  assessmentResults,
  assessments,
  learningActivities,
  learningSpaces,
  type ActivityCompletionState,
  type LearningActivityType,
  type SubmissionState,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface MyAssessmentResultRow {
  id: string;
  assessmentId: string;
  name: string;
  points: string | null;
  maxPoints: string | null;
  normalizedScore: string | null;
  feedback: string | null;
  gradedAt: Date | null;
  countsTowardFinalGrade: boolean;
  activityId: string | null;
  activityType: LearningActivityType | null;
  activityUrl: string | null;
  dueAt: Date | null;
  submissionState: SubmissionState | null;
  submittedAt: Date | null;
  submissionIsLate: boolean | null;
  completionState: ActivityCompletionState | null;
  spaceId: string;
  spaceName: string;
  offeringId: string | null;
}

export interface MyAssessmentResultFilter {
  offeringId?: string;
}

/** The newest attempt only — an earlier draft does not describe the work now. */
function latestSubmission<T>(userId: string, column: SQL): SQL<T> {
  return sql<T>`(
    select submission.${column} from submission_refs as submission
    where submission.learning_activity_id = ${learningActivities.id}
      and submission.user_id = ${userId}
      and submission.deleted_at is null
    order by submission.attempt desc
    limit 1
  )`;
}

@Injectable()
export class MyAssessmentResultsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  findMine(
    institutionId: string,
    userId: string,
    filter: MyAssessmentResultFilter,
  ): Promise<MyAssessmentResultRow[]> {
    const conditions: (SQL | undefined)[] = [
      eq(assessmentResults.institutionId, institutionId),
      eq(assessmentResults.userId, userId),
      isNull(assessmentResults.deletedAt),
      isNull(assessments.deletedAt),
      isNull(learningSpaces.deletedAt),
      eq(learningSpaces.visible, true),
    ];

    if (filter.offeringId) {
      conditions.push(eq(learningSpaces.courseOfferingId, filter.offeringId));
    }

    return this.reader
      .select({
        id: assessmentResults.id,
        assessmentId: assessments.id,
        name: assessments.name,
        points: assessmentResults.points,
        maxPoints: assessments.maxPoints,
        normalizedScore: assessmentResults.normalizedScore,
        feedback: assessmentResults.feedback,
        gradedAt: sql<Date | null>`${assessmentResults.gradedAt}`.mapWith(
          assessmentResults.gradedAt,
        ),
        countsTowardFinalGrade: assessments.countsTowardFinalGrade,
        activityId: learningActivities.id,
        activityType: learningActivities.type,
        activityUrl: learningActivities.url,
        dueAt: sql<Date | null>`${learningActivities.dueAt}`.mapWith(learningActivities.dueAt),
        submissionState: latestSubmission<SubmissionState | null>(userId, sql`state`),
        submittedAt: latestSubmission<Date | null>(userId, sql`submitted_at`).mapWith(
          learningActivities.dueAt,
        ),
        submissionIsLate: latestSubmission<boolean | null>(userId, sql`is_late`),
        completionState: sql<ActivityCompletionState | null>`(
          select completion.state from activity_completions as completion
          where completion.learning_activity_id = ${learningActivities.id}
            and completion.user_id = ${userId}
            and completion.deleted_at is null
          limit 1
        )`,
        spaceId: learningSpaces.id,
        spaceName: learningSpaces.name,
        offeringId: learningSpaces.courseOfferingId,
      })
      .from(assessmentResults)
      .innerJoin(assessments, eq(assessments.id, assessmentResults.assessmentId))
      .innerJoin(learningSpaces, eq(learningSpaces.id, assessments.learningSpaceId))
      .leftJoin(
        learningActivities,
        and(
          eq(learningActivities.id, assessments.learningActivityId),
          isNull(learningActivities.deletedAt),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(learningActivities.dueAt), asc(assessments.name));
  }

  private get reader() {
    return this.txHost.reader();
  }
}
