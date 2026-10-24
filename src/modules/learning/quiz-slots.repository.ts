import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';

import { EntityNotFoundError } from '../../common/errors/domain.error';
import {
  questionCategories,
  questions,
  questionVersions,
  quizSlots,
  type QuestionType,
  type QuizSlot,
} from '../../database/schema';
import { TransactionHost } from '../../database/transaction.host';

import { containsText } from './contains-pattern';

export interface SlotQuery {
  readonly page: number;
  readonly limit: number;
  readonly q?: string;
}

export interface SlotQuestion {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly type: QuestionType;
  readonly version: number;
}

export interface SlotRow {
  readonly slot: QuizSlot;
  readonly question: SlotQuestion | null;
  readonly categoryName: string | null;
}

export interface BankQuestion {
  readonly id: string;
  readonly defaultMark: string;
}

@Injectable()
export class QuizSlotsRepository {
  constructor(private readonly txHost: TransactionHost) {}

  async page(quizId: string, query: SlotQuery): Promise<{ rows: SlotRow[]; total: number }> {
    const reader = this.txHost.reader();
    const where = and(
      eq(quizSlots.learningActivityId, quizId),
      containsText(
        [questionVersions.name, questionVersions.text, questionCategories.name],
        query.q,
      ),
    );
    const [rows, [counted]] = await Promise.all([
      withBank(
        reader
          .select({
            slot: quizSlots,
            questionId: questions.id,
            type: questions.type,
            version: questionVersions.version,
            name: questionVersions.name,
            text: questionVersions.text,
            categoryName: questionCategories.name,
          })
          .from(quizSlots)
          .$dynamic(),
      )
        .where(where)
        .orderBy(asc(quizSlots.position), asc(quizSlots.createdAt))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      withBank(reader.select({ total: count() }).from(quizSlots).$dynamic()).where(where),
    ]);

    return {
      rows: rows.map((row) => ({
        slot: row.slot,
        categoryName: row.categoryName,
        question:
          row.questionId === null || row.type === null || row.version === null
            ? null
            : {
                id: row.questionId,
                name: row.name ?? '',
                text: row.text ?? '',
                type: row.type,
                version: row.version,
              },
      })),
      total: counted?.total ?? 0,
    };
  }

  async all(quizId: string): Promise<QuizSlot[]> {
    return this.client
      .select()
      .from(quizSlots)
      .where(eq(quizSlots.learningActivityId, quizId))
      .orderBy(asc(quizSlots.position), asc(quizSlots.createdAt));
  }

  async findOrFail(quizId: string, slotId: string): Promise<QuizSlot> {
    const [row] = await this.client
      .select()
      .from(quizSlots)
      .where(and(eq(quizSlots.id, slotId), eq(quizSlots.learningActivityId, quizId)))
      .limit(1);
    if (!row) throw new EntityNotFoundError('quiz_slot', slotId);

    return row;
  }

  async bankQuestions(
    spaceId: string,
    questionIds: readonly string[],
  ): Promise<BankQuestion[]> {
    return this.client
      .select({ id: questions.id, defaultMark: questionVersions.defaultMark })
      .from(questions)
      .innerJoin(
        questionVersions,
        and(
          eq(questionVersions.questionId, questions.id),
          eq(questionVersions.version, questions.latestVersion),
        ),
      )
      .where(
        and(
          inArray(questions.id, [...questionIds]),
          eq(questions.learningSpaceId, spaceId),
          isNull(questions.deletedAt),
        ),
      );
  }

  async insert(values: (typeof quizSlots.$inferInsert)[]): Promise<QuizSlot[]> {
    return this.client.insert(quizSlots).values(values).returning();
  }

  async update(slotId: string, changes: Partial<QuizSlot>): Promise<void> {
    await this.client.update(quizSlots).set(changes).where(eq(quizSlots.id, slotId));
  }

  async delete(slotId: string): Promise<void> {
    await this.client.delete(quizSlots).where(eq(quizSlots.id, slotId));
  }

  async renumber(ordered: readonly QuizSlot[]): Promise<void> {
    for (const [position, slot] of ordered.entries()) {
      if (slot.position !== position) await this.update(slot.id, { position });
    }
  }

  private get client() {
    return this.txHost.client();
  }
}

function withBank<T extends PgSelect>(query: T) {
  return query
    .leftJoin(questions, eq(questions.id, quizSlots.questionId))
    .leftJoin(
      questionVersions,
      and(
        eq(questionVersions.questionId, questions.id),
        eq(questionVersions.version, questions.latestVersion),
      ),
    )
    .leftJoin(questionCategories, eq(questionCategories.id, quizSlots.categoryId));
}
