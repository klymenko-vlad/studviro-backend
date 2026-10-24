import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  learningActivities,
  questionCategories,
  questions,
  quizSlots,
  type QuestionCategory,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { containsText } from './contains-pattern';

export interface CategoryQuery {
  readonly page: number;
  readonly limit: number;
  readonly q?: string;
}

export interface CategoryRow extends QuestionCategory {
  readonly questionCount: number;
}

@Injectable()
export class QuestionCategoriesRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async page(
    spaceId: string,
    query: CategoryQuery,
  ): Promise<{ categories: CategoryRow[]; total: number }> {
    const where = and(
      eq(questionCategories.learningSpaceId, spaceId),
      isNull(questionCategories.deletedAt),
      containsText([questionCategories.name], query.q),
    );
    const reader = this.txHost.reader();
    const [categories, [counted]] = await Promise.all([
      reader
        .select({
          category: questionCategories,
          questionCount: sql<number>`(
            select count(*)::int from ${questions} as counted
            where counted.category_id = ${questionCategories}.id
              and counted.deleted_at is null
          )`,
        })
        .from(questionCategories)
        .where(where)
        .orderBy(asc(sql`lower(${questionCategories.name})`), asc(questionCategories.createdAt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      reader.select({ total: count() }).from(questionCategories).where(where),
    ]);

    return {
      categories: categories.map((row) => ({
        ...row.category,
        questionCount: row.questionCount,
      })),
      total: counted?.total ?? 0,
    };
  }

  async findLive(spaceId: string, categoryId: string): Promise<QuestionCategory | null> {
    const [row] = await this.client
      .select()
      .from(questionCategories)
      .where(
        and(
          eq(questionCategories.id, categoryId),
          eq(questionCategories.learningSpaceId, spaceId),
          isNull(questionCategories.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findLiveOrFail(spaceId: string, categoryId: string): Promise<QuestionCategory> {
    const row = await this.findLive(spaceId, categoryId);
    if (!row) throw new EntityNotFoundError('question_category', categoryId);

    return row;
  }

  async nameTaken(spaceId: string, name: string, exceptId?: string): Promise<boolean> {
    const [row] = await this.client
      .select({ id: questionCategories.id })
      .from(questionCategories)
      .where(
        and(
          eq(questionCategories.learningSpaceId, spaceId),
          isNull(questionCategories.deletedAt),
          sql`lower(${questionCategories.name}) = lower(${name})`,
          exceptId === undefined ? undefined : ne(questionCategories.id, exceptId),
        ),
      )
      .limit(1);

    return row !== undefined;
  }

  async countQuestions(categoryId: string): Promise<number> {
    const [counted] = await this.client
      .select({ total: count() })
      .from(questions)
      .where(and(eq(questions.categoryId, categoryId), isNull(questions.deletedAt)));

    return counted?.total ?? 0;
  }

  async drawnFromByQuiz(categoryId: string): Promise<boolean> {
    const [row] = await this.client
      .select({ id: quizSlots.id })
      .from(quizSlots)
      .innerJoin(learningActivities, eq(learningActivities.id, quizSlots.learningActivityId))
      .where(and(eq(quizSlots.categoryId, categoryId), isNull(learningActivities.deletedAt)))
      .limit(1);

    return row !== undefined;
  }

  async insert(values: typeof questionCategories.$inferInsert): Promise<QuestionCategory> {
    const [row] = await this.client.insert(questionCategories).values(values).returning();
    if (!row) throw new EntityNotFoundError('learning_space', values.learningSpaceId);

    return row;
  }

  async rename(categoryId: string, name: string): Promise<QuestionCategory> {
    const [row] = await this.client
      .update(questionCategories)
      .set({ name })
      .where(eq(questionCategories.id, categoryId))
      .returning();
    if (!row) throw new EntityNotFoundError('question_category', categoryId);

    return row;
  }

  async tombstone(categoryId: string): Promise<void> {
    await this.client
      .update(questionCategories)
      .set({ deletedAt: new Date() })
      .where(eq(questionCategories.id, categoryId));
  }

  private get client() {
    return this.txHost.client();
  }
}
