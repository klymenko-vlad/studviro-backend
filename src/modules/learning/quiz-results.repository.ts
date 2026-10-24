import { Injectable } from '@nestjs/common';
import { and, countDistinct, eq, inArray, sql } from 'drizzle-orm';
import { alias, type PgSelect } from 'drizzle-orm/pg-core';

import {
  questions,
  questionVersions,
  quizAttemptQuestions,
  quizAttempts,
  type AttemptResponse,
  type QuestionAnswerKey,
  type QuestionType,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { containsText } from './contains-pattern';

export interface QuestionTally {
  readonly questionId: string;
  readonly name: string;
  readonly type: QuestionType;
  readonly latestKey: QuestionAnswerKey;
  readonly attempts: number;
  readonly fullyRight: number;
  readonly awaitingMarking: number;
  readonly averageMark: number | null;
  readonly averageOutOf: number | null;
}

export interface ResultsQuery {
  readonly page: number;
  readonly limit: number;
  readonly q?: string;
}

export interface GivenAnswer {
  readonly questionId: string;
  readonly key: QuestionAnswerKey;
  readonly response: AttemptResponse | null;
}

const latest = alias(questionVersions, 'latest_version');
const effective = sql`coalesce(${quizAttemptQuestions.manualMark}, ${quizAttemptQuestions.autoMark})`;

@Injectable()
export class QuizResultsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async tallies(
    quizId: string,
    query: ResultsQuery,
  ): Promise<{ rows: QuestionTally[]; total: number }> {
    const where = and(
      eq(quizAttempts.learningActivityId, quizId),
      eq(quizAttempts.state, 'finished'),
      containsText([latest.name, latest.text], query.q),
    );

    const [rows, [counted]] = await Promise.all([
      this.joined(
        this.reader
          .select({
            questionId: questions.id,
            name: latest.name,
            type: questions.type,
            latestKey: latest.answerKey,
            attempts: sql<number>`count(*)::int`,
            fullyRight: sql<number>`(count(*) filter (where ${effective} >= ${quizAttemptQuestions.mark}))::int`,
            awaitingMarking: sql<number>`(count(*) filter (where ${effective} is null))::int`,
            averageMark: sql<string | null>`avg(${effective})`,
            averageOutOf: sql<
              string | null
            >`avg(${quizAttemptQuestions.mark}) filter (where ${effective} is not null)`,
          })
          .from(quizAttemptQuestions)
          .$dynamic(),
      )
        .where(where)
        .groupBy(questions.id, latest.name, latest.answerKey)
        .orderBy(sql`min(${quizAttemptQuestions.position})`, questions.id)
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.joined(
        this.reader
          .select({ total: countDistinct(questions.id) })
          .from(quizAttemptQuestions)
          .$dynamic(),
      ).where(where),
    ]);

    return {
      rows: rows.map((row) => ({
        ...row,
        averageMark: row.averageMark === null ? null : Number(row.averageMark),
        averageOutOf: row.averageOutOf === null ? null : Number(row.averageOutOf),
      })),
      total: counted?.total ?? 0,
    };
  }

  async answers(quizId: string, questionIds: readonly string[]): Promise<GivenAnswer[]> {
    if (questionIds.length === 0) return [];

    return this.reader
      .select({
        questionId: questionVersions.questionId,
        key: questionVersions.answerKey,
        response: quizAttemptQuestions.response,
      })
      .from(quizAttemptQuestions)
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAttemptQuestions.attemptId))
      .innerJoin(
        questionVersions,
        eq(questionVersions.id, quizAttemptQuestions.questionVersionId),
      )
      .where(
        and(
          eq(quizAttempts.learningActivityId, quizId),
          eq(quizAttempts.state, 'finished'),
          inArray(questionVersions.questionId, [...questionIds]),
        ),
      );
  }

  private joined<T extends PgSelect>(query: T) {
    return query
      .innerJoin(quizAttempts, eq(quizAttempts.id, quizAttemptQuestions.attemptId))
      .innerJoin(
        questionVersions,
        eq(questionVersions.id, quizAttemptQuestions.questionVersionId),
      )
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .innerJoin(
        latest,
        and(eq(latest.questionId, questions.id), eq(latest.version, questions.latestVersion)),
      );
  }

  private get reader() {
    return this.txHost.reader(undefined, true);
  }
}
