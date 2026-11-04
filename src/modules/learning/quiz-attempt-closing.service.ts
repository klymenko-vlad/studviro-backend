import { Injectable } from '@nestjs/common';

import type { QuizAttempt } from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { isOverdue } from './attempt-clock';
import { autoMarkOf } from './attempt-grading';
import { AttemptQuestionsRepository } from './attempt-questions.repository';
import { attemptScoreOf } from './attempt-score';
import { CompletionService } from './completion.service';
import { QuizAttemptsRepository } from './quiz-attempts.repository';
import { QuizGradebookService } from './quiz-gradebook.service';

export type CloseRequest = 'student' | 'deadline';

export interface OverdueScope {
  readonly quizId?: string;
  readonly userId?: string;
}

const BATCH = 50;
const MAX_BATCHES = 20;

@Injectable()
export class QuizAttemptClosingService {
  constructor(
    private readonly txHost: TransactionHost,
    private readonly attempts: QuizAttemptsRepository,
    private readonly questions: AttemptQuestionsRepository,
    private readonly gradebook: QuizGradebookService,
    private readonly completion: CompletionService,
  ) {}

  async close(attemptId: string, request: CloseRequest, now: Date): Promise<QuizAttempt> {
    return this.txHost.run(async () => {
      const attempt = await this.attempts.lock(attemptId);
      if (attempt.state === 'finished') return attempt;

      const byDeadline = request === 'deadline' || isOverdue(attempt.deadlineAt, now);
      const marks = await this.autoMark(attemptId);
      const grading = await this.attempts.gradingOf(attempt.learningActivityId);
      const score = attemptScoreOf(marks, Number(attempt.maxMarks), grading.maxPoints);

      const finished = await this.attempts.finish(attemptId, {
        finishedAt: byDeadline ? (attempt.deadlineAt ?? now) : now,
        closedBy: byDeadline ? (attempt.deadlineCause ?? 'quiz_close') : 'student',
        rawMarks: score.rawMarks.toFixed(4),
        points: score.points === null ? null : score.points.toFixed(4),
        needsMarking: score.needsMarking,
      });

      await this.gradebook.record(attempt, grading, now);
      await this.completion.recompute({ kind: 'quiz', id: attempt.learningActivityId }, [
        attempt.userId,
      ]);

      return finished;
    });
  }

  async closeOverdue(now: Date, scope: OverdueScope = {}): Promise<number> {
    let closed = 0;

    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const ids = await this.attempts.overdueIds(now, BATCH, scope.quizId, scope.userId);
      for (const id of ids) await this.close(id, 'deadline', now);
      closed += ids.length;
      if (ids.length < BATCH) break;
    }

    return closed;
  }

  private async autoMark(attemptId: string): Promise<(number | null)[]> {
    const asked = await this.questions.ofAttempt(attemptId);
    const marks: (number | null)[] = [];

    for (const question of asked) {
      const mark = autoMarkOf(
        question.type,
        question.answerKey,
        question.row.response,
        Number(question.row.mark),
      );
      await this.questions.setAutoMark(question.row.id, mark);
      marks.push(mark);
    }

    return marks;
  }
}
