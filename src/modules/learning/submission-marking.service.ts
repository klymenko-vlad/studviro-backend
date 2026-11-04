import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { ConflictError, EntityNotFoundError } from '../../common/errors/domain.error';
import {
  assessments,
  submissions,
  type AssessmentResult,
  type Submission,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';
import { LearningActivityNotificationsService } from '../notifications/learning-activity-notifications.service';

import { AssessmentResultsRepository } from './assessment-results.repository';
import { CompletionService } from './completion.service';
import { LearningAccessService } from './learning-access.service';
import { SubmissionsService } from './submissions.service';

export interface NewMark {
  readonly points?: number | null;
  readonly feedback?: string | null;
}

export interface MarkedSubmission {
  readonly submission: Submission;
  readonly result: AssessmentResult;
}

/**
 * Points and a sentence, per submission. No rubric: the mark is one number
 * against the assignment's `assessment` row, which is the gradebook column the
 * offering's working grade already reads.
 */
@Injectable()
export class SubmissionMarkingService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: LearningAccessService,
    private readonly submissionsService: SubmissionsService,
    private readonly notifications: LearningActivityNotificationsService,
    private readonly completion: CompletionService,
    private readonly results: AssessmentResultsRepository,
  ) {}

  async mark(
    institutionId: string,
    assignmentId: string,
    submissionId: string,
    markerId: string,
    input: NewMark,
    now = new Date(),
  ): Promise<MarkedSubmission> {
    const { context } = await this.submissionsService.assignment(
      institutionId,
      assignmentId,
      markerId,
    );
    this.access.assertAuthor(context);

    const submission = await this.submissionsService.submissionOrFail(
      assignmentId,
      submissionId,
    );
    const assessment = await this.assessmentOrFail(assignmentId);

    const maxPoints = assessment.maxPoints === null ? null : Number(assessment.maxPoints);
    const points = input.points ?? null;

    if (points !== null && points < 0) {
      throw new ConflictError('MARK_NEGATIVE', 'A mark cannot be below zero', { points });
    }

    if (points !== null && maxPoints !== null && points > maxPoints) {
      throw new ConflictError(
        'MARK_ABOVE_MAX_POINTS',
        'That mark is above what this assignment is worth',
        { points, maxPoints },
      );
    }

    return this.txHost.run(async () => {
      const result = await this.results.record(
        { institutionId, assessmentId: assessment.id, userId: submission.userId },
        { points, maxPoints, feedback: input.feedback ?? null, markerId, now },
      );

      const [marked] = await this.client
        .update(submissions)
        .set({ state: 'graded' })
        .where(eq(submissions.id, submissionId))
        .returning();

      if (!marked) throw new EntityNotFoundError('submission', submissionId);

      await this.completion.recompute({ kind: 'assignment', id: assignmentId }, [
        submission.userId,
      ]);

      await this.notifications.marked(
        institutionId,
        {
          submissionId,
          learningActivityId: assignmentId,
          learningSpaceId: assessment.learningSpaceId,
          activityName: assessment.name,
          recipientId: submission.userId,
          points,
          maxPoints,
        },
        now,
      );

      return { submission: marked, result };
    });
  }

  private async assessmentOrFail(assignmentId: string) {
    const [row] = await this.client
      .select()
      .from(assessments)
      .where(
        and(eq(assessments.learningActivityId, assignmentId), isNull(assessments.deletedAt)),
      )
      .limit(1);

    if (!row) throw new EntityNotFoundError('assessment', assignmentId);

    return row;
  }

  private get client() {
    return this.txHost.client();
  }
}
