import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, lte, max, sql } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  assessments,
  learningActivities,
  quizAttempts,
  quizzes,
  type QuizAttempt,
  type QuizGradingMethod,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface AttemptGrading {
  readonly quizId: string;
  readonly gradingMethod: QuizGradingMethod;
  readonly assessmentId: string | null;
  readonly maxPoints: number | null;
}

export interface AttemptTally {
  readonly used: number;
  readonly lastNumber: number;
}

@Injectable()
export class QuizAttemptsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async lockStarting(quizId: string, userId: string): Promise<void> {
    await this.client.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`quiz-attempt:${quizId}:${userId}`}, 0))`,
    );
  }

  async openAttempt(quizId: string, userId: string): Promise<QuizAttempt | null> {
    const [row] = await this.client
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.learningActivityId, quizId),
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.state, 'in_progress'),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async tally(quizId: string, userId: string): Promise<AttemptTally> {
    const [row] = await this.client
      .select({ used: count(), lastNumber: max(quizAttempts.attempt) })
      .from(quizAttempts)
      .where(and(eq(quizAttempts.learningActivityId, quizId), eq(quizAttempts.userId, userId)));

    return { used: row?.used ?? 0, lastNumber: row?.lastNumber ?? 0 };
  }

  async insert(values: typeof quizAttempts.$inferInsert): Promise<QuizAttempt> {
    const [row] = await this.client.insert(quizAttempts).values(values).returning();
    if (!row) throw new EntityNotFoundError('quiz_attempt');

    return row;
  }

  async ownedOrFail(quizId: string, attemptId: string, userId: string): Promise<QuizAttempt> {
    const [row] = await this.client
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.id, attemptId),
          eq(quizAttempts.learningActivityId, quizId),
          eq(quizAttempts.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw new EntityNotFoundError('quiz_attempt', attemptId);

    return row;
  }

  async lock(attemptId: string): Promise<QuizAttempt> {
    const [row] = await this.client
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.id, attemptId))
      .for('update');
    if (!row) throw new EntityNotFoundError('quiz_attempt', attemptId);

    return row;
  }

  async finish(attemptId: string, changes: Partial<QuizAttempt>): Promise<QuizAttempt> {
    const [row] = await this.client
      .update(quizAttempts)
      .set({ ...changes, state: 'finished' })
      .where(eq(quizAttempts.id, attemptId))
      .returning();
    if (!row) throw new EntityNotFoundError('quiz_attempt', attemptId);

    return row;
  }

  async update(attemptId: string, changes: Partial<QuizAttempt>): Promise<QuizAttempt> {
    const [row] = await this.client
      .update(quizAttempts)
      .set(changes)
      .where(eq(quizAttempts.id, attemptId))
      .returning();
    if (!row) throw new EntityNotFoundError('quiz_attempt', attemptId);

    return row;
  }

  async inQuizOrFail(quizId: string, attemptId: string): Promise<QuizAttempt> {
    const [row] = await this.client
      .select()
      .from(quizAttempts)
      .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.learningActivityId, quizId)))
      .limit(1);
    if (!row) throw new EntityNotFoundError('quiz_attempt', attemptId);

    return row;
  }

  async finishedOfQuiz(quizId: string): Promise<QuizAttempt[]> {
    return this.client
      .select()
      .from(quizAttempts)
      .where(
        and(eq(quizAttempts.learningActivityId, quizId), eq(quizAttempts.state, 'finished')),
      )
      .orderBy(asc(quizAttempts.userId), asc(quizAttempts.attempt));
  }

  async lockQuiz(quizId: string): Promise<void> {
    await this.client.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`quiz-grades:${quizId}`}, 0))`,
    );
  }

  async overdueIds(
    now: Date,
    limit: number,
    quizId?: string,
    userId?: string,
  ): Promise<string[]> {
    const rows = await this.client
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.state, 'in_progress'),
          lte(quizAttempts.deadlineAt, now),
          quizId === undefined ? undefined : eq(quizAttempts.learningActivityId, quizId),
          userId === undefined ? undefined : eq(quizAttempts.userId, userId),
        ),
      )
      .orderBy(asc(quizAttempts.deadlineAt))
      .limit(limit);

    return rows.map((row) => row.id);
  }

  async finishedOf(quizId: string, userId: string): Promise<QuizAttempt[]> {
    return this.client
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.learningActivityId, quizId),
          eq(quizAttempts.userId, userId),
          eq(quizAttempts.state, 'finished'),
        ),
      )
      .orderBy(asc(quizAttempts.attempt));
  }

  async gradingOf(quizId: string): Promise<AttemptGrading> {
    const [row] = await this.client
      .select({
        gradingMethod: quizzes.gradingMethod,
        assessmentId: assessments.id,
        maxPoints: assessments.maxPoints,
      })
      .from(quizzes)
      .innerJoin(learningActivities, eq(learningActivities.id, quizzes.learningActivityId))
      .leftJoin(
        assessments,
        and(
          eq(assessments.learningActivityId, quizzes.learningActivityId),
          isNull(assessments.deletedAt),
          isNull(learningActivities.deletedAt),
        ),
      )
      .where(eq(quizzes.learningActivityId, quizId))
      .limit(1);
    if (!row) throw new EntityNotFoundError('quiz', quizId);

    return {
      quizId,
      gradingMethod: row.gradingMethod,
      assessmentId: row.assessmentId,
      maxPoints: row.maxPoints === null ? null : Number(row.maxPoints),
    };
  }

  private get client() {
    return this.txHost.client();
  }
}
