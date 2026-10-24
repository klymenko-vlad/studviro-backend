import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, sql } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  learningActivities,
  questionCategories,
  questions,
  questionVersions,
  quizSlots,
  type Question,
  type QuestionType,
  type QuestionVersion,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { containsText } from './contains-pattern';

export interface QuestionQuery {
  readonly page: number;
  readonly limit: number;
  readonly categoryId?: string;
  readonly type?: QuestionType;
  readonly q?: string;
}

export interface QuestionEntry {
  readonly question: Question;
  readonly version: QuestionVersion;
  readonly categoryName: string;
}

export type NewVersion = Omit<
  typeof questionVersions.$inferInsert,
  'id' | 'questionId' | 'version' | 'createdAt'
>;

@Injectable()
export class QuestionsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async page(
    spaceId: string,
    query: QuestionQuery,
  ): Promise<{ entries: QuestionEntry[]; total: number }> {
    const where = and(
      eq(questions.learningSpaceId, spaceId),
      isNull(questions.deletedAt),
      query.categoryId === undefined ? undefined : eq(questions.categoryId, query.categoryId),
      query.type === undefined ? undefined : eq(questions.type, query.type),
      containsText([questionVersions.name, questionVersions.text], query.q),
    );
    const reader = this.txHost.reader();
    const [entries, [counted]] = await Promise.all([
      this.joined(reader)
        .where(where)
        .orderBy(asc(sql`lower(${questionVersions.name})`), asc(questions.createdAt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      reader
        .select({ total: count() })
        .from(questions)
        .innerJoin(questionVersions, latestVersionOf())
        .where(where),
    ]);

    return { entries, total: counted?.total ?? 0 };
  }

  async findLatest(spaceId: string, questionId: string): Promise<QuestionEntry | null> {
    const [entry] = await this.joined(this.client)
      .where(
        and(
          eq(questions.id, questionId),
          eq(questions.learningSpaceId, spaceId),
          isNull(questions.deletedAt),
        ),
      )
      .limit(1);

    return entry ?? null;
  }

  async findLatestOrFail(spaceId: string, questionId: string): Promise<QuestionEntry> {
    const entry = await this.findLatest(spaceId, questionId);
    if (!entry) throw new EntityNotFoundError('question', questionId);

    return entry;
  }

  async insert(values: typeof questions.$inferInsert, content: NewVersion): Promise<Question> {
    const [question] = await this.client.insert(questions).values(values).returning();
    if (!question) throw new EntityNotFoundError('learning_space', values.learningSpaceId);

    await this.client
      .insert(questionVersions)
      .values({ ...content, questionId: question.id, version: 1 });

    return question;
  }

  async appendVersion(question: Question, content: NewVersion | null, categoryId: string) {
    const version = content === null ? question.latestVersion : question.latestVersion + 1;

    if (content !== null) {
      await this.client
        .insert(questionVersions)
        .values({ ...content, questionId: question.id, version });
    }

    await this.client
      .update(questions)
      .set({ latestVersion: version, categoryId })
      .where(eq(questions.id, question.id));
  }

  async versions(
    questionId: string,
    page: { page: number; limit: number },
  ): Promise<{ versions: QuestionVersion[]; total: number }> {
    const reader = this.txHost.reader();
    const where = eq(questionVersions.questionId, questionId);
    const [versions, [counted]] = await Promise.all([
      reader
        .select()
        .from(questionVersions)
        .where(where)
        .orderBy(desc(questionVersions.version))
        .limit(page.limit)
        .offset((page.page - 1) * page.limit),
      reader.select({ total: count() }).from(questionVersions).where(where),
    ]);

    return { versions, total: counted?.total ?? 0 };
  }

  async placedInQuiz(questionId: string): Promise<boolean> {
    const [row] = await this.client
      .select({ id: quizSlots.id })
      .from(quizSlots)
      .innerJoin(learningActivities, eq(learningActivities.id, quizSlots.learningActivityId))
      .where(and(eq(quizSlots.questionId, questionId), isNull(learningActivities.deletedAt)))
      .limit(1);

    return row !== undefined;
  }

  async tombstone(questionId: string): Promise<void> {
    await this.client
      .update(questions)
      .set({ deletedAt: new Date() })
      .where(eq(questions.id, questionId));
  }

  private joined(db: ReturnType<TransactionHost['reader']>) {
    return db
      .select({
        question: questions,
        version: questionVersions,
        categoryName: questionCategories.name,
      })
      .from(questions)
      .innerJoin(questionVersions, latestVersionOf())
      .innerJoin(questionCategories, eq(questionCategories.id, questions.categoryId));
  }

  private get client() {
    return this.txHost.client();
  }
}

function latestVersionOf() {
  return and(
    eq(questionVersions.questionId, questions.id),
    eq(questionVersions.version, questions.latestVersion),
  );
}
