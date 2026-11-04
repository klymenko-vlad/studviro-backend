import { Injectable } from '@nestjs/common';

import { TransactionHost } from '../../database/transaction.host';

import { rounded } from './attempt-grading';
import { AttemptQuestionsRepository, type AskedQuestion } from './attempt-questions.repository';
import { numberOf } from './attempt-score';
import { QuizAttemptAccessService, type QuizAt } from './quiz-attempt-access.service';
import { QuizAttemptClosingService } from './quiz-attempt-closing.service';
import { QuizAttemptScoringService } from './quiz-attempt-scoring.service';
import { QuizAttemptsRepository, type AttemptGrading } from './quiz-attempts.repository';
import { planRegrade, type RegradeAttempt, type RegradePlan } from './quiz-regrade-plan';

export interface RegradeSummary {
  readonly outdatedAttempts: number;
  readonly incompatible: number;
  readonly regradedAttempts: number;
  readonly changedAttempts: number;
  readonly changedStudents: number;
  readonly largestRise: number;
  readonly largestFall: number;
  readonly applied: boolean;
}

@Injectable()
export class QuizRegradeService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly access: QuizAttemptAccessService,
    private readonly attempts: QuizAttemptsRepository,
    private readonly questions: AttemptQuestionsRepository,
    private readonly closing: QuizAttemptClosingService,
    private readonly scoring: QuizAttemptScoringService,
  ) {}

  async preview(at: QuizAt, now = new Date()): Promise<RegradeSummary> {
    await this.access.forAuthor(at);
    await this.closing.closeOverdue(now, { quizId: at.quizId });

    const { plan } = await this.plan(at.quizId);

    return summaryOf(plan, false);
  }

  async apply(at: QuizAt, now = new Date()): Promise<RegradeSummary> {
    const entry = await this.access.forAuthor(at);
    await this.closing.closeOverdue(now, { quizId: at.quizId });

    return this.txHost.run(async () => {
      await this.attempts.lockQuiz(at.quizId);
      const { plan, grading } = await this.plan(at.quizId);

      for (const update of plan.updates) {
        for (const question of update.questions) {
          await this.questions.moveVersion(
            question.rowId,
            question.versionId,
            question.autoMark,
          );
        }
        await this.attempts.update(update.attemptId, {
          rawMarks: update.rawMarks.toFixed(4),
          points: update.points === null ? null : update.points.toFixed(4),
        });
      }
      await this.scoring.settle({
        institutionId: entry.activity.institutionId,
        quizId: at.quizId,
        userIds: plan.updates.map((update) => update.userId),
        grading,
        now,
        markerId: at.userId,
      });

      return summaryOf(plan, true);
    });
  }

  private async plan(quizId: string): Promise<{ plan: RegradePlan; grading: AttemptGrading }> {
    const grading = await this.attempts.gradingOf(quizId);
    const finished = await this.attempts.finishedOfQuiz(quizId);
    const asked = await this.questions.ofAttempts(finished.map((attempt) => attempt.id));
    const latest = await this.questions.latestVersions(
      [...new Set(asked.map((question) => question.questionId))],
      true,
    );

    const byAttempt = new Map<string, AskedQuestion[]>();
    for (const question of asked) {
      const own = byAttempt.get(question.row.attemptId);
      if (own) own.push(question);
      else byAttempt.set(question.row.attemptId, [question]);
    }
    const attempts: RegradeAttempt[] = finished.map((attempt) => ({
      id: attempt.id,
      userId: attempt.userId,
      attempt: attempt.attempt,
      maxMarks: Number(attempt.maxMarks),
      points: numberOf(attempt.points),
      needsMarking: attempt.needsMarking,
      questions: (byAttempt.get(attempt.id) ?? []).map((question) => ({
        rowId: question.row.id,
        questionId: question.questionId,
        versionId: question.versionId,
        type: question.type,
        key: question.answerKey,
        mark: Number(question.row.mark),
        response: question.row.response,
        autoMark: numberOf(question.row.autoMark),
        manualMark: numberOf(question.row.manualMark),
      })),
    }));

    const plan = planRegrade(
      attempts,
      new Map(
        [...latest].map(([questionId, version]) => [
          questionId,
          { versionId: version.versionId, key: version.answerKey },
        ]),
      ),
      { method: grading.gradingMethod, maxPoints: grading.maxPoints },
    );

    return { plan, grading };
  }
}

function summaryOf(plan: RegradePlan, applied: boolean): RegradeSummary {
  const deltas = plan.students.map((change) => (change.after ?? 0) - (change.before ?? 0));

  return {
    outdatedAttempts: plan.outdatedAttempts,
    incompatible: plan.incompatible,
    regradedAttempts: plan.updates.length,
    changedAttempts: plan.updates.filter((update) => update.changed).length,
    changedStudents: plan.students.length,
    largestRise: rounded(Math.max(0, ...deltas)),
    largestFall: rounded(Math.max(0, ...deltas.map((delta) => -delta))),
    applied,
  };
}
