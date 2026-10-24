import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';

import {
  questions,
  questionVersions,
  quizAttemptQuestions,
  type AttemptResponse,
  type QuestionAnswerKey,
  type QuestionType,
  type QuizAttemptQuestion,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

export interface AskedVersion {
  readonly versionId: string;
  readonly type: QuestionType;
  readonly text: string;
  readonly answerKey: QuestionAnswerKey;
}

export interface AskedQuestion extends AskedVersion {
  readonly row: QuizAttemptQuestion;
}

@Injectable()
export class AttemptQuestionsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async pools(spaceId: string, categoryIds: readonly string[]): Promise<Map<string, string[]>> {
    const pools = new Map<string, string[]>();
    if (categoryIds.length === 0) return pools;

    const rows = await this.client
      .select({ id: questions.id, categoryId: questions.categoryId })
      .from(questions)
      .where(
        and(
          eq(questions.learningSpaceId, spaceId),
          inArray(questions.categoryId, [...categoryIds]),
          isNull(questions.deletedAt),
        ),
      )
      .orderBy(asc(questions.createdAt), asc(questions.id));
    for (const row of rows)
      pools.set(row.categoryId, [...(pools.get(row.categoryId) ?? []), row.id]);

    return pools;
  }

  async latestVersions(questionIds: readonly string[]): Promise<Map<string, AskedVersion>> {
    if (questionIds.length === 0) return new Map();

    const rows = await this.client
      .select({
        questionId: questions.id,
        versionId: questionVersions.id,
        type: questions.type,
        text: questionVersions.text,
        answerKey: questionVersions.answerKey,
      })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.version, questions.latestVersion),
        ),
      )
      .where(and(inArray(questions.id, [...questionIds]), isNull(questions.deletedAt)));

    return new Map(rows.map(({ questionId, ...version }) => [questionId, version]));
  }

  async insert(values: (typeof quizAttemptQuestions.$inferInsert)[]): Promise<void> {
    if (values.length === 0) return;

    await this.client.insert(quizAttemptQuestions).values(values);
  }

  async ofAttempt(attemptId: string): Promise<AskedQuestion[]> {
    return this.asked(eq(quizAttemptQuestions.attemptId, attemptId));
  }

  async at(attemptId: string, position: number): Promise<AskedQuestion | null> {
    const [row] = await this.asked(
      and(
        eq(quizAttemptQuestions.attemptId, attemptId),
        eq(quizAttemptQuestions.position, position),
      ),
    );

    return row ?? null;
  }

  async saveResponse(
    id: string,
    response: AttemptResponse | null,
    now: Date,
  ): Promise<QuizAttemptQuestion> {
    const [row] = await this.client
      .update(quizAttemptQuestions)
      .set({ response, answeredAt: response === null ? null : now })
      .where(eq(quizAttemptQuestions.id, id))
      .returning();
    if (!row) throw new Error(`attempt question ${id} vanished while it was answered`);

    return row;
  }

  async setAutoMark(id: string, autoMark: number | null): Promise<void> {
    await this.client
      .update(quizAttemptQuestions)
      .set({ autoMark: autoMark === null ? null : autoMark.toFixed(4) })
      .where(eq(quizAttemptQuestions.id, id));
  }

  private async asked(where: ReturnType<typeof and>): Promise<AskedQuestion[]> {
    const rows = await this.client
      .select({
        row: quizAttemptQuestions,
        versionId: questionVersions.id,
        type: questions.type,
        text: questionVersions.text,
        answerKey: questionVersions.answerKey,
      })
      .from(quizAttemptQuestions)
      .innerJoin(
        questionVersions,
        eq(questionVersions.id, quizAttemptQuestions.questionVersionId),
      )
      .innerJoin(questions, eq(questions.id, questionVersions.questionId))
      .where(where)
      .orderBy(asc(quizAttemptQuestions.position));

    return rows;
  }

  private get client() {
    return this.txHost.client();
  }
}
