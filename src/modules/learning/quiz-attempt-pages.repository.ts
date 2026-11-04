import { Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  quizAttempts,
  users,
  type QuizAttempt,
  type QuizAttemptProgress,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { containsText } from './contains-pattern';

export interface AttemptPageQuery {
  readonly page: number;
  readonly limit: number;
  readonly state?: QuizAttemptProgress;
  readonly needsMarking?: boolean;
  readonly q?: string;
}

export interface AttemptStudent {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

export interface StudentAttempt {
  readonly attempt: QuizAttempt;
  readonly student: AttemptStudent;
}

@Injectable()
export class QuizAttemptPagesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async mine(
    quizId: string,
    userId: string,
    query: AttemptPageQuery,
  ): Promise<{ rows: QuizAttempt[]; total: number }> {
    const where = and(
      eq(quizAttempts.learningActivityId, quizId),
      eq(quizAttempts.userId, userId),
      query.state === undefined ? undefined : eq(quizAttempts.state, query.state),
    );
    const [rows, [counted]] = await Promise.all([
      this.reader
        .select()
        .from(quizAttempts)
        .where(where)
        .orderBy(desc(quizAttempts.attempt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.reader.select({ total: count() }).from(quizAttempts).where(where),
    ]);

    return { rows, total: counted?.total ?? 0 };
  }

  async all(
    quizId: string,
    query: AttemptPageQuery,
  ): Promise<{ rows: StudentAttempt[]; total: number }> {
    const where = and(
      eq(quizAttempts.learningActivityId, quizId),
      query.state === undefined ? undefined : eq(quizAttempts.state, query.state),
      query.needsMarking === undefined
        ? undefined
        : and(
            eq(quizAttempts.state, 'finished'),
            eq(quizAttempts.needsMarking, query.needsMarking),
          ),
      containsText([users.displayName, users.email], query.q),
    );
    const [rows, [counted]] = await Promise.all([
      this.reader
        .select({
          attempt: quizAttempts,
          student: { id: users.id, displayName: users.displayName, email: users.email },
        })
        .from(quizAttempts)
        .innerJoin(users, eq(users.id, quizAttempts.userId))
        .where(where)
        .orderBy(desc(quizAttempts.startedAt), desc(quizAttempts.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.reader
        .select({ total: count() })
        .from(quizAttempts)
        .innerJoin(users, eq(users.id, quizAttempts.userId))
        .where(where),
    ]);

    return { rows, total: counted?.total ?? 0 };
  }

  async one(quizId: string, attemptId: string): Promise<StudentAttempt> {
    const [row] = await this.txHost
      .client()
      .select({
        attempt: quizAttempts,
        student: { id: users.id, displayName: users.displayName, email: users.email },
      })
      .from(quizAttempts)
      .innerJoin(users, eq(users.id, quizAttempts.userId))
      .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.learningActivityId, quizId)))
      .limit(1);
    if (!row) throw new EntityNotFoundError('quiz_attempt', attemptId);

    return row;
  }

  private get reader() {
    return this.txHost.reader(undefined, true);
  }
}
